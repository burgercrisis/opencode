/**
 * Shared BurgerCode logo definitions to eliminate code duplication
 * across CLI and desktop components
 *
 * ## Logo Structure
 * The logo consists of two string arrays (`left` and `right`) that must:
 * - Have equal lengths for proper side-by-side rendering
 * - Contain only valid displayable characters
 * - Use UTF-8 encoding for special characters (▄, etc.)
 *
 * ## Character Encoding Requirements
 * - Uses UTF-8 encoding for proper display of box-drawing characters
 * - May contain special Unicode characters like ▄ (U+2584 LOWER HALF BLOCK)
 * - Shadow markers (_, ^, ~) are required in the right logo array for visual consistency
 *
 * ## Rendering Guidelines
 * - Left and right arrays should be rendered side-by-side
 * - Line height alignment is critical for visual consistency
 * - Terminal must support UTF-8 and Unicode box-drawing characters
 * - Recommended minimum terminal width: 160 characters
 *
 * ## Usage
 * This logo is shared between CLI and desktop applications to ensure
 * consistent branding across all OpenCode interfaces.
 */

export interface BurgercodeLogo {
  left: string[]
  right: string[]
}

// Validation constants
const MAX_LOGO_LINES = 100
const MAX_LINE_LENGTH = 500
const UNICODE_BOX_DRAWING_START = 0x2500
const UNICODE_BOX_DRAWING_END = 0x259F

// Validate logo structure at runtime
export function validateLogoStructure(logo: BurgercodeLogo): void {
  if (!logo) {
    throw new Error('Logo cannot be null or undefined')
  }

  if (!logo.left || !logo.right) {
    throw new Error('Logo must have both left and right arrays')
  }

  if (!Array.isArray(logo.left) || !Array.isArray(logo.right)) {
    throw new Error('Logo left and right must be arrays')
  }

  if (logo.left.length !== logo.right.length) {
    throw new Error(`Logo arrays must have equal length. Left: ${logo.left.length}, Right: ${logo.right.length}`)
  }

  if (logo.left.length === 0) {
    throw new Error('Logo arrays cannot be empty')
  }

  if (logo.left.length > MAX_LOGO_LINES) {
    throw new Error(`Logo arrays too large: ${logo.left.length} lines exceeds maximum ${MAX_LOGO_LINES}`)
  }

  // Validate that shadow markers are present for visual consistency
  // These markers (_, ^, ~) provide depth in the logo rendering
  // The marks constant documents these characters for reference
  const hasShadowMarkers = logo.left.some(line =>
    line.includes('_') || line.includes('^') || line.includes('~')
  ) || logo.right.some(line =>
    line.includes('_') || line.includes('^') || line.includes('~')
  )

  if (!hasShadowMarkers) {
    throw new Error('Logo must contain ASCII shadow markers (_, ^, ~) for visual consistency as documented')
  }

  // Validate that all elements are strings
  if (!logo.left.every(line => typeof line === 'string') ||
    !logo.right.every(line => typeof line === 'string')) {
    throw new Error('All logo lines must be strings')
  }

  // Validate character encoding and content
  logo.left.forEach((line, index) => {
    validateLogoCharacters(line, index, 'left')
  })
  logo.right.forEach((line, index) => {
    validateLogoCharacters(line, index, 'right')
  })
}

// Validate individual characters in logo lines
export function validateLogoCharacters(line: string, lineIndex?: number, side?: string): void {
  if (typeof line !== 'string') {
    let locationInfo = ''
    if (side && lineIndex !== undefined) {
      locationInfo = ` (at ${side}[${lineIndex}])`
    } else if (side) {
      locationInfo = ` (in ${side} array)`
    } else if (lineIndex !== undefined) {
      locationInfo = ` (at index ${lineIndex})`
    }
    throw new Error(`Logo line must be a string, got ${typeof line}${locationInfo}`)
  }
  // Check for valid UTF-8 encoding using TextEncoder if available
  try {
    // Use TextEncoder for proper UTF-8 validation if available
    const TextEncoderConstructor = (globalThis as any).TextEncoder
    if (TextEncoderConstructor) {
      new TextEncoderConstructor().encode(line)
    } else {
      // Fallback: use encodeURIComponent to detect invalid UTF-16 surrogate pairs
      // This catches some UTF-8 encoding issues in environments without TextEncoder
      encodeURIComponent(line)
    }
  } catch (error) {
    const truncatedLine = line.length > 50 ? line.substring(0, 50) + '...' : line
    throw new Error(`Logo line contains invalid UTF-8 encoding: ${truncatedLine}`)
  }

  // Check for displayable characters only
  for (let i = 0; i < line.length; i++) {
    const charCode = line.charCodeAt(i)

    // Allow printable ASCII (32-126), tab (9), newline (10), and Unicode special characters
    const isPrintableASCII = charCode >= 32 && charCode <= 126
    const isTab = charCode === 9
    const isNewline = charCode === 10
    const isUnicodeSpecial = charCode >= UNICODE_BOX_DRAWING_START && charCode <= UNICODE_BOX_DRAWING_END

    if (!isPrintableASCII && !isTab && !isNewline && !isUnicodeSpecial) {
      throw new Error(`Logo line contains non-displayable character (U+${charCode.toString(16).toUpperCase()}): ${line}`)
    }
  }
}

// Validate logo content quality to prevent rendering issues
export function validateLogoContent(logo: BurgercodeLogo): void {
  [logo.left, logo.right].forEach((array, arrayIndex) => {
    const side = arrayIndex === 0 ? 'left' : 'right';
    array.forEach((line, lineIndex) => {
      // Validate characters first for comprehensive error reporting
      validateLogoCharacters(line, lineIndex, side)

      // Allow whitespace-only lines for alignment, but reject completely empty strings
      if (line.length === 0) {
        throw new Error(`Logo ${side} line ${lineIndex} cannot be completely empty`)
      }

      // Check for excessively long lines that could cause display issues
      if (line.length > MAX_LINE_LENGTH) {
        throw new Error(`Logo ${side} line ${lineIndex} is too long: ${line.length} characters (max: ${MAX_LINE_LENGTH})`)
      }
    });
  });
}

export const burgercodeLogo: BurgercodeLogo = {
  left: [
    "                   ",
    "                    ___           ___           ___           ___           ___          _____          ___     ",
    "     _____         /__\\         /  /\\         /  /\\         /  /\\         /  /\\        /  /::\\        /  /\\    ",
    "    /  /::\\        \\  \\:\\       /  /::\\       /  /:/_       /  /:/_       /  /::\\       /  /:/        /  /::\\      /  /:/_   ",
    "   /  /:/\\:\\        \\  \\:\\     /  /:/\\:\\     /  /:/ /\\     /  /:/ /\\     /  /:/\\:\\     /  /:/        /  /:/\\:\\    /  /:/  \\:\\    /  /:/ /\\  ",
    "    \\  \\:\\/:/       \\  \\:\\/:/     \\  \\:\\        \\  \\:\\/:/     \\  \\:\\/:/     \\  \\:\\        \\  \\:\\/:/     \\  \\:\\/:/      \\  \\:\\/      \\  \\:\\/:/  ",
    "     \\  \\:\\/         \\  \\:\\/       \\  \\:\\        \\  \\:\\/       \\  \\:\\/       \\  \\:\\        \\  \\:\\/       \\  \\:\\/        \\__\\/        \\  \\:\\/   ",
    "      \\__\\/           \\__\\/         \\__\\/         \\__\\/         \\__\\/         \\__\\/         \\__\\/         \\__\\/                       \\__\\/    "
  ],
  right: [
    "             ▄     ",
    "   /  /:/~/::\\   ___  \\  \\:\\   /  /:/~/:/    /  /:/_/::\\   /  /:/ /:/_   /  /:/~/:/    /  /:/  ___   /  /:/  \\:\\  /__/:/ \\__\\:|  /  /:/ /:/_ ",
    " /__/:/ /:/\\:| /__/\\  \\__\\:\\ /__/:/ /:/___ /__/:/__\\/\\ /__/:/ /:/ /\\ /__/:/ /:/___ /__/:/  /  /\\ /__/:/ \\__\\:\\ \\  \\:\\ /  /:/ /__/:/ /:/ /\\",
    " \\  \\:\\/:/~/:/ \\  \\:\\ /  /:/ \\  \\:\\/:::::/ \\  \\:\\ /~~/:/ \\  \\:\\/:/ /:/ \\  \\:\\ /  /:/ \\  \\:\\  /:/ \\  \\:\\/:/ /:/",
    "  \\  \\:\\ /:/   \\  \\:\\  /:/   \\  \\:\\/~~~~   \\  \\:\\  /:/   \\  \\:\\ /:/   \\  \\:\\/~~~~   \\  \\:\\  /:/   \\  \\:\\  /:/    \\  \\:\\/:/    \\  \\:\\ /:/ ",
    "   \\  \\:\\/:/     \\  \\:\\/:/     \\  \\:\\        \\  \\:\\/:/     \\  \\:\\/:/     \\  \\:\\        \\  \\:\\/:/     \\  \\:\\/:/      \\  \\:\\/      \\  \\:\\/:/  ",
    "    \\  \\:\\/       \\  \\:\\/       \\  \\:\\        \\  \\:\\/       \\  \\:\\/       \\  \\:\\        \\  \\:\\/       \\  \\:\\/        \\__\\/        \\  \\:\\/   ",
    "     \\__\\/         \\__\\/         \\__\\/         \\__\\/         \\__\\/         \\__\\/         \\__\\/         \\__\\/                       \\__\\/    "
  ]
}

// Validate the logo structure and content immediately
const validationErrors: string[] = []

try {
  validateLogoStructure(burgercodeLogo)
} catch (error) {
  validationErrors.push(`Structure validation failed: ${error instanceof Error ? error.message : String(error)}`)
}

try {
  validateLogoContent(burgercodeLogo)
} catch (error) {
  validationErrors.push(`Content validation failed: ${error instanceof Error ? error.message : String(error)}`)
}

if (validationErrors.length > 0) {
  throw new Error(`Logo validation failed:\n${validationErrors.join('\n')}`)
}

/**
 * ASCII characters used for shadow markers in the logo.
 * - `_` (full shadow)
 * - `^` (top shadow)
 * - `~` (bottom shadow)
 */
export const marks = "_^~"
