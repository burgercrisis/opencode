import fs from "fs"
import path from "path"
import os from "os"
import { Log } from "../util/log"
import { TempFileManager } from "./temp-file-manager"

const log = Log.create({ service: "here-document-translator" })

/**
 * Here document translator interface for cross-platform here-doc handling
 */
export interface HereDocumentHandler {
  /** Translate here document syntax to platform equivalent */
  translate(content: string): Promise<string>
  /** Check if content contains here documents */
  hasHereDocuments(content: string): boolean
}

/**
 * Factory for creating platform-appropriate here document handlers
 */
export class HereDocumentHandlerFactory {
  static create(): HereDocumentHandler {
    return process.platform === "win32" ? new WindowsHereDocumentHandler() : new UnixHereDocumentHandler()
  }
}

/**
 * Windows here document handler using PowerShell here-strings or temp files
 */
class WindowsHereDocumentHandler implements HereDocumentHandler {
  private tempFileManager: TempFileManager

  constructor() {
    this.tempFileManager = new TempFileManager()
  }

  async translate(content: string): Promise<string> {
    // Handle Unix here documents (<<EOF ... EOF)
    const hereDocRegex = /<<-?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\n([\s\S]*?)\n\1\s*$/gm

    let result = content
    let match

    while ((match = hereDocRegex.exec(content)) !== null) {
      const [fullMatch, delimiter, hereDocContent] = match

      try {
        // Create a temporary file with the here document content
        const tempFilePath = await this.tempFileManager.create(hereDocContent)

        // Replace the here document with PowerShell Get-Content command
        const replacement = `Get-Content "${tempFilePath}"`
        result = result.replace(fullMatch, replacement)

        log.debug("Translated here document to temp file", {
          delimiter,
          tempFile: tempFilePath,
          contentLength: hereDocContent.length,
        })
      } catch (error) {
        log.error("Failed to create temp file for here document", { error })
        // Fallback: use here-string syntax
        const hereString = `@'
${hereDocContent}
'@`
        result = result.replace(fullMatch, hereString)
      }
    }

    return result
  }

  hasHereDocuments(content: string): boolean {
    const hereDocRegex = /<<-?\s*[A-Za-z_][A-Za-z0-9_]*\s*\n[\s\S]*?\n[A-Za-z_][A-Za-z0-9_]*\s*$/gm
    return hereDocRegex.test(content)
  }
}

/**
 * Unix here document handler (pass-through, already supported)
 */
class UnixHereDocumentHandler implements HereDocumentHandler {
  async translate(content: string): Promise<string> {
    // Unix shells already support here documents natively
    // Just return the content as-is
    return content
  }

  hasHereDocuments(content: string): boolean {
    const hereDocRegex = /<<-?\s*[A-Za-z_][A-Za-z0-9_]*\s*\n[\s\S]*?\n[A-Za-z_][A-Za-z0-9_]*\s*$/gm
    return hereDocRegex.test(content)
  }
}
