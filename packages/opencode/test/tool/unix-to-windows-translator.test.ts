import { describe, it, expect, beforeEach, vi } from "bun:test"
import { UnixToWindowsTranslator, TranslationRule } from "../../src/tool/unix-to-windows-translator"

describe("UnixToWindowsTranslator", () => {
  let translator: UnixToWindowsTranslator

  beforeEach(() => {
    translator = new UnixToWindowsTranslator()
  })

  describe("constructor", () => {
    it("should initialize with core rules", () => {
      const stats = translator.getStats()
      expect(stats.totalRules).toBeGreaterThan(0)
      expect(stats.plugins).toEqual([])
    })
  })

  describe("translateCommand", () => {
    it("should translate pwd to Get-Location", () => {
      const result = translator.translateCommand("pwd")
      expect(result).toBe("Get-Location")
    })

    it("should translate ls to Get-ChildItem", () => {
      const result = translator.translateCommand("ls")
      expect(result).toBe("Get-ChildItem")
    })

    it("should translate ls -la to Get-ChildItem -Force", () => {
      const result = translator.translateCommand("ls -la")
      expect(result).toBe("Get-ChildItem -Force")
    })

    it("should translate cat with file argument", () => {
      const result = translator.translateCommand("cat file.txt")
      expect(result).toBe("Get-Content file.txt")
    })

    it("should translate mkdir with directory argument", () => {
      const result = translator.translateCommand("mkdir testdir")
      expect(result).toBe("New-Item -ItemType Directory -Force testdir")
    })

    it("should translate rm with file argument", () => {
      const result = translator.translateCommand("rm file.txt")
      expect(result).toBe("Remove-Item file.txt")
    })

    it("should translate cp with source and destination", () => {
      const result = translator.translateCommand("cp source.txt dest.txt")
      expect(result).toBe("Copy-Item source.txt dest.txt")
    })

    it("should translate mv with source and destination", () => {
      const result = translator.translateCommand("mv source.txt dest.txt")
      expect(result).toBe("Move-Item source.txt dest.txt")
    })

    it("should translate grep with pattern and file", () => {
      const result = translator.translateCommand("grep 'pattern' file.txt")
      expect(result).toBe("Select-String 'pattern' file.txt")
    })

    it("should translate wc -l to PowerShell line count", () => {
      const result = translator.translateCommand("wc -l file.txt")
      expect(result).toBe("(Get-Content file.txt).Count")
    })

    it("should translate which command", () => {
      const result = translator.translateCommand("which node")
      expect(result).toBe("(Get-Command node).Source")
    })

    it("should translate date to Get-Date", () => {
      const result = translator.translateCommand("date")
      expect(result).toBe("Get-Date")
    })

    it("should translate kill with PID", () => {
      const result = translator.translateCommand("kill 1234")
      expect(result).toBe("Stop-Process -Id 1234")
    })

    it("should translate ps to Get-Process", () => {
      const result = translator.translateCommand("ps")
      expect(result).toBe("Get-Process")
    })

    it("should translate seq range", () => {
      const result = translator.translateCommand("seq 1 5")
      expect(result).toBe("1..5")
    })

    it("should translate /dev/null to $null", () => {
      // The /dev/null rule replaces the entire match with $null
      const result = translator.translateCommand("/dev/null")
      expect(result).toBe("$null")
    })

    it("should translate ~ to $env:USERPROFILE", () => {
      const result = translator.translateCommand("~")
      expect(result).toBe("$env:USERPROFILE")
    })

    it("should translate ~/path patterns", () => {
      // The ~/ rule replaces the entire match with $env:USERPROFILE
      const result = translator.translateCommand("~/")
      expect(result).toBe("$env:USERPROFILE")
    })

    it("should return original command when no rule matches", () => {
      const original = "unknown-command --flag value"
      const result = translator.translateCommand(original)
      expect(result).toBe(original)
    })

    it("should handle PowerShell commands without translation", () => {
      const psCommand = "Get-Process | Where-Object { $_.CPU -gt 10 }"
      const result = translator.translateCommand(psCommand)
      expect(result).toBe(psCommand)
    })

    it("should handle complex commands with multiple parts", () => {
      // The translator only handles individual commands, not piped commands
      const complex = "ls -la | grep test | wc -l"
      const result = translator.translateCommand(complex)
      // Should return original since it doesn't match any single command pattern
      expect(result).toBe(complex)
    })
  })

  describe("addRule", () => {
    it("should add custom translation rules", () => {
      const customRule: TranslationRule = {
        id: "custom-echo",
        priority: 100,
        pattern: /^echo-custom\s+(.+)$/,
        template: "Write-Host $1",
        description: "Custom echo translation",
      }

      translator.addRule(customRule)

      const result = translator.translateCommand("echo-custom hello")
      expect(result).toBe("Write-Host hello")

      const stats = translator.getStats()
      expect(stats.totalRules).toBeGreaterThan(15) // Core rules + custom
    })

    it("should respect rule priority", () => {
      const highPriorityRule: TranslationRule = {
        id: "high-priority-test",
        priority: 200, // Higher than core rules
        pattern: /^test$/,
        template: "HighPriorityResult",
        description: "High priority test rule",
      }

      const lowPriorityRule: TranslationRule = {
        id: "low-priority-test",
        priority: 50, // Lower than core rules
        pattern: /^test$/,
        template: "LowPriorityResult",
        description: "Low priority test rule",
      }

      translator.addRule(lowPriorityRule)
      translator.addRule(highPriorityRule)

      const result = translator.translateCommand("test")
      expect(result).toBe("HighPriorityResult")
    })
  })

  describe("registerPlugin", () => {
    it("should register plugin with multiple rules", () => {
      const pluginRules: TranslationRule[] = [
        {
          id: "plugin-rule-1",
          priority: 100,
          pattern: /^plugin-cmd1$/,
          template: "PluginResult1",
          description: "Plugin rule 1",
        },
        {
          id: "plugin-rule-2",
          priority: 100,
          pattern: /^plugin-cmd2\s+(.+)$/,
          template: "PluginResult2 $1",
          description: "Plugin rule 2",
        },
      ]

      translator.registerPlugin("test-plugin", pluginRules)

      expect(translator.translateCommand("plugin-cmd1")).toBe("PluginResult1")
      expect(translator.translateCommand("plugin-cmd2 arg")).toBe("PluginResult2 arg")

      const stats = translator.getStats()
      expect(stats.plugins).toContain("test-plugin")
      expect(stats.totalRules).toBeGreaterThan(17) // Core + plugin rules
    })

    it("should unregister plugin", () => {
      const pluginRules: TranslationRule[] = [
        {
          id: "unregister-test",
          priority: 100,
          pattern: /^unregister-me$/,
          template: "ShouldBeRemoved",
          description: "Test rule for unregister",
        },
      ]

      translator.registerPlugin("unregister-plugin", pluginRules)
      expect(translator.translateCommand("unregister-me")).toBe("ShouldBeRemoved")

      translator.unregisterPlugin("unregister-plugin")
      expect(translator.translateCommand("unregister-me")).toBe("unregister-me") // Back to original

      const stats = translator.getStats()
      expect(stats.plugins).not.toContain("unregister-plugin")
    })
  })

  describe("rule validation", () => {
    it("should handle rules with validators", () => {
      const validatedRule: TranslationRule = {
        id: "validated-rule",
        priority: 100,
        pattern: /^validate\s+(.+)$/,
        template: "Validated: $1",
        validator: (command, matches) => {
          // Only validate if the argument is "valid"
          return matches?.[1] === "valid"
        },
        description: "Rule with validator",
      }

      translator.addRule(validatedRule)

      expect(translator.translateCommand("validate valid")).toBe("Validated: valid")
      expect(translator.translateCommand("validate invalid")).toBe("validate invalid") // No translation
    })

    it("should handle rules with context transformers", () => {
      const contextRule: TranslationRule = {
        id: "context-rule",
        priority: 100,
        pattern: /^context\s+(.+)$/,
        template: "Context: $1", // This won't be used due to contextTransformer
        contextTransformer: (command, matches, context) => {
          return `ContextTransformed: ${matches?.[1]} with ${context?.shell || 'unknown'}`
        },
        description: "Rule with context transformer",
      }

      translator.addRule(contextRule)

      const result = translator.translateCommand("context test", { shell: "powershell" })
      expect(result).toBe("ContextTransformed: test with powershell")
    })
  })

  describe("error handling", () => {
    it("should handle invalid regex patterns gracefully", () => {
      // Create invalid regex by string that will fail when converted
      const invalidRule: TranslationRule = {
        id: "invalid-regex",
        priority: 100,
        pattern: "[invalid regex" as any, // This will cause RegExp constructor to fail
        template: "ShouldNotMatch",
        description: "Invalid regex rule",
      }

      translator.addRule(invalidRule)

      // Should not crash, should return original command
      const result = translator.translateCommand("invalid test")
      expect(result).toBe("invalid test")
    })

    it("should handle empty commands", () => {
      expect(translator.translateCommand("")).toBe("")
      expect(translator.translateCommand("   ")).toBe("   ")
    })

    it("should handle null/undefined commands", () => {
      // The translator handles null/undefined gracefully by returning the original value
      expect(translator.translateCommand(null)).toBe(null)
      expect(translator.translateCommand(undefined)).toBe(undefined)
    })
  })

  describe("statistics", () => {
    it("should provide accurate statistics", () => {
      const initialStats = translator.getStats()

      // Add some rules
      translator.addRule({
        id: "stats-test-1",
        priority: 50,
        pattern: /^stats1$/,
        template: "Stats1",
        description: "Stats test rule 1",
      })

      translator.addRule({
        id: "stats-test-2",
        priority: 50,
        pattern: /^stats2$/,
        template: "Stats2",
        description: "Stats test rule 2",
      })

      translator.addRule({
        id: "stats-test-3",
        priority: 100,
        pattern: /^stats3$/,
        template: "Stats3",
        description: "Stats test rule 3",
      })

      const updatedStats = translator.getStats()

      expect(updatedStats.totalRules).toBe(initialStats.totalRules + 3)
      expect(updatedStats.rulesByPriority[50]).toBe(2)
      expect(updatedStats.rulesByPriority[100]).toBeGreaterThanOrEqual(1) // At least the new rule
    })
  })

  describe("PowerShell command detection", () => {
    it("should not translate PowerShell commands", () => {
      const psCommands = [
        "Get-Process",
        "Set-Location C:\\",
        "New-Item -ItemType File test.txt",
        "Remove-Item test.txt",
        "Copy-Item source.txt dest.txt",
        "Move-Item source.txt dest.txt",
        "Select-String 'pattern' file.txt",
        "$variable = 'value'",
        "foreach ($item in $list) { Write-Host $item }",
        "if ($condition) { Do-Something }",
        "function Test-Function { param($param) Write-Host $param }",
        "$_.Property",
        "Get-Process | Where-Object { $_.CPU -gt 10 }",
        "Get-ChildItem | ForEach-Object { $_.Name }",
        "Get-Content file.txt | Select-Object -First 10",
      ]

      psCommands.forEach(cmd => {
        expect(translator.translateCommand(cmd)).toBe(cmd)
      })
    })

    it("should detect PowerShell cmdlets correctly", () => {
      expect(translator.translateCommand("Get-Process")).toBe("Get-Process")
      expect(translator.translateCommand("Set-Variable")).toBe("Set-Variable")
      expect(translator.translateCommand("New-Object")).toBe("New-Object")
      expect(translator.translateCommand("Remove-Variable")).toBe("Remove-Variable")
      expect(translator.translateCommand("Copy-Path")).toBe("Copy-Path")
      expect(translator.translateCommand("Move-Path")).toBe("Move-Path")
      expect(translator.translateCommand("Select-String")).toBe("Select-String")
    })
  })

  describe("complex command translation", () => {
    it("should handle commands with quoted arguments", () => {
      const result = translator.translateCommand("echo 'hello world'")
      expect(result).toBe("echo 'hello world'") // No translation needed
    })

    it("should handle commands with environment variables", () => {
      const result = translator.translateCommand("echo $HOME")
      expect(result).toBe("echo $HOME") // No translation for this specific case
    })

    it("should handle multi-line commands", () => {
      const multiLine = `cd /tmp
ls -la
pwd`
      const result = translator.translateCommand(multiLine)
      // Multi-line commands are treated as a single command and don't match individual patterns
      expect(result).toBe(multiLine)
    })

    it("should handle commands with special characters", () => {
      const result = translator.translateCommand("grep 'test.*pattern' file.txt")
      expect(result).toBe("Select-String 'test.*pattern' file.txt")
    })
  })

  describe("context-aware translation", () => {
    it("should use context in translation", () => {
      const contextRule: TranslationRule = {
        id: "context-aware",
        priority: 100,
        pattern: /^context-test$/,
        template: "BasicResult",
        contextTransformer: (command, matches, context) => {
          if (context?.cwd === "/special/path") {
            return "SpecialPathResult"
          }
          return "NormalResult"
        },
        description: "Context-aware rule",
      }

      translator.addRule(contextRule)

      expect(translator.translateCommand("context-test", { cwd: "/normal/path" })).toBe("NormalResult")
      expect(translator.translateCommand("context-test", { cwd: "/special/path" })).toBe("SpecialPathResult")
    })

    it("should handle missing context gracefully", () => {
      const contextRule: TranslationRule = {
        id: "context-optional",
        priority: 100,
        pattern: /^context-optional$/,
        template: "DefaultResult",
        contextTransformer: (command, matches, context) => {
          return `Result with ${context?.shell || 'default'}`
        },
        description: "Context-optional rule",
      }

      translator.addRule(contextRule)

      expect(translator.translateCommand("context-optional")).toBe("Result with default")
      expect(translator.translateCommand("context-optional", { shell: "bash" })).toBe("Result with bash")
    })
  })
})