import { Log } from "../util/log"

const log = Log.create({ service: "unix-to-windows-translator" })

/**
 * Interface for translation rules with pattern matching and template substitution
 */
export interface TranslationRule {
  /** Unique identifier for the rule */
  id: string
  /** Priority for rule matching (higher = more specific, processed first) */
  priority: number
  /** Pattern to match against the command (regex or string) */
  pattern: RegExp | string
  /** Template for substitution (can reference capture groups with $1, $2, etc.) */
  template: string
  /** Optional validation function for the matched command */
  validator?: (command: string, matches: RegExpMatchArray | null) => boolean
  /** Optional context-aware transformation */
  contextTransformer?: (command: string, matches: RegExpMatchArray | null, context?: any) => string
  /** Description for debugging/logging */
  description: string
}

/**
 * Strategy interface for different translation approaches
 */
export interface TranslationStrategy {
  name: string
  canHandle(command: string): boolean
  translate(command: string, rules: TranslationRule[], context?: any): string
}

/**
 * Pattern-based translation strategy using regex matching
 */
class PatternTranslationStrategy implements TranslationStrategy {
  name = "pattern"

  canHandle(command: string): boolean {
    return true // This strategy handles all commands
  }

  translate(command: string, rules: TranslationRule[], context?: any): string {
    // Sort rules by priority (highest first)
    const sortedRules = [...rules].sort((a, b) => b.priority - a.priority)

    for (const rule of sortedRules) {
      try {
        const pattern = typeof rule.pattern === "string" ? new RegExp(`^${rule.pattern}$`) : rule.pattern
        const matches = command.match(pattern)

        if (matches) {
          // Run validator if present
          if (rule.validator && !rule.validator(command, matches)) {
            continue
          }

          // Use context transformer if available
          if (rule.contextTransformer) {
            return rule.contextTransformer(command, matches, context)
          }

          // Standard template substitution
          let result = rule.template
          for (let i = 1; i < matches.length; i++) {
            result = result.replace(new RegExp(`\\$${i}`, "g"), matches[i])
          }

          log.debug("Applied translation rule", {
            ruleId: rule.id,
            original: command,
            translated: result,
            description: rule.description,
          })

          return result
        }
      } catch (error) {
        log.warn("Error applying translation rule", {
          ruleId: rule.id,
          command,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // No rule matched, return original command
    return command
  }
}

/**
 * Template Method for consistent translation workflow
 */
abstract class BaseTranslator {
  protected strategies: TranslationStrategy[] = []

  addStrategy(strategy: TranslationStrategy): void {
    this.strategies.push(strategy)
  }

  translate(command: string, context?: any): string {
    // Pre-translation validation
    if (!this.validateCommand(command)) {
      log.warn("Command failed pre-translation validation", { command })
      return command
    }

    // Find appropriate strategy
    const strategy = this.strategies.find((s) => s.canHandle(command))
    if (!strategy) {
      log.debug("No strategy found for command", { command })
      return command
    }

    // Apply translation
    const translated = strategy.translate(command, this.getRules(), context)

    // Post-translation validation
    if (!this.validateTranslation(command, translated)) {
      log.warn("Translation failed post-validation", { command, translated })
      return command
    }

    return translated
  }

  protected abstract getRules(): TranslationRule[]
  protected abstract validateCommand(command: string): boolean
  protected abstract validateTranslation(original: string, translated: string): boolean
}

/**
 * Unix to Windows Command Translator
 * Implements hybrid Pattern + Template Translation architecture
 */
export class UnixToWindowsTranslator extends BaseTranslator {
  private rules: TranslationRule[] = []
  private plugins: Map<string, TranslationRule[]> = new Map()

  constructor() {
    super()
    this.addStrategy(new PatternTranslationStrategy())
    this.initializeCoreRules()
  }

  /**
   * Initialize core command mappings
   */
  private initializeCoreRules(): void {
    const coreRules: TranslationRule[] = [
      // File and directory operations
      {
        id: "pwd",
        priority: 100,
        pattern: /^pwd$/,
        template: "Get-Location",
        description: "Convert pwd to Get-Location",
      },
      {
        id: "ls-basic",
        priority: 95,
        pattern: /^ls$/,
        template: "Get-ChildItem",
        description: "Convert basic ls to Get-ChildItem",
      },
      {
        id: "ls-long",
        priority: 95,
        pattern: /^ls\s+-l(a)?$/,
        template: "Get-ChildItem -Force",
        description: "Convert ls -la to Get-ChildItem -Force",
      },
      {
        id: "cat",
        priority: 90,
        pattern: /^cat\s+(.+)$/,
        template: "Get-Content $1",
        description: "Convert cat to Get-Content",
      },
      {
        id: "mkdir-basic",
        priority: 90,
        pattern: /^mkdir\s+(.+)$/,
        template: "New-Item -ItemType Directory -Force $1",
        description: "Convert mkdir to New-Item",
      },
      {
        id: "rm-file",
        priority: 90,
        pattern: /^rm\s+(.+)$/,
        template: "Remove-Item $1",
        description: "Convert rm to Remove-Item",
      },
      {
        id: "cp",
        priority: 90,
        pattern: /^cp\s+(.+?)\s+(.+)$/,
        template: "Copy-Item $1 $2",
        description: "Convert cp to Copy-Item",
      },
      {
        id: "mv",
        priority: 90,
        pattern: /^mv\s+(.+?)\s+(.+)$/,
        template: "Move-Item $1 $2",
        description: "Convert mv to Move-Item",
      },

      // Text processing
      {
        id: "grep",
        priority: 85,
        pattern: /^grep\s+(.+?)\s+(.+)$/,
        template: "Select-String $1 $2",
        description: "Convert grep to Select-String",
      },
      {
        id: "wc-l",
        priority: 85,
        pattern: /^wc\s+-l\s+(.+)$/,
        template: "(Get-Content $1).Count",
        description: "Convert wc -l to PowerShell line count",
      },

      // System information
      {
        id: "which",
        priority: 90,
        pattern: /^which\s+(.+)$/,
        template: "(Get-Command $1).Source",
        description: "Convert which to Get-Command",
      },
      {
        id: "date",
        priority: 90,
        pattern: /^date$/,
        template: "Get-Date",
        description: "Convert date to Get-Date",
      },

      // Process management
      {
        id: "kill",
        priority: 90,
        pattern: /^kill\s+(\d+)$/,
        template: "Stop-Process -Id $1",
        description: "Convert kill to Stop-Process",
      },
      {
        id: "ps-basic",
        priority: 85,
        pattern: /^ps$/,
        template: "Get-Process",
        description: "Convert ps to Get-Process",
      },

      // Sequences and ranges
      {
        id: "seq",
        priority: 90,
        pattern: /^seq\s+(\d+)\s+(\d+)$/,
        template: "$1..$2",
        description: "Convert seq to PowerShell range",
      },

      // Special paths and variables
      {
        id: "dev-null",
        priority: 100,
        pattern: /\/dev\/null/g,
        template: "$null",
        description: "Convert /dev/null to $null",
      },
      {
        id: "tilde-home",
        priority: 95,
        pattern: /^~/,
        template: "$env:USERPROFILE",
        description: "Convert ~ to $env:USERPROFILE",
      },
      {
        id: "tilde-in-path",
        priority: 90,
        pattern: /(^|\s)~\//g,
        template: "$1$env:USERPROFILE/",
        description: "Convert ~/ in paths to $env:USERPROFILE/",
      },
    ]

    this.rules.push(...coreRules)
  }

  /**
   * Add a custom translation rule
   */
  addRule(rule: TranslationRule): void {
    this.rules.push(rule)
    log.debug("Added custom translation rule", { ruleId: rule.id })
  }

  /**
   * Register a plugin with multiple rules
   */
  registerPlugin(name: string, rules: TranslationRule[]): void {
    this.plugins.set(name, rules)
    this.rules.push(...rules)
    log.info("Registered translation plugin", { pluginName: name, ruleCount: rules.length })
  }

  /**
   * Unregister a plugin
   */
  unregisterPlugin(name: string): void {
    const pluginRules = this.plugins.get(name)
    if (pluginRules) {
      this.rules = this.rules.filter((rule) => !pluginRules.includes(rule))
      this.plugins.delete(name)
      log.info("Unregistered translation plugin", { pluginName: name })
    }
  }

  /**
   * Get all active rules
   */
  protected getRules(): TranslationRule[] {
    return this.rules
  }

  /**
   * Validate command before translation
   */
  protected validateCommand(command: string): boolean {
    if (!command || typeof command !== "string") {
      return false
    }

    const trimmed = command.trim()
    if (trimmed.length === 0) {
      return false
    }

    // Skip commands that are already PowerShell
    if (this.isPowerShellCommand(trimmed)) {
      return false
    }

    return true
  }

  /**
   * Check if command is already PowerShell syntax
   */
  private isPowerShellCommand(command: string): boolean {
    // Common PowerShell indicators
    const psIndicators = [
      /^Get-/,
      /^Set-/,
      /^New-/,
      /^Remove-/,
      /^Copy-/,
      /^Move-/,
      /^Select-/,
      /^\$/, // Variables
      /^foreach/,
      /^if\s*\(/,
      /^function/,
      /\$_\./, // Pipeline objects
      /\|\s*Where-Object/,
      /\|\s*ForEach-Object/,
      /\|\s*Select-Object/,
    ]

    return psIndicators.some((pattern) => pattern.test(command))
  }

  /**
   * Validate translation result
   */
  protected validateTranslation(original: string, translated: string): boolean {
    // Basic validation - ensure translation is not empty and different from original
    if (!translated || translated.trim().length === 0) {
      return false
    }

    // If translation is same as original, it means no rule matched
    if (translated === original) {
      return true // This is acceptable - no translation needed
    }

    // Ensure translated command doesn't contain dangerous patterns
    const dangerousPatterns = [/rm\s+-rf\s+\/$/, /del\s+\/s\s+\/q\s+c:\\windows/, /format\s+c:/, /shutdown\s+\/s/]

    if (dangerousPatterns.some((pattern) => pattern.test(translated.toLowerCase()))) {
      log.warn("Translation contains potentially dangerous pattern", { original, translated })
      return false
    }

    return true
  }

  /**
   * Translate a command with optional context
   */
  translateCommand(command: string, context?: { cwd?: string; shell?: string }): string {
    try {
      const translated = this.translate(command, context)

      if (translated !== command) {
        log.info("Command translated", {
          original: command,
          translated,
          context,
        })
      }

      return translated
    } catch (error) {
      log.error("Translation failed", {
        command,
        error: error instanceof Error ? error.message : String(error),
      })
      return command // Return original on error
    }
  }

  /**
   * Get statistics about rules and translations
   */
  getStats(): { totalRules: number; plugins: string[]; rulesByPriority: Record<number, number> } {
    const rulesByPriority: Record<number, number> = {}
    for (const rule of this.rules) {
      rulesByPriority[rule.priority] = (rulesByPriority[rule.priority] || 0) + 1
    }

    return {
      totalRules: this.rules.length,
      plugins: Array.from(this.plugins.keys()),
      rulesByPriority,
    }
  }
}
