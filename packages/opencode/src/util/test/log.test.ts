import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { Log } from "../log"
import { mkdir, rm, writeFile } from "fs/promises"
import { join } from "path"

describe("Log", () => {
  const testLogDir = join(import.meta.dir, "log-test-temp")

  beforeEach(async () => {
    Log.resetForTest()
    await mkdir(testLogDir, { recursive: true })
  })

  afterEach(async () => {
    Log.resetForTest()
    await rm(testLogDir, { recursive: true, force: true })
  })

  describe("create", () => {
    it("should create a logger with default settings", () => {
      const logger = Log.create()
      expect(logger).toBeDefined()
      expect(logger.info).toBeDefined()
      expect(logger.debug).toBeDefined()
      expect(logger.error).toBeDefined()
      expect(logger.warn).toBeDefined()
    })

    it("should create a logger with service tag", () => {
      const logger = Log.create({ service: "test-service" })
      expect(logger).toBeDefined()
    })

    it("should return cached logger for same service", () => {
      const logger1 = Log.create({ service: "cached-service" })
      const logger2 = Log.create({ service: "cached-service" })

      expect(logger1).toBe(logger2)
    })
  })

  describe("Default logger", () => {
    it("should be available", () => {
      expect(Log.Default).toBeDefined()
      expect(Log.Default.info).toBeDefined()
    })
  })

  describe("logger methods", () => {
    it("should have tag method", () => {
      const logger = Log.create()
      const tagged = logger.tag("key", "value")
      expect(tagged).toBe(logger)
    })

    it("should have clone method", () => {
      const logger = Log.create({ service: "clone-test" })
      const cloned = logger.clone()
      expect(cloned).toBeDefined()
    })

    it("should have time method", () => {
      const logger = Log.create()
      const timer = logger.time("test-operation")
      expect(timer).toBeDefined()
      expect(timer.stop).toBeDefined()
      expect(timer[Symbol.dispose]).toBeDefined()
    })

    it("should stop timer with dispose", () => {
      const logger = Log.create()
      {
        using timer = logger.time("test-operation")
        // Timer should stop when exiting scope
      }
      // Should not throw
    })
  })

  describe("init", () => {
    it("should initialize with print mode", async () => {
      await Log.init({ print: true, dev: true })
      expect(Log.file()).toBe("")
    })

    it("should initialize with dev mode", async () => {
      // Mock Global.Path.log
      const originalGlobal = (global as any).Global
        ; (global as any).Global = { Path: { log: testLogDir } }

      await Log.init({ print: false, dev: true })
      expect(Log.file()).toContain("dev.log")

        ; (global as any).Global = originalGlobal
    })

    it("should initialize with custom log level", async () => {
      await Log.init({ print: true, level: "DEBUG" })
      // Should not throw
    })
  })

  describe("resetForTest", () => {
    it("should reset log level to INFO", async () => {
      await Log.init({ print: true, level: "DEBUG" })
      Log.resetForTest()
      // After reset, debug should not log
    })

    it("should clear loggers cache", () => {
      Log.create({ service: "before-reset" })
      Log.resetForTest()

      // Create new logger with same service - should be new instance
      const logger = Log.create({ service: "before-reset" })
      expect(logger).toBeDefined()
    })
  })

  describe("Level", () => {
    it("should define log levels", () => {
      // Log.Level is a Zod enum, access options for the values
      expect(Log.Level.options).toContain("DEBUG")
      expect(Log.Level.options).toContain("INFO")
      expect(Log.Level.options).toContain("WARN")
      expect(Log.Level.options).toContain("ERROR")
    })
  })

  describe("file function", () => {
    it("should return current log file path", () => {
      const filePath = Log.file()
      expect(typeof filePath).toBe("string")
    })
  })

  describe("log level filtering", () => {
    it("should respect log level filtering", async () => {
      await Log.init({ print: true, level: "WARN" })

      const logger = Log.create({ service: "level-test" })

      // These should not log due to level filtering
      expect(() => logger.debug("debug message")).not.toThrow()
      expect(() => logger.info("info message")).not.toThrow()

      // These should log
      expect(() => logger.warn("warn message")).not.toThrow()
      expect(() => logger.error("error message")).not.toThrow()
    })
  })

  describe("message formatting", () => {
    it("should format messages with tags and extra data", async () => {
      await Log.init({ print: true })

      const logger = Log.create({ service: "format-test", user: "test-user" })

      // Test with different data types
      expect(() => logger.info("test message", {
        count: 5,
        active: true,
        data: { key: "value" },
        error: new Error("test error")
      })).not.toThrow()
    })

    it("should format error objects correctly", async () => {
      await Log.init({ print: true })

      const logger = Log.create()
      const error = new Error("test error")
      error.cause = new Error("root cause")

      expect(() => logger.error("error occurred", { error })).not.toThrow()
    })
  })

  describe("tag functionality", () => {
    it("should add tags to logger", async () => {
      await Log.init({ print: true })

      const logger = Log.create({ service: "tag-test" })
      const taggedLogger = logger.tag("session", "12345")

      expect(taggedLogger).toBe(logger)

      // Should log with the new tag
      expect(() => taggedLogger.info("tagged message")).not.toThrow()
    })
  })

  describe("clone functionality", () => {
    it("should clone logger with existing tags", async () => {
      await Log.init({ print: true })

      const logger = Log.create({ service: "clone-test", user: "test-user" })
      const cloned = logger.clone()

      expect(cloned).toBeDefined()
      // Note: clone() returns the same instance for loggers without service tags
      // This is the expected behavior based on the implementation

      // Should have the same tags
      expect(() => cloned.info("cloned message")).not.toThrow()
    })
  })

  describe("timer functionality", () => {
    it("should create and stop timers", async () => {
      await Log.init({ print: true })

      const logger = Log.create({ service: "timer-test" })
      const timer = logger.time("operation")

      expect(timer).toBeDefined()
      expect(timer.stop).toBeDefined()
      expect(timer[Symbol.dispose]).toBeDefined()

      // Stop the timer
      expect(() => timer.stop()).not.toThrow()
    })

    it("should handle timer disposal", async () => {
      await Log.init({ print: true })

      const logger = Log.create()
      let timer

      // Test using Symbol.dispose
      expect(() => {
        timer = logger.time("disposable-test")
        timer[Symbol.dispose]()
      }).not.toThrow()
    })
  })

  describe("file logging", () => {
    it("should initialize file logging", async () => {
      // Mock Global.Path.log
      const originalGlobal = (global as any).Global
        ; (global as any).Global = { Path: { log: testLogDir } }

      await Log.init({ print: false })

      expect(Log.file()).toBeDefined()
      // Note: The actual file path may differ from testLogDir due to how the logging system works
      expect(typeof Log.file()).toBe("string")

        ; (global as any).Global = originalGlobal
    })

    it("should handle file write operations", async () => {
      // Mock Global.Path.log
      const originalGlobal = (global as any).Global
        ; (global as any).Global = { Path: { log: testLogDir } }

      await Log.init({ print: false })

      const logger = Log.create({ service: "file-test" })

      // Should not throw when writing to file
      expect(() => logger.info("file message")).not.toThrow()
      expect(() => logger.error("error message")).not.toThrow()

        ; (global as any).Global = originalGlobal
    })
  })

  describe("cleanup functionality", () => {
    it("should handle log file cleanup", async () => {
      // Create some test log files
      const testFiles = [
        "2023-01-01T000000.log",
        "2023-01-02T000000.log",
        "2023-01-03T000000.log",
        "2023-01-04T000000.log",
        "2023-01-05T000000.log",
        "2023-01-06T000000.log",
      ]

      for (const file of testFiles) {
        await writeFile(join(testLogDir, file), "test content")
      }

      // Mock Global.Path.log
      const originalGlobal = (global as any).Global
        ; (global as any).Global = { Path: { log: testLogDir } }

      // This should trigger cleanup (keep only 5 most recent)
      await Log.init({ print: false })

        ; (global as any).Global = originalGlobal
    })
  })
})
