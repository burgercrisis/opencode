import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import {
  UnifiedErrorProcessor,
  BaseErrorProcessor,
  UnknownShellProcessor,
  ErrorProcessorMonitor,
  ShellType,
  ProcessedOutput,
  ErrorPattern
} from '../../src/tool/error-processor'
import { PowerShellErrorProcessor } from '../../src/tool/error-processors/powershell'
import { CmdErrorProcessor } from '../../src/tool/error-processors/cmd'
import { BashErrorProcessor, ZshErrorProcessor, FishErrorProcessor } from '../../src/tool/error-processors/unix'
import { createUnifiedErrorProcessor, createMonitoredErrorProcessor, detectShellType, processCommandOutput } from '../../src/tool/error-processors'

describe("Unified Error Processor Framework", () => {
  describe("BaseErrorProcessor", () => {
    let processor: BaseErrorProcessor

    beforeEach(() => {
      processor = new TestErrorProcessor()
    })

    test("should detect errors using patterns", () => {
      const output = "Error: Something went wrong"
      const command = "test command"

      expect(processor.detect(output, command)).toBe(true)
    })

    test("should process output with patterns", () => {
      const output = "Error: Something went wrong"
      const command = "test command"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Processed: Error: Something went wrong")
    })

    test("should handle patterns in priority order", () => {
      processor = new TestErrorProcessor()
      // Add patterns with different priorities
      processor.addPattern({
        name: 'low-priority',
        pattern: /low/gi,
        processor: () => "LOW",
        priority: 10
      })
      processor.addPattern({
        name: 'high-priority',
        pattern: /low/gi,
        processor: () => "HIGH",
        priority: 1
      })

      const result = processor.process("low", "test")

      expect(result.output).toBe("HIGH")
    })
  })

  describe("PowerShellErrorProcessor", () => {
    let processor: PowerShellErrorProcessor

    beforeEach(() => {
      processor = new PowerShellErrorProcessor()
    })

    test("should process cmdlet not found errors", () => {
      const output = "The term 'Get-Foo' is not recognized as the name of a cmdlet, function, script file, or operable program."
      const command = "Get-Foo"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Error: Command 'Get-Foo' not found")
      expect(result.output).toContain("Get-Command Get-Foo")
    })

    test("should process Format-Table -First parameter errors", () => {
      const output = "Format-Table : A parameter cannot be found that matches parameter name 'First'."
      const command = "Get-Process | Format-Table -First 1"

      const result = processor.process(output, command)

      expect(result.output).toContain("Note: The -First parameter is not supported in Format-Table")
      expect(result.output).toContain("Select-Object -First N")
    })

    test("should process Get-Credential non-interactive errors", () => {
      const output = "Get-Credential : Cannot prompt for input in this environment"
      const command = "Get-Credential"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Error: Get-Credential requires interactive input")
      expect(result.output).toContain("Alternative approaches")
    })

    test("should handle special cases for Get-NonExistentCmdlet", () => {
      const output = "Get-NonExistentCmdlet: Cannot process command because of one or more missing mandatory parameters: something"
      const command = "Get-NonExistentCmdlet"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Error: Command 'Get-NonExistentCmdlet' not found")
    })

    test("should detect PowerShell-specific error indicators", () => {
      const output = "Write-Error: Something failed"
      const command = "test"

      expect(processor.detect(output, command)).toBe(true)
    })
  })

  describe("CmdErrorProcessor", () => {
    let processor: CmdErrorProcessor

    beforeEach(() => {
      processor = new CmdErrorProcessor()
    })

    test("should process command not recognized errors", () => {
      const output = "'foo' is not recognized as an internal or external command, operable program or batch file."
      const command = "foo"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.exitCode).toBe(9009)
      expect(result.output).toContain("Error: Command 'foo' not found")
    })

    test("should handle variable expansion quote artifacts", () => {
      const output = 'some output with trailing quote"'
      const command = 'echo %TEST_VAR%'

      const result = processor.process(output, command)

      expect(result.output).toBe("some output with trailing quote")
    })

    test("should process path not found errors", () => {
      const output = "The system cannot find the path specified"
      const command = "cd \\nonexistent"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("Error: The specified path does not exist")
    })
  })

  describe("BashErrorProcessor", () => {
    let processor: BashErrorProcessor

    beforeEach(() => {
      processor = new BashErrorProcessor()
    })

    test("should process command not found errors", () => {
      const output = "foo: command not found"
      const command = "foo"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.exitCode).toBe(127)
      expect(result.output).toContain("Error: Command 'foo' not found")
    })

    test("should process permission denied errors", () => {
      const output = "Permission denied"
      const command = "cat /etc/shadow"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.exitCode).toBe(126)
      expect(result.output).toContain("Error: Permission denied")
    })

    test("should process syntax errors", () => {
      const output = "syntax error near unexpected token"
      const command = "echo 'unclosed quote"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain("Error: Syntax error")
    })
  })

  describe("ZshErrorProcessor", () => {
    let processor: ZshErrorProcessor

    beforeEach(() => {
      processor = new ZshErrorProcessor()
    })

    test("should process ZSH-specific command not found", () => {
      const output = "zsh: command not found: foo"
      const command = "foo"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Error: Command 'foo' not found")
    })

    test("should process ZSH permission denied", () => {
      const output = "zsh: permission denied: /etc/shadow"
      const command = "cat /etc/shadow"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Error: Permission denied for '/etc/shadow'")
    })
  })

  describe("FishErrorProcessor", () => {
    let processor: FishErrorProcessor

    beforeEach(() => {
      processor = new FishErrorProcessor()
    })

    test("should process Fish command not found", () => {
      const output = "fish: Unknown command: foo"
      const command = "foo"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Error: Command 'foo' not found")
    })

    test("should process Fish syntax error", () => {
      const output = "fish: Syntax error"
      const command = "echo 'unclosed"

      const result = processor.process(output, command)

      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Error: Syntax error")
    })
  })

  describe("UnifiedErrorProcessor", () => {
    let processor: UnifiedErrorProcessor

    beforeEach(() => {
      processor = new UnifiedErrorProcessor()
      processor.register(new PowerShellErrorProcessor())
      processor.register(new CmdErrorProcessor())
      processor.register(new BashErrorProcessor())
    })

    test("should use correct processor for shell type", () => {
      const output = "The term 'Get-Foo' is not recognized"
      const command = "Get-Foo"

      const result = processor.process(output, command, 'powershell')

      expect(result.output).toContain("Error: Command 'Get-Foo' not found")
      expect(result.output).toContain("Get-Command Get-Foo")
    })

    test("should fallback to unknown processor for unregistered shells", () => {
      const output = "some error"
      const command = "test"

      const result = processor.process(output, command, 'unknown' as ShellType)

      expect(result.output).toContain("Error: Command not found")
    })

    test("should detect errors for specific shell types", () => {
      expect(processor.detect("The term 'Get-Foo' is not recognized", "test", 'powershell')).toBe(true)
      expect(processor.detect("foo: command not found", "test", 'bash')).toBe(true)
      expect(processor.detect("'foo' is not recognized", "test", 'cmd')).toBe(true)
    })

    test("should manage processor registration", () => {
      expect(processor.getProcessor('powershell')).toBeInstanceOf(PowerShellErrorProcessor)
      expect(processor.getProcessor('cmd')).toBeInstanceOf(CmdErrorProcessor)
      expect(processor.getProcessor('bash')).toBeInstanceOf(BashErrorProcessor)
      expect(processor.getProcessor('unknown')).toBeUndefined()

      const processors = processor.getProcessors()
      expect(processors.size).toBe(3)
    })
  })

  describe("ErrorProcessorMonitor", () => {
    let monitor: ErrorProcessorMonitor

    beforeEach(() => {
      monitor = new ErrorProcessorMonitor()
    })

    test("should record processing statistics", () => {
      monitor.record('powershell', 100, ['cmdlet-not-found'], true)
      monitor.record('powershell', 150, ['parameter-error'], false)

      const stats = monitor.getStatsForShell('powershell')

      expect(stats).toBeDefined()
      expect(stats!.totalProcessed).toBe(2)
      expect(stats!.errorsDetected).toBe(1)
      expect(stats!.patternsMatched['cmdlet-not-found']).toBe(1)
      expect(stats!.patternsMatched['parameter-error']).toBe(1)
      expect(stats!.averageProcessingTime).toBe(125) // (100 + 150) / 2
    })

    test("should reset statistics", () => {
      monitor.record('powershell', 100, ['test'], true)
      monitor.resetForShell('powershell')

      expect(monitor.getStatsForShell('powershell')).toBeUndefined()

      monitor.record('bash', 100, ['test'], true)
      monitor.reset()

      expect(monitor.getStats().size).toBe(0)
    })
  })

  describe("Factory Functions", () => {
    test("createUnifiedErrorProcessor should register all processors", () => {
      const processor = createUnifiedErrorProcessor()

      expect(processor.getProcessor('powershell')).toBeInstanceOf(PowerShellErrorProcessor)
      expect(processor.getProcessor('cmd')).toBeInstanceOf(CmdErrorProcessor)
      expect(processor.getProcessor('bash')).toBeInstanceOf(BashErrorProcessor)
      expect(processor.getProcessor('zsh')).toBeInstanceOf(ZshErrorProcessor)
      expect(processor.getProcessor('fish')).toBeInstanceOf(FishErrorProcessor)
    })

    test("createMonitoredErrorProcessor should return processor and monitor", () => {
      const { processor, monitor } = createMonitoredErrorProcessor()

      expect(processor).toBeInstanceOf(UnifiedErrorProcessor)
      expect(monitor).toBeInstanceOf(ErrorProcessorMonitor)
    })

    test("detectShellType should identify shell types correctly", () => {
      expect(detectShellType("powershell -Command Get-Process")).toBe('powershell')
      expect(detectShellType("pwsh -Command Get-Process")).toBe('powershell')
      expect(detectShellType("cmd /c dir")).toBe('cmd')
      expect(detectShellType("ls -la", "linux")).toBe('bash')
      expect(detectShellType("ls -la", "win32")).toBe('powershell') // Windows default
    })

    test("processCommandOutput should process output correctly", () => {
      const result = processCommandOutput(
        "The term 'Get-Foo' is not recognized",
        "Get-Foo",
        'powershell'
      )

      expect(result.output).toContain("Error: Command 'Get-Foo' not found")
      expect(result.hasErrors).toBe(true)
      expect(result.shellType).toBe('powershell')
    })
  })

  describe("Integration Tests", () => {
    test("should handle complex PowerShell error scenarios", () => {
      const processor = createUnifiedErrorProcessor()

      const result = processor.process(
        "Get-Credential : Cannot prompt for input in this environment",
        "Get-Credential",
        'powershell'
      )

      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Error: Get-Credential requires interactive input")
      expect(result.output).toContain("Alternative approaches")
    })

    test("should handle CMD variable expansion scenarios", () => {
      const processor = createUnifiedErrorProcessor()

      const result = processor.process(
        "'foo' is not recognized as an internal or external command, operable program or batch file.",
        "foo",
        'cmd'
      )

      expect(result.hasErrors).toBe(true)
      expect(result.exitCode).toBe(9009)
      expect(result.output).toContain("Error: Command 'foo' not found")
    })

    test("should handle Unix permission scenarios", () => {
      const processor = createUnifiedErrorProcessor()

      const result = processor.process(
        "Permission denied",
        "cat /etc/shadow",
        'bash'
      )

      expect(result.hasErrors).toBe(true)
      expect(result.exitCode).toBe(126)
      expect(result.output).toContain("Error: Permission denied")
    })

    test("should work with monitoring", () => {
      const { processor, monitor } = createMonitoredErrorProcessor()

      const result = processor.process(
        "The term 'Get-Foo' is not recognized",
        "Get-Foo",
        'powershell'
      )

      // Manually record the processing for monitoring
      monitor.record('powershell', 10, ['cmdlet-not-found'], result.hasErrors)

      const stats = monitor.getStatsForShell('powershell')
      expect(stats).toBeDefined()
      expect(stats!.totalProcessed).toBe(1)
      expect(stats!.errorsDetected).toBe(1)
    })
  })
})

// Test helper class
class TestErrorProcessor extends BaseErrorProcessor {
  shellType: ShellType = 'test'

  constructor() {
    super()
    this.addPattern({
      name: 'test-error',
      pattern: /Error:/gi,
      processor: (match) => `Processed: ${match[0]}`,
      priority: 1
    })
  }
}
