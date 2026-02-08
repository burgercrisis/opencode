import { Instance } from "../project/instance"
import { Log } from "../util/log"
import { Flag } from "../flag/flag"
import { Filesystem } from "../util/filesystem"

export namespace FileTime {
  const log = Log.create({ service: "file.time" })
  // Per-session read times plus per-file write locks.
  // All tools that overwrite existing files should run their
  // assert/read/write/update sequence inside withLock(filepath, ...)
  // so concurrent writes to the same file are serialized.
  export const state = Instance.state(() => {
    const read: {
      [sessionID: string]: {
        [path: string]: Date | undefined
      }
    } = {}
    const locks = new Map<string, Promise<void>>()
    return {
      read,
      locks,
    }
  })

  export function read(sessionID: string, file: string) {
    const normalized = Filesystem.normalizePath(file)
    log.info("read", { sessionID, file, normalized })
    const { read } = state()
    read[sessionID] = read[sessionID] || {}
    read[sessionID][normalized] = new Date()
  }

  export function get(sessionID: string, file: string) {
    const normalized = Filesystem.normalizePath(file)
    return state().read[sessionID]?.[normalized]
  }

  export async function withLock<T>(filepath: string, fn: () => Promise<T>): Promise<T> {
    const normalized = Filesystem.normalizePath(filepath)
    const current = state()
    const currentLock = current.locks.get(normalized) ?? Promise.resolve()
    let release: () => void = () => {}
    const nextLock = new Promise<void>((resolve) => {
      release = resolve
    })
    const chained = currentLock.then(() => nextLock)
    current.locks.set(normalized, chained)
    await currentLock
    try {
      return await fn()
    } finally {
      release()
      if (current.locks.get(normalized) === chained) {
        current.locks.delete(normalized)
      }
    }
  }

  export async function assert(sessionID: string, filepath: string) {
    if (Flag.OPENCODE_DISABLE_FILETIME_CHECK === true) {
      return
    }

    const normalized = Filesystem.normalizePath(filepath)
    const time = get(sessionID, normalized)
    if (!time) throw new Error(`You must read file ${normalized} before overwriting it. Use the Read tool first`)
    const stats = await Bun.file(normalized).stat()
    if (stats.mtime.getTime() > time.getTime()) {
      throw new Error(
        `File ${normalized} has been modified since it was last read.\nLast modification: ${stats.mtime.toISOString()}\nLast read: ${time.toISOString()}\n\nPlease read the file again before modifying it.`,
      )
    }
  }
}
