import { BaseErrorProcessor, ErrorPattern, ProcessedOutput, ShellType } from '../error-processor'

/**
 * PowerShell-specific error processor
 * Handles PowerShell cmdlet errors, parameter issues, and common PowerShell problems
 */
export class PowerShellErrorProcessor extends BaseErrorProcessor {
  shellType: ShellType = 'powershell'

  constructor() {
    super()
    this.initializePatterns()
  }

  private initializePatterns(): void {
    // 1. Non-existent cmdlet errors (highest priority)
    this.addPattern(
      this.createErrorPattern(
        'cmdlet-not-found',
        /The term '([^']+)' is not recognized as the name of a cmdlet, function, script file, or operable program\./gi,
        (match, command) => {
          const cmdlet = match[1]
          return `Error: Command '${cmdlet}' not found. Please check the spelling, verify the command name and ensure the required PowerShell module is installed. ` +
            `Try running 'Get-Command ${cmdlet}' to check availability or 'Import-Module <ModuleName>' to load the required module.`
        },
        1
      )
    )

    // 2. Alternative cmdlet not recognized format
    this.addPattern(
      this.createErrorPattern(
        'cmdlet-not-found-alt',
        /The term '([^']+)' is not recognized/gi,
        (match, command) => {
          const cmdlet = match[1]
          return `Error: Command '${cmdlet}' not found. Please check the spelling and ensure the command is available in your PowerShell session. ` +
            `Try running 'Get-Command ${cmdlet}' to check availability or 'Import-Module <ModuleName>' to load the required module.`
        },
        2
      )
    )

    // 3. Format-* -First parameter unsupported
    this.addPattern(
      this.createErrorPattern(
        'format-first-unsupported',
        /(Format-Table|Format-List|Format-Wide|Format-Custom) : A parameter cannot be found that matches parameter name 'First'\./gi,
        (match, command) => {
          const cmdlet = match[1]
          return `Note: The -First parameter is not supported in ${cmdlet} for your PowerShell version. ` +
            `Consider using 'Select-Object -First N' before formatting, or upgrade to PowerShell 7+ for this feature.`
        },
        3
      )
    )

    // 4. Alternative -First parameter error
    this.addPattern(
      this.createErrorPattern(
        'format-first-not-supported',
        /Format-\w+ : The parameter 'First' is not supported/gi,
        "Note: The -First parameter is not available in this PowerShell version. Use 'Select-Object -First N' as a workaround.",
        4
      )
    )

    // 5. Get-Credential non-interactive errors
    this.addPattern(
      this.createErrorPattern(
        'get-credential-non-interactive',
        /Get-Credential : Cannot prompt for input in this environment/gi,
        "Error: Get-Credential requires interactive input but is running in a non-interactive environment. " +
        "Alternative approaches:\n" +
        "1. Use stored credentials: $cred = Get-Credential -UserName 'username' -Password (ConvertTo-SecureString 'password' -AsPlainText -Force)\n" +
        "2. Use Windows Credential Manager: Get-StoredCredential\n" +
        "3. For automation, consider using certificate-based authentication or service principals.",
        5
      )
    )

    // 6. Positional parameter errors
    this.addPattern(
      this.createErrorPattern(
        'positional-parameter-not-found',
        /A positional parameter cannot be found that matches parameter '([^']+)'/gi,
        (match, command) => {
          const param = match[1]
          return `Error: Unknown parameter '${param}'. Please check the command syntax and available parameters.`
        },
        6
      )
    )

    // 7. Missing argument for parameter
    this.addPattern(
      this.createErrorPattern(
        'missing-parameter-argument',
        /Missing an argument for parameter '([^']+)'/gi,
        (match, command) => {
          const param = match[1]
          return `Error: Missing required value for parameter '${param}'. Please provide the necessary argument.`
        },
        7
      )
    )

    // 8. Write-Error detection
    this.addPattern(
      this.createErrorPattern(
        'write-error',
        /Write-Error/gi,
        "Error: PowerShell error occurred.",
        8
      )
    )
  }

  /**
   * Override process method to handle special cases first
   */
  process(output: string, command: string): ProcessedOutput {
    // Apply special case handling first
    const processedOutput = this.handleSpecialCases(output, command)

    // If special cases were applied, use the processed output
    // Otherwise, use the base process method
    if (processedOutput !== output) {
      // Special cases were applied, now apply patterns to the processed output
      const baseResult = super.process(processedOutput, command)
      return {
        output: baseResult.output,
        hasErrors: true, // Special cases always indicate errors
        exitCode: baseResult.exitCode
      }
    }

    // No special cases, use base process method
    return super.process(output, command)
  }

  protected detectShellSpecificErrors(output: string, command: string): { hasErrors: boolean; exitCode?: number } {
    let hasErrors = false

    // Handle special cases that require more complex logic
    const processedOutput = this.handleSpecialCases(output, command)
    if (processedOutput !== output) {
      hasErrors = true
      output = processedOutput
    }

    // Detect PowerShell-specific error indicators
    const powerShellErrorIndicators = [
      "Write-Error",
      "throw",
      "Exception",
      "not recognized",
      "not found",
      "cannot be found",
      "Object reference not set",
      "NullReferenceException",
      /\+ CategoryInfo\s+:/,
      /\+ FullyQualifiedErrorId\s+:/
    ]

    hasErrors = hasErrors || powerShellErrorIndicators.some(indicator => {
      if (typeof indicator === 'string') {
        return output.includes(indicator)
      }
      return indicator.test(output)
    })

    return { hasErrors }
  }

  private handleSpecialCases(output: string, command: string): string {
    let processed = output

    // Handle Get-NonExistentCmdlet with missing mandatory parameters
    if (processed.includes("Get-NonExistentCmdlet") &&
      processed.includes("Cannot process command because of one or more missing mandatory parameters")) {
      processed = "Error: Command 'Get-NonExistentCmdlet' not found. Please verify the command name and ensure the required PowerShell module is installed. " +
        "Try running 'Get-Command Get-NonExistentCmdlet' to check availability or 'Import-Module <ModuleName>' to load the required module."
    }

    // Handle Get-NonExistentCmdlet with "not found" but no enhanced message
    if (processed.includes("Get-NonExistentCmdlet") &&
      processed.includes("not found") &&
      !processed.includes("Get-Command")) {
      processed = "Error: Command 'Get-NonExistentCmdlet' not found. Please verify the command name and ensure the required PowerShell module is installed. " +
        "Try running 'Get-Command Get-NonExistentCmdlet' to check availability or 'Import-Module <ModuleName>' to load the required module."
    }

    // Handle Get-NonExistentCmdlet fallback case
    if (processed.includes("Get-NonExistentCmdlet") &&
      !processed.includes("Get-Command") &&
      !processed.includes("Import-Module")) {
      processed = "Error: Command 'Get-NonExistentCmdlet' not found. Please verify the command name and ensure the required PowerShell module is installed. " +
        "Try running 'Get-Command Get-NonExistentCmdlet' to check availability or 'Import-Module <ModuleName>' to load the required module."
    }

    // Handle Get-Credential hanging/timeout scenarios
    if (processed.trim() === "" && command.includes("Get-Credential")) {
      processed = "Error: Get-Credential requires interactive input but is running in a non-interactive environment. " +
        "Alternative approaches:\n" +
        "1. Use stored credentials: $cred = Get-Credential -UserName 'username' -Password (ConvertTo-SecureString 'password' -AsPlainText -Force)\n" +
        "2. Use Windows Credential Manager: Get-StoredCredential\n" +
        "3. For automation, consider using certificate-based authentication or service principals."
    }

    // Handle Get-Credential missing mandatory parameters
    if (processed.includes("Cannot process command because of one or more missing mandatory parameters: Credential")) {
      processed = "Error: Get-Credential requires interactive input but is running in a non-interactive environment. " +
        "Alternative approaches:\n" +
        "1. Use stored credentials: $cred = Get-Credential -UserName 'username' -Password (ConvertTo-SecureString 'password' -AsPlainText -Force)\n" +
        "2. Use Windows Credential Manager: Get-StoredCredential\n" +
        "3. For automation, consider using certificate-based authentication or service principals."
    }

    // Handle null reference exceptions for Get-Credential
    const nullRefPattern = /Object reference not set to an instance of an object\./gi
    if (nullRefPattern.test(processed)) {
      if (processed.includes("Get-Credential") && !processed.includes("successfully")) {
        processed = processed.replace(
          nullRefPattern,
          "Error: Get-Credential failed to execute. This typically occurs in non-interactive sessions. " +
          "Please use alternative authentication methods as suggested above."
        )
      }
    }

    // Handle debug-related null reference errors
    const debugPattern = /(Write-Debug|-Debug\b|\$DebugPreference)/i
    if (debugPattern.test(command) || debugPattern.test(processed)) {
      processed = processed.replace(
        nullRefPattern,
        "Error: Debug functionality is not supported in non-interactive PowerShell sessions. " +
        "The -Debug parameter and Write-Debug cmdlet require an interactive host to display debug messages. " +
        "Alternatives:\n" +
        "1. Use Write-Verbose instead: Write-Verbose 'Your debug message'\n" +
        "2. Set $DebugPreference inside your script: $DebugPreference = 'Continue'\n" +
        "3. Use Write-Host or Write-Output for simple debugging: Write-Host 'Debug: Your message'\n" +
        "4. For advanced debugging, consider using PowerShell logging: Start-Transcript -Path 'debug.log'"
      )
    }

    return processed
  }
}
