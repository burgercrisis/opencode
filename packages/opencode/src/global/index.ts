import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"
import { lazy } from "../util/lazy"

const app = "opencode"

function sanitize(p: string | undefined): string | undefined {
  if (!p) return p
  
  // Convert to buffer and back to ensure no hidden null bytes
  const buf = Buffer.from(p)
  const cleanBuf = Buffer.from(buf.filter((b) => b !== 0))
  let result = cleanBuf.toString("utf8")

  // Remove literal \u0000 string and any control characters
  result = result.replace(/\\u0000/g, "").replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim()
  
  // Manual character-by-character filter for extra safety
  let clean = ""
  for (let i = 0; i < result.length; i++) {
    const code = result.charCodeAt(i)
    if (code !== 0 && code !== 65533) {
      // 65533 is replacement character
      clean += result[i]
    }
  }
  return clean.trim()
}

const data = lazy(() => path.join(sanitize(xdgData) || path.join(sanitize(os.homedir())!, ".local", "share"), app))
const cache = lazy(() => path.join(sanitize(xdgCache) || path.join(sanitize(os.homedir())!, ".cache"), app))
const config = lazy(() => path.join(sanitize(xdgConfig) || path.join(sanitize(os.homedir())!, ".config"), app))
const state = lazy(() => path.join(sanitize(xdgState) || path.join(sanitize(os.homedir())!, ".local", "state"), app))

let configOverride: string | undefined

export namespace Global {
  export const Path = {
    get home() {
      const testHome = sanitize(process.env.OPENCODE_TEST_HOME)
      if (process.env.NODE_ENV === "test" && !testHome) {
        throw new Error("Global.Path.home accessed in test without OPENCODE_TEST_HOME")
      }
      return testHome || sanitize(os.homedir())!
    },
    get data() {
      const testHome = sanitize(process.env.OPENCODE_TEST_HOME)
      const p = testHome ? path.join(testHome, ".local", "share", app) : data()
      const result = sanitize(p)!
      if (result.indexOf("\0") !== -1 || result.indexOf("\u0000") !== -1) {
        console.error(`[Global.Path.data] DETECTED CORRUPTION! Path: ${JSON.stringify(result)}`)
        return result.replace(/\0/g, "").replace(/\\u0000/g, "").trim()
      }
      // Ensure the directory exists
      try {
        const fsSync = require("fs")
        if (!fsSync.existsSync(result)) {
          fsSync.mkdirSync(result, { recursive: true })
        }
      } catch (e) {}
      return result
    },
    get bin() {
      return sanitize(path.join(this.data, "bin"))!
    },
    get log() {
      return sanitize(path.join(this.data, "log"))!
    },
    get cache() {
      const testHome = sanitize(process.env.OPENCODE_TEST_HOME)
      const p = testHome ? path.join(testHome, ".cache", app) : cache()
      const result = sanitize(p)!
      try {
        const fsSync = require("fs")
        if (!fsSync.existsSync(result)) {
          fsSync.mkdirSync(result, { recursive: true })
        }
      } catch (e) {}
      return result
    },
    get config() {
      if (configOverride) {
        return sanitize(configOverride)!
      }
      const testHome = sanitize(process.env.OPENCODE_TEST_HOME)
      const p = testHome ? path.join(testHome, ".config", app) : config()
      const result = sanitize(p)!
      
      // On Windows, some environment variables or path operations might re-introduce null bytes
      // especially when interacting with native APIs or certain Node versions.
      if (result.indexOf("\0") !== -1 || result.indexOf("\u0000") !== -1 || (result.length > 0 && result.charCodeAt(result.length - 1) === 0)) {
        const clean = result.replace(/\0/g, "").replace(/\\u0000/g, "").trim()
        console.error(`[Global.Path.config] DETECTED CORRUPTION! Path: ${JSON.stringify(result)}`)
        return clean
      }
      
      // Ensure the directory exists to avoid ENOENT on parent directory access
      // Using sync version here for getters to avoid async issues in constructor-like paths
      try {
        const fsSync = require("fs")
        if (!fsSync.existsSync(result)) {
          fsSync.mkdirSync(result, { recursive: true })
        }
      } catch (e) {
        // Ignore errors, we'll hit them later if it's a real problem
      }
      
      return result
    },
    set config(v: string) {
      if (!process.env.OPENCODE_TEST_HOME) throw new Error("Cannot override Global.Path.config outside of tests")
      configOverride = sanitize(v)
    },
    get state() {
      const testHome = sanitize(process.env.OPENCODE_TEST_HOME)
      const p = testHome ? path.join(testHome, ".local", "state", app) : state()
      const result = sanitize(p)!
      try {
        const fsSync = require("fs")
        if (!fsSync.existsSync(result)) {
          fsSync.mkdirSync(result, { recursive: true })
        }
      } catch (e) {}
      return result
    },
  }
  
  export function resetForTest() {
    configOverride = undefined
    data.reset()
    cache.reset()
    config.reset()
    state.reset()
  }
  export async function initialize() {
    await Promise.all([
      fs.mkdir(Global.Path.data, { recursive: true }),
      fs.mkdir(Global.Path.config, { recursive: true }),
      fs.mkdir(Global.Path.state, { recursive: true }),
      fs.mkdir(Global.Path.log, { recursive: true }),
      fs.mkdir(Global.Path.bin, { recursive: true }),
      fs.mkdir(Global.Path.cache, { recursive: true }),
    ])
  }
}

// Don't initialize automatically in tests to allow OPENCODE_TEST_HOME to be set
if (process.env.NODE_ENV !== "test") {
  await Global.initialize()
}

const CACHE_VERSION = "21"

async function checkCache() {
  const version = await Bun.file(path.join(Global.Path.cache, "version"))
    .text()
    .catch(() => "0")

  if (version !== CACHE_VERSION) {
    try {
      const contents = await fs.readdir(Global.Path.cache)
      await Promise.all(
        contents.map((item) =>
          fs.rm(path.join(Global.Path.cache, item), {
            recursive: true,
            force: true,
          }),
        ),
      )
    } catch (e) {}
    await fs.mkdir(Global.Path.cache, { recursive: true })
    await Bun.file(path.join(Global.Path.cache, "version")).write(CACHE_VERSION)
  }
}

if (process.env.NODE_ENV !== "test") {
  await checkCache()
}
