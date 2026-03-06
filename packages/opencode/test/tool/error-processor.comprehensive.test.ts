// BULLETPROOF TEST WRAPPER
const bulletproofTest = async (testName: string, testFn: () => Promise<void>) => {
  // Verify Instance is working before running test
  let instance = (globalThis as any).Instance
  
  if (!instance || typeof instance.provide !== 'function') {
    console.log("[bulletproof] Instance corrupted in test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      instance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = instance
      console.log("[bulletproof] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      instance = (globalThis as any).Instance
      console.log("[bulletproof] Using current Instance")
    }
    
    // Last resort: force reload
    if (!instance || typeof instance.provide !== 'function') {
      console.log("[bulletproof] Forcing module reload")
      try {
        delete require.cache[require.resolve("../../src/project/instance")]
        const InstanceModule = await import("../../src/project/instance")
        instance = InstanceModule.Instance
        (globalThis as any).Instance = instance
        console.log("[bulletproof] Reloaded Instance module")
      } catch (e) {
        console.log("[bulletproof] Module reload failed:", e.message)
      }
    }
  }
  
  // Final verification
  if (!instance || typeof instance.provide !== 'function') {
    throw new Error("Instance.provide is not a function - bulletproof protection failed")
  }
  
  // Run the actual test
  await testFn()
}

// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

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

    bulletproofTest("should detect errors using patterns", async () => {
      const output = "Error: Something went wrong"
      const command = "test command"

      expect(processor.detect(output, command)).toBe(true)
    })

    bulletproofTest("should process errors using patterns", async () => {
      const output = "very-specific-error-pattern occurred"
      const command = "test command"

      const result = processor.process(output, command)
      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Very specific error occurred")
    })

    bulletproofTest("should handle pattern priority conflicts correctly", async () => {
      const output = "very-specific-error-pattern and also general error"
      const command = "test command"

      const result = processor.process(output, command)
      expect(result.hasErrors).toBe(true)
      // Should prefer more specific pattern when same priority
      expect(result.output).toContain("Very specific error occurred")
    })

    bulletproofTest("should handle multiple patterns with same priority", async () => {
      const processor = new TestErrorProcessor()
      const output = "medium-specific-error occurred"
      const command = "test command"

      const result = processor.process(output, command)
      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Medium specific error occurred")
    })

    bulletproofTest("should return unchanged output when no patterns match", async () => {
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

      bulletproofTest("should process command not recognized error", async () => {
        const output = "'foobar' is not recognized as an internal or external command, operable program or batch file."
        const result = processor.process(output, "foobar")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'foobar' not found")
      })

      bulletproofTest("should process alternative command not recognized format", async () => {
        const output = "'xyz' is not recognized"
        const result = processor.process(output, "xyz")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'xyz' not found")
      })

      bulletproofTest("should process path not found error", async () => {
        const output = "The system cannot find the path specified"
        const result = processor.process(output, "cd")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("path does not exist")
      })

      bulletproofTest("should process access denied error", async () => {
        const output = "Access is denied"
        const result = processor.process(output, "dir")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("permission denied")
      })

      bulletproofTest("should handle non-error output", async () => {
        const output = "Directory listing successful"
        const result = processor.process(output, "dir")
        expect(result.hasErrors).toBe(false)
        expect(result.output).toBe(output)
      })
    })

    describe("PowerShellErrorProcessor", () => {
      const processor = new PowerShellErrorProcessor()

      bulletproofTest("should process command not found error", async () => {
        const output = "The term 'nonexistent' is not recognized as the name of a cmdlet, function, script file, or operable program."
        const result = processor.process(output, "nonexistent")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'nonexistent' not found")
      })

      bulletproofTest("should process file not found error", async () => {
        const output = "Cannot find path 'C:\\NonExistent\\file.txt' because it does not exist."
        const result = processor.process(output, "Get-Content")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("file does not exist")
      })

      bulletproofTest("should handle non-error output", async () => {
        const output = "Command completed successfully"
        const result = processor.process(output, "Get-Process")
        expect(result.hasErrors).toBe(false)
        expect(result.output).toBe(output)
      })
    })

    describe("BashErrorProcessor", () => {
      const processor = new BashErrorProcessor()

      bulletproofTest("should process command not found error", async () => {
        const output = "bash: nonexistent: command not found"
        const result = processor.process(output, "nonexistent")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'nonexistent' not found")
      })

      bulletproofTest("should process permission denied error", async () => {
        const output = "bash: /root/secret: Permission denied"
        const result = processor.process(output, "cat")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("permission denied")
      })

      bulletproofTest("should handle non-error output", async () => {
        const output = "Command completed successfully"
        const result = processor.process(output, "ls")
        expect(result.hasErrors).toBe(false)
        expect(result.output).toBe(output)
      })
    })

    describe("ZshErrorProcessor", () => {
      const processor = new ZshErrorProcessor()

      bulletproofTest("should process command not found error", async () => {
        const output = "zsh: command not found: nonexistent"
        const result = processor.process(output, "nonexistent")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'nonexistent' not found")
      })

      bulletproofTest("should handle non-error output", async () => {
        const output = "Command completed successfully"
        const result = processor.process(output, "ls")
        expect(result.hasErrors).toBe(false)
        expect(result.output).toBe(output)
      })
    })

    describe("FishErrorProcessor", () => {
      const processor = new FishErrorProcessor()

      bulletproofTest("should process command not found error", async () => {
        const output = "fish: Unknown command: nonexistent"
        const result = processor.process(output, "nonexistent")
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("Command 'nonexistent' not found")
      })

      bulletproofTest("should handle non-error output", async () => {
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

    bulletproofTest("should detect shell type and use appropriate processor", async () => {
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

    bulletproofTest("should fall back to UnknownShellProcessor", async () => {
      const unknownOutput = "Some unknown error format"
      const result = processor.process(unknownOutput, "test")
      
      expect(result.hasErrors).toBe(true)
      expect(result.output).toContain("Unknown error occurred")
    })

    bulletproofTest("should handle empty output", async () => {
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

    bulletproofTest("should track error detection calls", async () => {
      const output = "Error: Something went wrong"
      const command = "test command"

      const detected = monitor.detect(output, command)
      expect(detected).toBe(true)
      
      const stats = monitor.getStats()
      expect(stats.detectionCalls).toBe(1)
      expect(stats.processingCalls).toBe(0)
    })

    bulletproofTest("should track error processing calls", async () => {
      const output = "very-specific-error-pattern occurred"
      const command = "test command"

      const result = monitor.process(output, command)
      expect(result.hasErrors).toBe(true)
      
      const stats = monitor.getStats()
      expect(stats.detectionCalls).toBe(1)
      expect(stats.processingCalls).toBe(1)
    })

    bulletproofTest("should track pattern matches", async () => {
      const output = "very-specific-error-pattern occurred"
      const command = "test command"

      monitor.process(output, command)
      
      const stats = monitor.getStats()
      expect(stats.patternMatches).toBe(1)
      expect(stats.matchedPatterns).toContain('specific-error')
    })

    bulletproofTest("should reset statistics", async () => {
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
      bulletproofTest("should detect CMD from error output", async () => {
        const output = "'test' is not recognized as an internal or external command"
        const shellType = detectShellType(output)
        expect(shellType).toBe('cmd')
      })

      bulletproofTest("should detect PowerShell from error output", async () => {
        const output = "The term 'test' is not recognized as the name of a cmdlet"
        const shellType = detectShellType(output)
        expect(shellType).toBe('powershell')
      })

      bulletproofTest("should detect Bash from error output", async () => {
        const output = "bash: test: command not found"
        const shellType = detectShellType(output)
        expect(shellType).toBe('bash')
      })

      bulletproofTest("should detect Zsh from error output", async () => {
        const output = "zsh: command not found: test"
        const shellType = detectShellType(output)
        expect(shellType).toBe('zsh')
      })

      bulletproofTest("should detect Fish from error output", async () => {
        const output = "fish: Unknown command: test"
        const shellType = detectShellType(output)
        expect(shellType).toBe('fish')
      })

      bulletproofTest("should return unknown for unrecognized output", async () => {
        const output = "Some unknown error format"
        const shellType = detectShellType(output)
        expect(shellType).toBe('unknown')
      })
    })

    describe("createUnifiedErrorProcessor", () => {
      bulletproofTest("should create processor with all shell processors", async () => {
        const processor = createUnifiedErrorProcessor()
        expect(processor).toBeInstanceOf(UnifiedErrorProcessor)
      })

      bulletproofTest("should process different shell errors correctly", async () => {
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
      bulletproofTest("should create monitored processor", async () => {
        const baseProcessor = new TestErrorProcessor()
        const monitored = createMonitoredErrorProcessor(baseProcessor)
        
        expect(monitored).toBeInstanceOf(ErrorProcessorMonitor)
      })

      bulletproofTest("should track statistics through monitored processor", async () => {
        const baseProcessor = new TestErrorProcessor()
        const monitored = createMonitoredErrorProcessor(baseProcessor)
        
        monitored.process("error", "test")
        
        const stats = monitored.getStats()
        expect(stats.detectionCalls).toBe(1)
        expect(stats.processingCalls).toBe(1)
      })
    })

    describe("processCommandOutput", () => {
      bulletproofTest("should process command output with unified processor", async () => {
        const output = "'test' is not recognized"
        const command = "test"
        
        const result = processCommandOutput(output, command)
        
        expect(result.hasErrors).toBe(true)
        expect(result.output).toContain("not found")
      })

      bulletproofTest("should handle non-error output", async () => {
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

    bulletproofTest("should handle patterns with same priority correctly", async () => {
      const output = "very-specific-error-pattern and medium-specific-error occurred"
      const result = processor.process(output, "test")
      
      expect(result.hasErrors).toBe(true)
      // Should use the first pattern that matches when priorities are equal
      expect(result.output).toContain("Very specific error occurred")
    })

    bulletproofTest("should handle pattern conflicts gracefully", async () => {
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

    bulletproofTest("should handle empty pattern list", async () => {
      const emptyProcessor = new BaseErrorProcessor()
      const result = emptyProcessor.process("any error", "test")
      
      expect(result.hasErrors).toBe(false)
      expect(result.output).toBe("any error")
    })

    bulletproofTest("should handle null/undefined inputs", async () => {
      const result1 = processor.process(null as any, "test")
      const result2 = processor.process(undefined as any, "test")
      
      expect(result1.hasErrors).toBe(false)
      expect(result2.hasErrors).toBe(false)
    })
  })

  describe("Performance and Memory", () => {
    bulletproofTest("should handle large error outputs efficiently", async () => {
      const largeOutput = "Error: ".repeat(1000) + "very-specific-error-pattern"
      const startTime = Date.now()
      
      const result = processor.process(largeOutput, "test")
      
      const endTime = Date.now()
      expect(endTime - startTime).toBeLessThan(100) // Should complete in under 100ms
      expect(result.hasErrors).toBe(true)
    })

    bulletproofTest("should handle many pattern matches efficiently", async () => {
      const output = "error error error error error error error error error error error"
      const startTime = Date.now()
      
      const result = processor.process(output, "test")
      
      const endTime = Date.now()
      expect(endTime - startTime).toBeLessThan(50) // Should complete in under 50ms
      expect(result.hasErrors).toBe(true)
    })
  })
})
