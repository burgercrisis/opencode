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
    
    stderrSpy.mockRestore()
  })

  test("should handle all log levels", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    
    Log.Default.warn("test warn")
    expect(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0]).toContain("WARN")
    
    Log.Default.error("test error")
    expect(stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0]).toContain("ERROR")
    
    stderrSpy.mockRestore()
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
