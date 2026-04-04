import { BaseErrorProcessor, ErrorPattern, ProcessedOutput, ShellType } from '../error-processor'

/**
 * Bash/Unix shell error processor
 * Handles bash, sh, zsh, and other Unix-like shell errors
 */
export class BashErrorProcessor extends BaseErrorProcessor {
  shellType: ShellType = 'bash'

  constructor() {
    super()
    this.initializePatterns()
  }

  private initializePatterns(): void {
    // 1. Command not found errors (highest priority)
    this.addPattern(
      this.createErrorPattern(
        'command-not-found',
        /([^:]+): command not found/gi,
        (match, command) => {
          const cmd = match[1]
          return `Error: Command '${cmd}' not found. Please check the spelling and ensure the command is available in your PATH.`
        },
        1
      )
    )

    // 2. Alternative command not found format
    this.addPattern(
      this.createErrorPattern(
        'command-not-found-alt',
        /bash: ([^:]+): command not found/gi,
        (match, command) => {
          const cmd = match[1]
          return `Error: Command '${cmd}' not found. Please check the spelling and ensure the command is installed.`
        },
        2
      )
    )

    // 3. Permission denied errors (more specific to avoid conflicts)
    this.addPattern(
      this.createErrorPattern(
        'permission-denied',
        /^Permission denied$/gi,
        "Error: Permission denied. You may need to use 'sudo' or check file permissions.",
        3
      )
    )

    // 4. No such file or directory
    this.addPattern(
      this.createErrorPattern(
        'no-such-file',
        /No such file or directory/gi,
        "Error: The specified file or directory does not exist. Please check the path.",
        4
      )
    )

    // 5. Syntax errors
    this.addPattern(
      this.createErrorPattern(
        'syntax-error',
        /syntax error near unexpected token/gi,
        "Error: Syntax error in command. Please check the command syntax and quoting.",
        5
      )
    )

    // 6. Operation not permitted
    this.addPattern(
      this.createErrorPattern(
        'operation-not-permitted',
        /Operation not permitted/gi,
        "Error: Operation not permitted. You may need different permissions or privileges.",
        6
      )
    )
  }

  protected detectShellSpecificErrors(output: string, command: string): { hasErrors: boolean; exitCode?: number } {
    let hasErrors = false
    let exitCode: number | undefined

    // Common Unix error indicators
    const unixErrorIndicators = [
      'command not found',
      'permission denied',
      'no such file or directory',
      'syntax error',
      'operation not permitted',
      'cannot open',
      'is a directory',
      'not a directory',
      'file exists',
      'already exists'
    ]

    hasErrors = unixErrorIndicators.some(indicator =>
      output.toLowerCase().includes(indicator.toLowerCase())
    )

    // Set specific exit codes for known error types
    // Check both original and processed output
    const checkText = output.toLowerCase()
    if (checkText.includes('command not found')) {
      exitCode = 127 // Standard exit code for command not found
    } else if (checkText.includes('permission denied')) {
      exitCode = 126 // Standard exit code for permission/command not executable
    } else if (checkText.includes('no such file or directory')) {
      exitCode = 2 // Standard exit code for no such file or directory
    } else if (checkText.includes('syntax error')) {
      exitCode = 2 // Syntax errors typically exit with code 2
    }

    return { hasErrors, exitCode }
  }
}

/**
 * ZSH-specific error processor
 * Extends BashErrorProcessor with ZSH-specific error patterns
 */
export class ZshErrorProcessor extends BashErrorProcessor {
  shellType: ShellType = 'zsh'

  constructor() {
    super()
    this.addZshPatterns()
  }

  private addZshPatterns(): void {
    // ZSH-specific command not found format (highest priority)
    this.addPattern(
      this.createErrorPattern(
        'zsh-command-not-found',
        /zsh: command not found: (.+)/gi,
        (match, command) => {
          const cmd = match[1]
          return `Error: Command '${cmd}' not found. Please check the spelling and ensure the command is installed.`
        },
        0
      )
    )

    // ZSH-specific permission error (high priority)
    this.addPattern(
      this.createErrorPattern(
        'zsh-permission-denied',
        /zsh: permission denied: (.+)/gi,
        (match, command) => {
          const file = match[1]
          return `Error: Permission denied for '${file}'. You may need to check file permissions or use different privileges.`
        },
        1
      )
    )

    // ZSH bad option
    this.addPattern(
      this.createErrorPattern(
        'zsh-bad-option',
        /zsh: bad option: (.+)/gi,
        (match, command) => {
          const option = match[1]
          return `Error: Invalid option '${option}'. Please check the command options and syntax.`
        },
        3
      )
    )
  }
}

/**
 * Fish shell error processor
 * Handles Fish-specific error patterns
 */
export class FishErrorProcessor extends BaseErrorProcessor {
  shellType: ShellType = 'fish'

  constructor() {
    super()
    this.initializePatterns()
  }

  private initializePatterns(): void {
    // Fish command not found
    this.addPattern(
      this.createErrorPattern(
        'fish-command-not-found',
        /fish: Unknown command: (.+)/gi,
        (match, command) => {
          const cmd = match[1]
          return `Error: Command '${cmd}' not found. Please check the spelling and ensure the command is installed.`
        },
        1
      )
    )

    // Fish permission denied
    this.addPattern(
      this.createErrorPattern(
        'fish-permission-denied',
        /fish: Permission denied/gi,
        "Error: Permission denied. You may need to check file permissions or use different privileges.",
        2
      )
    )

    // Fish file not found
    this.addPattern(
      this.createErrorPattern(
        'fish-file-not-found',
        /fish: The file .+ does not exist/gi,
        "Error: The specified file does not exist. Please check the path and filename.",
        3
      )
    )

    // Fish syntax error
    this.addPattern(
      this.createErrorPattern(
        'fish-syntax-error',
        /fish: Syntax error/gi,
        "Error: Syntax error in command. Please check the command syntax and quoting.",
        4
      )
    )
  }

  protected detectShellSpecificErrors(output: string, command: string): { hasErrors: boolean; exitCode?: number } {
    let hasErrors = false
    let exitCode: number | undefined

    // Fish-specific error indicators
    const fishErrorIndicators = [
      'unknown command',
      'permission denied',
      'does not exist',
      'syntax error',
      'cannot open'
    ]

    hasErrors = fishErrorIndicators.some(indicator =>
      output.toLowerCase().includes(indicator.toLowerCase())
    )

    // Set exit codes based on error type
    if (output.includes('unknown command')) {
      exitCode = 127
    } else if (output.includes('permission denied')) {
      exitCode = 126
    } else if (output.includes('does not exist')) {
      exitCode = 2
    }

    return { hasErrors, exitCode }
  }
}
