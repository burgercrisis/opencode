import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"

const app = "opencode"

const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)

export namespace Global {
  export const Path = {
    // Allow override via OPENCODE_TEST_HOME for test isolation
    get home() {
        const home = process.env.OPENCODE_TEST_HOME || os.homedir()
        return home
      },
    get data() {
      if (process.env.OPENCODE_TEST_HOME) return path.join(process.env.OPENCODE_TEST_HOME, ".local", "share", app)
      return data
    },
    get bin() {
      return path.join(this.data, "bin")
    },
    get log() {
      return path.join(this.data, "log")
    },
    get cache() {
      if (process.env.OPENCODE_TEST_HOME) return path.join(process.env.OPENCODE_TEST_HOME, ".cache", app)
      return cache
    },
    get config() {
      if (process.env.OPENCODE_TEST_HOME) return path.join(process.env.OPENCODE_TEST_HOME, ".config", app)
      return config
    },
    get state() {
      if (process.env.OPENCODE_TEST_HOME) return path.join(process.env.OPENCODE_TEST_HOME, ".local", "state", app)
      return state
    },
  }
  export async function initialize() {
    await Promise.all([
      fs.mkdir(Global.Path.data, { recursive: true }),
      fs.mkdir(Global.Path.config, { recursive: true }),
      fs.mkdir(Global.Path.state, { recursive: true }),
      fs.mkdir(Global.Path.log, { recursive: true }),
      fs.mkdir(Global.Path.bin, { recursive: true }),
    ])
  }
}

await Global.initialize()

const CACHE_VERSION = "21"

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
  await Bun.file(path.join(Global.Path.cache, "version")).write(CACHE_VERSION)
}
