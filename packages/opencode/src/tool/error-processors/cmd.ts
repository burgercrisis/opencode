import { BaseErrorProcessor, ErrorPattern, ProcessedOutput, ShellType } from '../error-processor'

/**
 * CMD-specific error processor
 * Handles CMD command errors, variable expansion issues, and Windows-specific problems
 */
export class CmdErrorProcessor extends BaseErrorProcessor {
  shellType: ShellType = 'cmd'

  constructor() {
    super()
    this.initializePatterns()
  }

  private initializePatterns(): void {
    // 1. Command not recognized errors (highest priority)
    this.addPattern(
      this.createErrorPattern(
        'command-not-recognized',
        /'([^']+)' is not recognized as an internal or external command, operable program or batch file\./gi,
        (match, command) => {
          const cmd = match[1]
          return `Error: Command '${cmd}' not found. Please check the spelling and ensure the command is available in your PATH.`
        },
        1
      )
    )

    // 2. Alternative command not recognized format
    this.addPattern(
      this.createErrorPattern(
        'command-not-recognized-alt',
        /'([^']+)' is not recognized/gi,
        (match, command) => {
          const cmd = match[1]
          return `Error: Command '${cmd}' not found. Please check the spelling and ensure the command is available in your PATH.`
        },
        2
      )
    )

    // 3. Another alternative format
    this.addPattern(
      this.createErrorPattern(
        'command-not-recognized-alt2',
        /is not recognized as the name of a cmdlet/gi,
        (match, command) => {
          return `Error: Command not found. Please check the spelling and ensure the command is available in your PATH.`
        },
        3
      )
    )

    // 4. Path not found errors
    this.addPattern(
      this.createErrorPattern(
        'path-not-found',
        /The system cannot find the path specified/gi,
        "Error: The specified path does not exist. Please check the path and try again.",
        4
      )
    )

    // 5. File not found errors
    this.addPattern(
      this.createErrorPattern(
        'file-not-found',
        /The system cannot find the file specified/gi,
        "Error: The specified file does not exist. Please check the filename and path.",
        5
      )
    )

    // 6. Access denied errors
    this.addPattern(
      this.createErrorPattern(
        'access-denied',
        /Access is denied/gi,
        "Error: Access denied. You may not have sufficient permissions to perform this operation.",
        6
      )
    )
  }

  protected detectShellSpecificErrors(output: string, command: string): { hasErrors: boolean; exitCode?: number } {
    let hasErrors = false
    let exitCode: number | undefined

    // Handle variable expansion quote artifacts
    const processedOutput = this.handleVariableExpansion(output, command)
    if (processedOutput !== output) {
      output = processedOutput
    }

    // Check for standard CMD error indicators
    const cmdErrorIndicators = [
      'not recognized',
      'cannot find',
      'access is denied',
      'invalid parameter',
      'syntax error',
      'file not found',
      'directory not found'
    ]

    hasErrors = cmdErrorIndicators.some(indicator =>
      output.toLowerCase().includes(indicator.toLowerCase())
    )

    // Set specific exit codes for known error types
    // Check both original and processed output
    const checkText = output.toLowerCase()
    if (checkText.includes('not recognized')) {
      exitCode = 9009 // Standard CMD exit code for command not found
    } else if (checkText.includes('cannot find the path specified')) {
      exitCode = 1
    } else if (checkText.includes('access is denied')) {
      exitCode = 5
    }

    return { hasErrors, exitCode }
  }

  private handleVariableExpansion(output: string, command: string): string {
    // Check if command contains variables that might cause quote artifacts
    const hasVariables = /%[^%]+%/g.test(command)

    if (hasVariables) {
      // Remove trailing quote artifact from variable expansion
      return output.replace(/"$/, "")
    }

    return output
  }

  /**
   * Process CMD output with special handling for variable expansion
   */
  process(output: string, command: string): ProcessedOutput {
    // First handle variable expansion artifacts
    const cleanedOutput = this.handleVariableExpansion(output, command)

    // Then use the base processing
    const result = super.process(cleanedOutput, command)

    return result
  }
}
