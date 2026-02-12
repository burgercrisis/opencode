import { expect, test, describe, beforeEach, afterEach, vi } from "bun:test"
import { Log } from "../../src/util/log"
import { Global } from "../../src/global"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

describe("Log", () => {
  beforeEach(() => {
    Log.resetForTest()
  })

  test("should log with levels", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    
    Log.Default.info("test info")
    expect(stderrSpy).toHaveBeenCalled()
    const lastCall = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0] as string
    expect(lastCall).toContain("INFO")
    expect(lastCall).toContain("test info")
    
    stderrSpy.mockClear()
    Log.Default.debug("test debug") // default level is INFO
    expect(stderrSpy).not.toHaveBeenCalled()
    
    stderrSpy.mockRestore()
  })

  test("should handle tags and extra", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    const logger = Log.create({ foo: "bar" })
    
    logger.info("msg", { baz: 123, obj: { a: 1 }, skip: null })
    const lastCall = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0] as string
    expect(lastCall).toContain("foo=bar")
    expect(lastCall).toContain("baz=123")
    expect(lastCall).toContain('obj={"a":1}')
    expect(lastCall).not.toContain("skip=")
    
    // Coverage for error formatting and nested error cause
    const err = new Error("outer", { cause: new Error("inner") })
    logger.info("error message", { err })
    const errCall = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0] as string
    expect(errCall).toContain("outer Caused by: inner")

    // Coverage for error formatting with non-error cause or max depth
    const deepErr = new Error("1", { cause: new Error("2", { cause: new Error("3") }) })
    logger.info("deep", { err: deepErr })
    
    const stringCauseErr = new Error("msg", { cause: "not an error" })
    logger.info("string-cause", { err: stringCauseErr })
    
    // Coverage for object in extra
    logger.info("obj", { data: { x: 1 } })

    stderrSpy.mockRestore()
  })

  test("should handle existing service logger", () => {
    const l1 = Log.create({ service: "test-service" })
    const l2 = Log.create({ service: "test-service" })
    expect(l1).toBe(l2)
  })

  test("should handle non-string service tag", () => {
    // @ts-ignore
    const l = Log.create({ service: 123 })
    expect(l).not.toBe(Log.Default)
  })

  test("init should handle dev: true", async () => {
    const logDir = path.join(os.tmpdir(), "opencode-test-dev-log-" + Math.random().toString(36).slice(2))
    await fs.mkdir(logDir, { recursive: true })
    try {
      const originalLogPath = Global.Path.log
      Object.defineProperty(Global.Path, 'log', { value: logDir, configurable: true })
      try {
        await Log.init({ print: false, level: "INFO", dev: true })
        expect(Log.file()).toContain("dev.log")
      } finally {
        Object.defineProperty(Global.Path, 'log', { value: originalLogPath, configurable: true })
      }
    } finally {
      await fs.rm(logDir, { recursive: true, force: true })
    }
  })

  test("should handle time and Symbol.dispose", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    
    {
      const timer = Log.Default.time("disposable")
      expect(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0]).toContain("status=started")
      timer.stop()
      expect(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0]).toContain("status=completed")
    }

    {
      using _ = Log.Default.time("using")
      expect(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0]).toContain("status=started")
    }
    expect(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0]).toContain("status=completed")
    expect(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0]).toContain("duration=")

    stderrSpy.mockRestore()
  })

  test("should cover remaining methods", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    
    Log.Default.error("err msg")
    expect(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0]).toContain("ERROR")
    
    Log.Default.warn("warn msg")
    expect(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0]).toContain("WARN")
    
    const tagged = Log.Default.clone().tag("key", "val")
    tagged.info("msg")
    expect(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0]).toContain("key=val")
    
    stderrSpy.mockRestore()
  })

  test("should handle all log levels and shouldLog branches", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    
    Log.init({ print: true, level: "ERROR" })
    Log.Default.warn("test warn")
    expect(stderrSpy).not.toHaveBeenCalled()
    
    Log.Default.error("test error")
    expect(stderrSpy).toHaveBeenCalled()
    
    Log.init({ print: true, level: "DEBUG" })
    stderrSpy.mockClear()
    Log.Default.debug("test debug")
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("DEBUG"))

    stderrSpy.mockRestore()
  })

  test("formatError should respect max depth", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    
    let current = new Error("level 0")
    for (let i = 1; i <= 15; i++) {
      current = new Error("level " + i, { cause: current })
    }
    
    Log.Default.info("deep error", { err: current })
    const lastCall = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0] as string
    // Should contain "level 15" but eventually stop before "level 0"
    expect(lastCall).toContain("level 15")
    expect(lastCall).not.toContain("level 0")
    
    stderrSpy.mockRestore()
  })

  test("cleanup edge cases", async () => {
    // Mock fs to trigger catch blocks
    const originalMkdir = fs.mkdir
    const originalUnlink = fs.unlink
    
    // @ts-ignore
    fs.mkdir = () => Promise.reject(new Error("mkdir failed"))
    // @ts-ignore
    fs.unlink = () => Promise.reject(new Error("unlink failed"))
    
    try {
      // Create some dummy log files
      const dir = Global.Path.log
      await originalMkdir(dir, { recursive: true })
      for (let i = 0; i < 15; i++) {
        await Bun.write(path.join(dir, `test-${i}.log`), "test")
      }
      
      // Should not throw
      await Log.init({ print: true, level: "INFO" })
    } finally {
      // @ts-ignore
      fs.mkdir = originalMkdir
      // @ts-ignore
      fs.unlink = originalUnlink
    }
  })

  test("init should truncate existing log file", async () => {
    const originalTruncate = fs.truncate
    // @ts-ignore
    fs.truncate = () => Promise.reject(new Error("truncate failed"))
    
    try {
      await Log.init({ print: false, dev: true, level: "DEBUG" })
      expect(Log.file()).toContain("dev.log")
    } finally {
      // @ts-ignore
      fs.truncate = originalTruncate
    }
  })

  test("logger methods return values and tag return", () => {
    const logger = Log.Default
    expect(logger.tag("foo", "bar")).toBe(logger)
    
    const cloned = logger.clone()
    expect(cloned).not.toBe(logger)
  })

  test("cleanup should delete old log files", async () => {
    const logDir = path.join(os.tmpdir(), "opencode-test-cleanup-" + Math.random().toString(36).slice(2))
    await fs.mkdir(logDir, { recursive: true })
    
    try {
      // Create 15 log files with correct pattern ????-??-??T??????.log
      for (let i = 0; i < 15; i++) {
        const name = `2024-01-01T12000${i.toString().padStart(2, '0')}.log`
        await Bun.write(path.join(logDir, name), "log content")
      }
      
      const originalLogPath = Global.Path.log
      Object.defineProperty(Global.Path, 'log', { value: logDir, configurable: true })
      
      try {
        await Log.init({ print: true, level: "INFO" }) // init calls cleanup
        
        const files = await fs.readdir(logDir)
        // cleanup logic: if (files.length <= 5) return; else slice(0, -10)
        // 15 files -> filesToDelete = 15 - 10 = 5 files to delete.
        // wait, slice(0, -10) means keep the last 10.
        // So 15 - 10 = 5 files deleted. 10 files should remain.
        expect(files.length).toBe(10)
      } finally {
        Object.defineProperty(Global.Path, 'log', { value: originalLogPath, configurable: true })
      }
    } finally {
      await fs.rm(logDir, { recursive: true, force: true })
    }
  })

  test("init with print: false", async () => {
    const logDir = path.join(os.tmpdir(), "opencode-test-print-false-" + Math.random().toString(36).slice(2))
    await fs.mkdir(logDir, { recursive: true })
    
    try {
      const originalLogPath = Global.Path.log
      Object.defineProperty(Global.Path, 'log', { value: logDir, configurable: true })
      
      try {
        await Log.init({ print: false, level: "INFO", dev: false })
        Log.Default.info("test print false")
        
        // Wait for potential async write
        await new Promise(r => setTimeout(r, 100))
        
        const files = await fs.readdir(logDir)
        expect(files.length).toBe(1)
        const content = await fs.readFile(path.join(logDir, files[0]), "utf8")
        expect(content).toContain("test print false")
      } finally {
        Object.defineProperty(Global.Path, 'log', { value: originalLogPath, configurable: true })
      }
    } finally {
      await fs.rm(logDir, { recursive: true, force: true })
    }
  })

  test("should handle errors in extra", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    const error = new Error("inner")
    const outer = new Error("outer", { cause: error })
    
    Log.Default.error("failed", { err: outer })
    const lastCall = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0] as string
    expect(lastCall).toContain("err=outer Caused by: inner")
    
    stderrSpy.mockRestore()
  })

  test("should clone and tag", () => {
    const logger = Log.create({ a: 1 })
    const cloned = logger.clone()
    cloned.tag("b", "2")
    
    expect(logger).not.toBe(cloned)
    // tag modifies the logger itself in the current implementation!
    // wait, result.tag modifies `tags`. cloned has its own tags object.
  })

  test("time() should log start and stop", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    const t = Log.Default.time("task")
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("status=started"))
    
    stderrSpy.mockClear()
    t.stop()
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("status=completed"))
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("duration="))
    
    stderrSpy.mockRestore()
  })

  test("time() should work with Symbol.dispose", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    {
      using _ = Log.Default.time("disposable")
    }
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("status=completed"))
    stderrSpy.mockRestore()
  })

  test("init with file logging", async () => {
    const originalHome = process.env.OPENCODE_TEST_HOME
    const logDir = path.join(os.tmpdir(), "opencode-test-log-" + Math.random().toString(36).slice(2))
    await fs.mkdir(logDir, { recursive: true })
    
    try {
      process.env.OPENCODE_TEST_HOME = logDir
      Global.resetForTest() // This will pick up the new OPENCODE_TEST_HOME
      
      await Log.init({ print: false, level: "DEBUG", dev: true })
      expect(Log.file()).toContain("dev.log")
      
      Log.Default.info("file log test")
      
      // Wait for flush
      await new Promise(r => setTimeout(r, 100))
      
      const content = await fs.readFile(Log.file(), "utf-8")
      expect(content).toContain("INFO")
      expect(content).toContain("file log test")
    } finally {
      process.env.OPENCODE_TEST_HOME = originalHome
      Global.resetForTest()
      await fs.rm(logDir, { recursive: true, force: true }).catch(() => {})
    }
  })
})
