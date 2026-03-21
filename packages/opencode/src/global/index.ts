import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"
import { Filesystem } from "../util/filesystem"

const app = "opencode"

// Use Tauri-style path on Windows to match production OpenCode
// This makes dev version share data with production installation
const isWindows = process.platform === "win32"
const data = isWindows
  ? path.join(process.env.APPDATA || xdgData!, "ai.opencode.desktop")
  : path.join(xdgData!, app)
const cache = isWindows
  ? path.join(process.env.LOCALAPPDATA || xdgCache!, "ai.opencode.desktop")
  : path.join(xdgCache!, app)
const config = isWindows
  ? path.join(process.env.APPDATA || xdgConfig!, "ai.opencode.desktop")
  : path.join(xdgConfig!, app)
const state = isWindows
  ? path.join(process.env.LOCALAPPDATA || xdgState!, "ai.opencode.desktop")
  : path.join(xdgState!, app)

export namespace Global {
  export const Path = {
    // Allow override via OPENCODE_TEST_HOME for test isolation
    get home() {
      return process.env.OPENCODE_TEST_HOME || os.homedir()
    },
    data,
    bin: path.join(data, "bin"),
    log: path.join(data, "log"),
    cache,
    config,
    state,
  }

  export function resetForTest() {
    // No-op for now - paths are static but this function is required by test/preload.ts
  }

  export function initialize() {
    // No-op for now - initialization is handled automatically at module load
    // This function is required by tests for compatibility
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
])

const CACHE_VERSION = "21"

const version = await Filesystem.readText(path.join(Global.Path.cache, "version")).catch(() => "0")

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
  } catch (e) { }
  await Filesystem.write(path.join(Global.Path.cache, "version"), CACHE_VERSION)
}
