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

class TestErrorProcessor extends BaseErrorProcessor {
  shellType: ShellType = 'bash'
  
  constructor() {
    super()
    // Add patterns with same priority to test secondary sorting
    this.addPattern({
      name: 'specific-error',
      pattern: /very-specific-error-pattern/gi,
      processor: () => 'Error: Very specific error occurred',
      priority: 5
    })
    
    this.addPattern({
      name: 'general-error', 
      pattern: /error/gi,
      processor: () => 'Error: General error occurred',
      priority: 5
    })
    
    this.addPattern({
      name: 'medium-specific-error',
      pattern: /medium-specific-error/gi,
      processor: () => 'Error: Medium specific error occurred', 
      priority: 5
    })
  }
}

describe("Error Processor - Comprehensive Tests", () => {
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

    test("should process errors using patterns", () => {
      const output = "very-specific-error-pattern occurred"
      const command = "test command"

      const result = processor.process(output, command)
      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Very specific error occurred")
    })

    test("should handle pattern priority conflicts correctly", () => {
      const output = "very-specific-error-pattern and also general error"
      const command = "test command"

      const result = processor.process(output, command)
      expect(result.hasErrors).toBe(true)
      // Should prefer more specific pattern when same priority
      expect(result.output).toContain("Very specific error occurred")
    })

    test("should handle multiple patterns with same priority", () => {
      const processor = new TestErrorProcessor()
      const output = "medium-specific-error occurred"
      const command = "test command"

      const result = processor.process(output, command)
      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Medium specific error occurred")
    })

    test("should return unchanged output when no patterns match", () => {
      const output = "No error here"
      const command = "test command"

      const result = processor.process(output, command)
      expect(result.hasErrors).toBe(false)
      expect(result.output).toBe(output)
    })
  })

  describe("Error Processors by Shell Type", () => {
    describe("CmdErrorProcessor", () => {
      const processor = new CmdErrorProcessor()

      test("should process command not recognized error", () => {
        const output = "'foobar' is not recognized as an internal or external command, operable program or batch file."
        const result = processor.process(output, "foobar")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'foobar' not found")
      })

      test("should process alternative command not recognized format", () => {
        const output = "'xyz' is not recognized"
        const result = processor.process(output, "xyz")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'xyz' not found")
      })

      test("should process path not found error", () => {
        const output = "The system cannot find the path specified"
        const result = processor.process(output, "cd")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("path does not exist")
      })

      test("should process access denied error", () => {
        const output = "Access is denied"
        const result = processor.process(output, "dir")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("permission denied")
      })

      test("should handle non-error output", () => {
        const output = "Directory listing successful"
        const result = processor.process(output, "dir")
        expect(result.hasErrors).toBe(false)
        expect(result.output).toBe(output)
      })
    })

    describe("PowerShellErrorProcessor", () => {
      const processor = new PowerShellErrorProcessor()

      test("should process command not found error", () => {
        const output = "The term 'nonexistent' is not recognized as the name of a cmdlet, function, script file, or operable program."
        const result = processor.process(output, "nonexistent")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'nonexistent' not found")
      })

      test("should process file not found error", () => {
        const output = "Cannot find path 'C:\\NonExistent\\file.txt' because it does not exist."
        const result = processor.process(output, "Get-Content")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("file does not exist")
      })

      test("should handle non-error output", () => {
        const output = "Command completed successfully"
        const result = processor.process(output, "Get-Process")
        expect(result.hasErrors).toBe(false)
        expect(result.output).toBe(output)
      })
    })

    describe("BashErrorProcessor", () => {
      const processor = new BashErrorProcessor()

      test("should process command not found error", () => {
        const output = "bash: nonexistent: command not found"
        const result = processor.process(output, "nonexistent")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'nonexistent' not found")
      })

      test("should process permission denied error", () => {
        const output = "bash: /root/secret: Permission denied"
        const result = processor.process(output, "cat")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("permission denied")
      })

      test("should handle non-error output", () => {
        const output = "Command completed successfully"
        const result = processor.process(output, "ls")
        expect(result.hasErrors).toBe(false)
        expect(result.output).toBe(output)
      })
    })

    describe("ZshErrorProcessor", () => {
      const processor = new ZshErrorProcessor()

      test("should process command not found error", () => {
        const output = "zsh: command not found: nonexistent"
        const result = processor.process(output, "nonexistent")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'nonexistent' not found")
      })

      test("should handle non-error output", () => {
        const output = "Command completed successfully"
        const result = processor.process(output, "ls")
        expect(result.hasErrors).toBe(false)
        expect(result.output).toBe(output)
      })
    })

    describe("FishErrorProcessor", () => {
      const processor = new FishErrorProcessor()

      test("should process command not found error", () => {
        const output = "fish: Unknown command: nonexistent"
        const result = processor.process(output, "nonexistent")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'nonexistent' not found")
      })

      test("should handle non-error output", () => {
        const output = "Command completed successfully"
        const result = processor.process(output, "ls")
        expect(result.hasErrors).toBe(false)
        expect(result.output).toBe(output)
      })
    })
  })

  describe("UnifiedErrorProcessor", () => {
    let processor: UnifiedErrorProcessor

    beforeEach(() => {
      processor = new UnifiedErrorProcessor()
    })

    test("should detect shell type and use appropriate processor", () => {
      const cmdOutput = "'test' is not recognized"
      const bashOutput = "bash: test: command not found"
      const psOutput = "The term 'test' is not recognized"

      const cmdResult = processor.process(cmdOutput, "test")
      const bashResult = processor.process(bashOutput, "test")
      const psResult = processor.process(psOutput, "test")

      expect(cmdResult.hasErrors).toBe(true)
      expect(bashResult.hasErrors).toBe(true)
      expect(psResult.hasErrors).toBe(true)
    })

    test("should fall back to UnknownShellProcessor", () => {
      const unknownOutput = "Some unknown error format"
      const result = processor.process(unknownOutput, "test")
      
      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Unknown error occurred")
    })

    test("should handle empty output", () => {
      const result = processor.process("", "test")
      expect(result.hasErrors).toBe(false)
      expect(result.output).toBe("")
    })
  })

  describe("ErrorProcessorMonitor", () => {
    let monitor: ErrorProcessorMonitor
    let processor: BaseErrorProcessor

    beforeEach(() => {
      processor = new TestErrorProcessor()
      monitor = new ErrorProcessorMonitor(processor)
    })

    test("should track error detection calls", () => {
      const output = "Error: Something went wrong"
      const command = "test command"

      const detected = monitor.detect(output, command)
      expect(detected).toBe(true)
      
      const stats = monitor.getStats()
      expect(stats.detectionCalls).toBe(1)
      expect(stats.processingCalls).toBe(0)
    })

    test("should track error processing calls", () => {
      const output = "very-specific-error-pattern occurred"
      const command = "test command"

      const result = monitor.process(output, command)
      expect(result.hasErrors).toBe(true)
      
      const stats = monitor.getStats()
      expect(stats.detectionCalls).toBe(1)
      expect(stats.processingCalls).toBe(1)
    })

    test("should track pattern matches", () => {
      const output = "very-specific-error-pattern occurred"
      const command = "test command"

      monitor.process(output, command)
      
      const stats = monitor.getStats()
      expect(stats.patternMatches).toBe(1)
      expect(stats.matchedPatterns).toContain('specific-error')
    })

    test("should reset statistics", () => {
      monitor.process("error", "test")
      monitor.resetStats()
      
      const stats = monitor.getStats()
      expect(stats.detectionCalls).toBe(0)
      expect(stats.processingCalls).toBe(0)
      expect(stats.patternMatches).toBe(0)
      expect(stats.matchedPatterns).toHaveLength(0)
    })
  })

  describe("Utility Functions", () => {
    describe("detectShellType", () => {
      test("should detect CMD from error output", () => {
        const output = "'test' is not recognized as an internal or external command"
        const shellType = detectShellType(output)
        expect(shellType).toBe('cmd')
      })

      test("should detect PowerShell from error output", () => {
        const output = "The term 'test' is not recognized as the name of a cmdlet"
        const shellType = detectShellType(output)
        expect(shellType).toBe('powershell')
      })

      test("should detect Bash from error output", () => {
        const output = "bash: test: command not found"
        const shellType = detectShellType(output)
        expect(shellType).toBe('bash')
      })

      test("should detect Zsh from error output", () => {
        const output = "zsh: command not found: test"
        const shellType = detectShellType(output)
        expect(shellType).toBe('zsh')
      })

      test("should detect Fish from error output", () => {
        const output = "fish: Unknown command: test"
        const shellType = detectShellType(output)
        expect(shellType).toBe('fish')
      })

      test("should return unknown for unrecognized output", () => {
        const output = "Some unknown error format"
        const shellType = detectShellType(output)
        expect(shellType).toBe('unknown')
      })
    })

    describe("createUnifiedErrorProcessor", () => {
      test("should create processor with all shell processors", () => {
        const processor = createUnifiedErrorProcessor()
        expect(processor).toBeInstanceOf(UnifiedErrorProcessor)
      })

      test("should process different shell errors correctly", () => {
        const processor = createUnifiedErrorProcessor()
        
        const cmdError = "'test' is not recognized"
        const bashError = "bash: test: command not found"
        
        const cmdResult = processor.process(cmdError, "test")
        const bashResult = processor.process(bashError, "test")
        
        expect(cmdResult.hasErrors).toBe(true)
        expect(bashResult.hasErrors).toBe(true)
      })
    })

    describe("createMonitoredErrorProcessor", () => {
      test("should create monitored processor", () => {
        const baseProcessor = new TestErrorProcessor()
        const monitored = createMonitoredErrorProcessor(baseProcessor)
        
        expect(monitored).toBeInstanceOf(ErrorProcessorMonitor)
      })

      test("should track statistics through monitored processor", () => {
        const baseProcessor = new TestErrorProcessor()
        const monitored = createMonitoredErrorProcessor(baseProcessor)
        
        monitored.process("error", "test")
        
        const stats = monitored.getStats()
        expect(stats.detectionCalls).toBe(1)
        expect(stats.processingCalls).toBe(1)
      })
    })

    describe("processCommandOutput", () => {
      test("should process command output with unified processor", () => {
        const output = "'test' is not recognized"
        const command = "test"
        
        const result = processCommandOutput(output, command)
        
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("not found")
      })

      test("should handle non-error output", () => {
        const output = "Command completed successfully"
        const command = "test"
        
        const result = processCommandOutput(output, command)
        
        expect(result.hasErrors).toBe(false)
        expect(result.output).toBe(output)
      })
    })
  })

  describe("Pattern Priority and Edge Cases", () => {
    let processor: TestErrorProcessor

    beforeEach(() => {
      processor = new TestErrorProcessor()
    })

    test("should handle patterns with same priority correctly", () => {
      const output = "very-specific-error-pattern and medium-specific-error occurred"
      const result = processor.process(output, "test")
      
      expect(result.hasErrors).toBe(true)
      // Should use the first pattern that matches when priorities are equal
      expect(result.output).toContain("Very specific error occurred")
    })

    test("should handle pattern conflicts gracefully", () => {
      // Add conflicting patterns
      processor.addPattern({
        name: 'conflict-1',
        pattern: /conflict/gi,
        processor: () => 'Conflict 1',
        priority: 10
      })
      
      processor.addPattern({
        name: 'conflict-2',
        pattern: /conflict/gi,
        processor: () => 'Conflict 2',
        priority: 10
      })
      
      const result = processor.process("conflict occurred", "test")
      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Conflict 1") // First one wins
    })

    test("should handle empty pattern list", () => {
      const emptyProcessor = new BaseErrorProcessor()
      const result = emptyProcessor.process("any error", "test")
      
      expect(result.hasErrors).toBe(false)
      expect(result.output).toBe("any error")
    })

    test("should handle null/undefined inputs", () => {
      const result1 = processor.process(null as any, "test")
      const result2 = processor.process(undefined as any, "test")
      
      expect(result1.hasErrors).toBe(false)
      expect(result2.hasErrors).toBe(false)
    })
  })

  describe("Performance and Memory", () => {
    test("should handle large error outputs efficiently", () => {
      const largeOutput = "Error: ".repeat(1000) + "very-specific-error-pattern"
      const startTime = Date.now()
      
      const result = processor.process(largeOutput, "test")
      
      const endTime = Date.now()
      expect(endTime - startTime).toBeLessThan(100) // Should complete in under 100ms
      expect(result.hasErrors).toBe(true)
    })

    test("should handle many pattern matches efficiently", () => {
      const output = "error error error error error error error error error error error"
      const startTime = Date.now()
      
      const result = processor.process(output, "test")
      
      const endTime = Date.now()
      expect(endTime - startTime).toBeLessThan(50) // Should complete in under 50ms
      expect(result.hasErrors).toBe(true)
    })
  })
})
