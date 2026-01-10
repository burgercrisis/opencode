import { Log } from "../util/log"

const log = Log.create({ service: "unicode-handler" })

/**
 * UnicodeHandler provides comprehensive Unicode support for cross-platform command execution.
 * Ensures UTF-8 encoding, handles emoji and special characters, and normalizes text.
 */
export class UnicodeHandler {
  private static instance: UnicodeHandler | null = null
  private decoder: TextDecoder
  private encoder: TextEncoder

  constructor() {
    // Use UTF-8 encoding consistently across platforms
    this.decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
    this.encoder = new TextEncoder()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): UnicodeHandler {
    if (!this.instance) {
      this.instance = new UnicodeHandler()
    }
    return this.instance
  }

  /**
   * Decode buffer to string with Unicode support
   */
  decode(buffer: Buffer | Uint8Array | ArrayBuffer): string {
    try {
      let data: Uint8Array

      if (buffer instanceof Buffer) {
        data = new Uint8Array(buffer)
      } else if (buffer instanceof Uint8Array) {
        data = buffer
      } else if (buffer instanceof ArrayBuffer) {
        data = new Uint8Array(buffer)
      } else {
        throw new Error("Unsupported buffer type")
      }

      // Try UTF-8 first
      try {
        return this.decoder.decode(data)
      } catch (utf8Error) {
        log.warn("UTF-8 decoding failed, attempting fallback", { error: utf8Error })

        // Fallback: try other encodings
        return this.fallbackDecode(data)
      }
    } catch (error) {
      log.error("Unicode decoding failed", { error })
      // Final fallback: return as-is with replacement characters
      const uint8Data = buffer instanceof Buffer ? new Uint8Array(buffer) :
                       buffer instanceof Uint8Array ? buffer :
                       new Uint8Array(buffer)
      return String.fromCharCode(...Array.from(uint8Data)).replace(/[\x00-\x1F\x7F-\x9F]/g, "�")
    }
  }

  /**
   * Encode string to UTF-8 buffer
   */
  encode(text: string): Uint8Array {
    try {
      return this.encoder.encode(text)
    } catch (error) {
      log.error("Unicode encoding failed", { error, text: text.slice(0, 100) })
      // Fallback: encode as UTF-8 with replacement
      return this.encoder.encode(text.replace(/[\uD800-\uDFFF]/g, "�"))
    }
  }

  /**
   * Normalize Unicode text (NFC - Canonical Composition)
   */
  normalize(text: string): string {
    try {
      return text.normalize("NFC")
    } catch (error) {
      log.warn("Unicode normalization failed", { error })
      return text
    }
  }

  /**
   * Validate Unicode string and fix common issues
   */
  validateAndFix(text: string): string {
    try {
      // Check for invalid UTF-16 surrogates
      if (/[\uD800-\uDFFF]/.test(text) && !this.isValidSurrogatePair(text)) {
        log.warn("Invalid Unicode surrogates detected, fixing")
        text = text.replace(/[\uD800-\uDFFF]/g, "�")
      }

      // Normalize line endings (Windows CRLF to Unix LF)
      text = text.replace(/\r\n/g, "\n")

      // Handle zero-width characters that might cause issues
      text = this.removeProblematicZWChars(text)

      // Validate emoji and special characters
      text = this.validateEmoji(text)

      return this.normalize(text)
    } catch (error) {
      log.error("Unicode validation failed", { error })
      return text.replace(/[\x00-\x1F\x7F-\x9F]/g, "�")
    }
  }

  /**
   * Check if text contains valid Unicode characters
   */
  isValidUnicode(text: string): boolean {
    try {
      // Check for null bytes
      if (text.includes("\0")) return false

      // Check for invalid UTF-16
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        if (code >= 0xd800 && code <= 0xdfff) {
          // Check if it's a valid surrogate pair
          if (code >= 0xdc00) return false // Low surrogate without high
          if (i + 1 >= text.length || text.charCodeAt(i + 1) < 0xdc00 || text.charCodeAt(i + 1) > 0xdfff) {
            return false // High surrogate not followed by low
          }
          i++ // Skip the low surrogate
        }
      }

      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Detect encoding of a buffer (basic detection)
   */
  detectEncoding(buffer: Buffer | Uint8Array): "utf8" | "utf16le" | "utf16be" | "unknown" {
    const data = buffer instanceof Buffer ? buffer : Buffer.from(buffer)

    // Check for BOM
    if (data.length >= 3) {
      if (data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) return "utf8" // UTF-8 BOM
      if (data[0] === 0xfe && data[1] === 0xff) return "utf16be" // UTF-16 BE BOM
      if (data[0] === 0xff && data[1] === 0xfe) return "utf16le" // UTF-16 LE BOM
    }

    // Basic heuristic: check for null bytes indicating UTF-16
    let nullCount = 0
    for (let i = 0; i < Math.min(data.length, 1000); i++) {
      if (data[i] === 0) nullCount++
    }

    if (nullCount > data.length * 0.1) {
      return "utf16le" // Likely UTF-16
    }

    // Default to UTF-8
    return "utf8"
  }

  /**
   * Convert text to safe representation for command execution
   */
  escapeForShell(text: string, shell: "powershell" | "cmd" | "bash"): string {
    // First validate and fix the text
    text = this.validateAndFix(text)

    switch (shell) {
      case "powershell":
        return this.escapeForPowerShell(text)
      case "cmd":
        return this.escapeForCmd(text)
      case "bash":
        return this.escapeForBash(text)
      default:
        return text.replace(/["\\$`]/g, "\\$&")
    }
  }

  /**
   * Get Unicode character information
   */
  getUnicodeInfo(text: string): Array<{
    char: string
    codePoint: number
    name: string
    category: string
  }> {
    const info = []
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const codePoint = text.codePointAt(i)!

      // Skip if this is part of a surrogate pair
      if (codePoint > 0xffff) i++

      info.push({
        char,
        codePoint,
        name: this.getUnicodeName(codePoint),
        category: this.getUnicodeCategory(codePoint),
      })
    }
    return info
  }

  private fallbackDecode(data: Uint8Array): string {
    // Try Windows-1252 (common fallback for Windows)
    try {
      const win1252 = new TextDecoder("windows-1252", { fatal: false })
      return win1252.decode(data)
    } catch {
      // Try latin1
      try {
        const latin1 = new TextDecoder("latin1", { fatal: false })
        return latin1.decode(data)
      } catch {
        // Final fallback: replace invalid characters
        return new TextDecoder("utf-8", { fatal: false }).decode(data)
      }
    }
  }

  private isValidSurrogatePair(text: string): boolean {
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      if (code >= 0xd800 && code <= 0xdbff) {
        // High surrogate - check next character
        if (i + 1 >= text.length) return false
        const nextCode = text.charCodeAt(i + 1)
        if (nextCode < 0xdc00 || nextCode > 0xdfff) return false
        i++ // Skip low surrogate
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        // Lone low surrogate
        return false
      }
    }
    return true
  }

  private removeProblematicZWChars(text: string): string {
    // Remove zero-width characters that can cause issues
    return text
      .replace(/[\u200B-\u200F\u2028-\u202F\u205F-\u206F]/g, "") // Various zero-width chars
      .replace(/\uFEFF/g, "") // Zero-width no-break space (BOM)
  }

  private validateEmoji(text: string): string {
    // Basic emoji validation - ensure proper encoding
    return text.replace(/[\uD83C-\uD83E][\uDC00-\uDFFF]/g, (match) => {
      // Validate that this is a proper emoji sequence
      try {
        const encoded = this.encoder.encode(match)
        const decoded = this.decoder.decode(encoded)
        return decoded === match ? match : "�"
      } catch {
        return "�"
      }
    })
  }

  private escapeForPowerShell(text: string): string {
    // PowerShell escaping for special characters
    return text
      .replace(/`/g, "``")
      .replace(/"/g, '`"')
      .replace(/\$/g, "`$")
      .replace(/\(/g, "`(")
      .replace(/\)/g, "`)")
      .replace(/\{/g, "`{")
      .replace(/\}/g, "`}")
      .replace(/\[/g, "`[")
      .replace(/\]/g, "`]")
  }

  private escapeForCmd(text: string): string {
    // CMD escaping - minimal escaping needed for most Unicode
    return text.replace(/"/g, '\\"').replace(/%/g, "%%").replace(/\^/g, "^^")
  }

  private escapeForBash(text: string): string {
    // Bash escaping
    return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/`/g, "\\`").replace(/\$/g, "\\$")
  }

  private getUnicodeName(codePoint: number): string {
    // Basic Unicode name lookup (simplified)
    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      return "Basic Latin"
    }
    if (codePoint >= 0xc0 && codePoint <= 0xff) {
      return "Latin-1 Supplement"
    }
    if (codePoint >= 0x100 && codePoint <= 0x17f) {
      return "Latin Extended-A"
    }
    if (codePoint >= 0x1f600 && codePoint <= 0x1f64f) {
      return "Emoticons"
    }
    if (codePoint >= 0x1f300 && codePoint <= 0x1f5ff) {
      return "Misc Symbols and Pictographs"
    }
    return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`
  }

  private getUnicodeCategory(codePoint: number): string {
    // Unicode category detection (simplified)
    if (codePoint >= 0x30 && codePoint <= 0x39) return "Number"
    if ((codePoint >= 0x41 && codePoint <= 0x5a) || (codePoint >= 0x61 && codePoint <= 0x7a)) return "Letter"
    if (codePoint >= 0x1f600 && codePoint <= 0x1f64f) return "Emoji"
    if (codePoint <= 0x1f) return "Control"
    if (codePoint >= 0x20 && codePoint <= 0x7e) return "Punctuation/Symbol"
    return "Other"
  }
}

// Export singleton instance
export const unicodeHandler = UnicodeHandler.getInstance()
