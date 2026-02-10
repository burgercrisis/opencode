import { expect, test, describe, beforeEach, afterEach, vi } from "bun:test"
import { Log } from "../../src/util/log"
import { Global } from "../../src/global"
import fs from "node:fs/promises"
import path from "node:path"

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
    
    logger.info("msg", { baz: 123 })
    const lastCall = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0] as string
    expect(lastCall).toContain("foo=bar")
    expect(lastCall).toContain("baz=123")
    
    stderrSpy.mockRestore()
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
    const logDir = path.join(Global.Path.log, "test-init")
    await fs.mkdir(logDir, { recursive: true })
    
    // We need to mock Global.Path.log to return our temp dir
    const logSpy = vi.spyOn(Global.Path, "log", "get").mockReturnValue(logDir)
    
    await Log.init({ print: false, level: "DEBUG", dev: true })
    expect(Log.file()).toContain("dev.log")
    
    Log.Default.info("file log test")
    
    // Wait for flush
    await new Promise(r => setTimeout(r, 100))
    
    const content = await fs.readFile(Log.file(), "utf-8")
    expect(content).toContain("INFO")
    expect(content).toContain("file log test")
    
    logSpy.mockRestore()
  })
})
