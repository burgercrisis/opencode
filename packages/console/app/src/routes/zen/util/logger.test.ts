import { describe, expect, test, vi, beforeEach, afterEach } from "bun:test"
import { logger } from "./logger"

// Mock the Resource module
const mockResource = {
  App: {
    stage: "development"
  }
}

// Mock console methods
const mockConsoleLog = vi.fn()
const mockConsoleDebug = vi.fn()

describe("logger", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
    
    // Mock console methods
    global.console.log = mockConsoleLog
    global.console.debug = mockConsoleDebug
    
    // Mock Resource module
    vi.doMock("@opencode-ai/console-resource", () => ({
      Resource: mockResource
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("metric", () => {
    test("logs metric values as JSON string", () => {
      const values = { count: 10, type: "api_call", user: "test" }
      logger.metric(values)
      
      expect(mockConsoleLog).toHaveBeenCalledWith(`_metric:${JSON.stringify(values)}`)
      expect(mockConsoleLog).toHaveBeenCalledTimes(1)
    })

    test("handles empty metric values", () => {
      logger.metric({})
      
      expect(mockConsoleLog).toHaveBeenCalledWith(`_metric:${JSON.stringify({})}`)
      expect(mockConsoleLog).toHaveBeenCalledTimes(1)
    })

    test("handles complex metric values", () => {
      const values = {
        timestamp: Date.now(),
        metadata: { source: "api", version: "1.0.0" },
        nested: { level1: { level2: "deep" } }
      }
      logger.metric(values)
      
      expect(mockConsoleLog).toHaveBeenCalledWith(`_metric:${JSON.stringify(values)}`)
      expect(mockConsoleLog).toHaveBeenCalledTimes(1)
    })

    test("handles null and undefined values", () => {
      const values = { 
        nullValue: null, 
        undefinedValue: undefined, 
        numberValue: 42 
      }
      logger.metric(values)
      
      expect(mockConsoleLog).toHaveBeenCalledWith(`_metric:${JSON.stringify(values)}`)
      expect(mockConsoleLog).toHaveBeenCalledTimes(1)
    })
  })

  describe("log", () => {
    test("delegates to console.log", () => {
      const message = "Test log message"
      logger.log(message)
      
      expect(mockConsoleLog).toHaveBeenCalledWith(message)
      expect(mockConsoleLog).toHaveBeenCalledTimes(1)
    })

    test("handles multiple arguments", () => {
      const message = "Test message"
      const data = { key: "value" }
      logger.log(message, data)
      
      expect(mockConsoleLog).toHaveBeenCalledWith(message, data)
      expect(mockConsoleLog).toHaveBeenCalledTimes(1)
    })

    test("handles no arguments", () => {
      logger.log()
      
      expect(mockConsoleLog).toHaveBeenCalledWith()
      expect(mockConsoleLog).toHaveBeenCalledTimes(1)
    })

    test("handles various data types", () => {
      logger.log("string", 42, true, null, undefined, { object: "test" }, [1, 2, 3])
      
      expect(mockConsoleLog).toHaveBeenCalledWith("string", 42, true, null, undefined, { object: "test" }, [1, 2, 3])
      expect(mockConsoleLog).toHaveBeenCalledTimes(1)
    })
  })

  describe("debug", () => {
    test("logs debug message in non-production environment", () => {
      mockResource.App.stage = "development"
      
      const message = "Debug message"
      logger.debug(message)
      
      expect(mockConsoleDebug).toHaveBeenCalledWith(message)
      expect(mockConsoleDebug).toHaveBeenCalledTimes(1)
      expect(mockConsoleLog).not.toHaveBeenCalled()
    })

    test("does not log debug message in production environment", () => {
      mockResource.App.stage = "production"
      
      const message = "Debug message"
      logger.debug(message)
      
      expect(mockConsoleDebug).not.toHaveBeenCalled()
      expect(mockConsoleLog).not.toHaveBeenCalled()
    })

    test("handles empty debug message", () => {
      mockResource.App.stage = "development"
      
      logger.debug("")
      
      expect(mockConsoleDebug).toHaveBeenCalledWith("")
      expect(mockConsoleDebug).toHaveBeenCalledTimes(1)
    })

    test("handles complex debug message", () => {
      mockResource.App.stage = "development"
      
      const message = "Complex debug with data: " + JSON.stringify({ key: "value", count: 42 })
      logger.debug(message)
      
      expect(mockConsoleDebug).toHaveBeenCalledWith(message)
      expect(mockConsoleDebug).toHaveBeenCalledTimes(1)
    })

    test("handles different environment stages", () => {
      const stages = ["development", "staging", "test", "preview"]
      
      stages.forEach(stage => {
        vi.clearAllMocks()
        mockResource.App.stage = stage
        
        logger.debug("test message")
        
        expect(mockConsoleDebug).toHaveBeenCalledWith("test message")
        expect(mockConsoleDebug).toHaveBeenCalledTimes(1)
      })
    })

    test("does not log in production-like environments", () => {
      const productionStages = ["production", "prod"]
      
      productionStages.forEach(stage => {
        vi.clearAllMocks()
        mockResource.App.stage = stage
        
        logger.debug("test message")
        
        expect(mockConsoleDebug).not.toHaveBeenCalled()
        expect(mockConsoleLog).not.toHaveBeenCalled()
      })
    })
  })

  describe("logger object structure", () => {
    test("has expected methods", () => {
      expect(typeof logger.metric).toBe("function")
      expect(typeof logger.log).toBe("function")
      expect(typeof logger.debug).toBe("function")
    })

    test("methods are bound correctly", () => {
      const { metric, log, debug } = logger
      
      expect(typeof metric).toBe("function")
      expect(typeof log).toBe("function")
      expect(typeof debug).toBe("function")
      
      // Test that bound methods work
      metric({ test: "value" })
      expect(mockConsoleLog).toHaveBeenCalled()
      
      vi.clearAllMocks()
      log("test")
      expect(mockConsoleLog).toHaveBeenCalled()
      
      vi.clearAllMocks()
      mockResource.App.stage = "development"
      debug("test")
      expect(mockConsoleDebug).toHaveBeenCalled()
    })
  })

  describe("edge cases", () => {
    test("handles circular objects in metric", () => {
      const circular: any = { name: "test" }
      circular.self = circular
      
      // JSON.stringify should handle circular references by throwing an error
      // but our logger should still work (the error will be caught by the test runner)
      expect(() => {
        logger.metric(circular)
      }).toThrow()
    })

    test("handles very long messages", () => {
      const longMessage = "x".repeat(10000)
      logger.log(longMessage)
      
      expect(mockConsoleLog).toHaveBeenCalledWith(longMessage)
      expect(mockConsoleLog).toHaveBeenCalledTimes(1)
    })

    test("handles special characters in messages", () => {
      const specialMessage = "Special chars: \n\t\r\"'\\"
      logger.debug(specialMessage)
      
      expect(mockConsoleDebug).toHaveBeenCalledWith(specialMessage)
      expect(mockConsoleDebug).toHaveBeenCalledTimes(1)
    })
  })
})
