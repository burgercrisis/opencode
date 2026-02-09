import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"
import { lazy } from "../util/lazy"

const app = "opencode"

function sanitize(p: string | undefined): string | undefined {
  return p?.replace(/\0/g, "").trim()
}

const data = lazy(() => path.join(xdgData || path.join(os.homedir(), ".local", "share"), app))
const cache = lazy(() => path.join(xdgCache || path.join(os.homedir(), ".cache"), app))
const config = lazy(() => path.join(xdgConfig || path.join(os.homedir(), ".config"), app))
const state = lazy(() => path.join(xdgState || path.join(os.homedir(), ".local", "state"), app))

let configOverride: string | undefined

export namespace Global {
  export const Path = {
    get home() {
      const testHome = sanitize(process.env.OPENCODE_TEST_HOME)
      if (process.env.NODE_ENV === "test" && !testHome) {
        throw new Error("Global.Path.home accessed in test without OPENCODE_TEST_HOME")
      }
      return testHome || os.homedir()
    },
    get data() {
      const testHome = sanitize(process.env.OPENCODE_TEST_HOME)
      if (testHome) return path.join(testHome, ".local", "share", app)
      return data()
    },
    get bin() {
      return path.join(this.data, "bin")
    },
    get log() {
      return path.join(this.data, "log")
    },
    get cache() {
      const testHome = sanitize(process.env.OPENCODE_TEST_HOME)
      if (testHome) return path.join(testHome, ".cache", app)
      return cache()
    },
    get config() {
      if (configOverride) return configOverride
      const testHome = sanitize(process.env.OPENCODE_TEST_HOME)
      return testHome ? path.join(testHome, ".config", app) : config()
    },
    set config(v: string) {
      if (!process.env.OPENCODE_TEST_HOME) throw new Error("Cannot override Global.Path.config outside of tests")
      configOverride = v
    },
    get state() {
      const testHome = sanitize(process.env.OPENCODE_TEST_HOME)
      if (testHome) return path.join(testHome, ".local", "state", app)
      return state()
    },
  }
  
  export function resetForTest() {
    configOverride = undefined
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
