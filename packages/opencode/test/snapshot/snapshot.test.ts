import { describe, test, expect } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { Snapshot } from "../../src/snapshot"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"

describe("Snapshot", () => {
  // @ts-expect-error - Bun test describe.timeout() exists at runtime
  describe.timeout(90000)

  function normalizePath(p: string): string {
  return p.replace(/\\/g, "/")
}

async function bootstrap() {
  return tmpdir({
    git: true,
    init: async (dir) => {
      const unique = Math.random().toString(36).slice(2)
      const aContent = `A${unique}`
      const bContent = `B${unique}`
      await Filesystem.write(`${dir}/a.txt`, aContent)
      await Filesystem.write(`${dir}/b.txt`, bContent)
      await $`git add .`.cwd(dir).quiet()
      await $`git commit --no-gpg-sign -m init`.cwd(dir).quiet()
      return {
        aContent,
        bContent,
      }
    },
  })
}

test("track", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const tracked = await Snapshot.track()
      expect(tracked).toBeTruthy()
    },
  })
})

test("track and patch returns empty patch", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()
      const patch = await Snapshot.patch(before!)
      expect(patch).toBeTruthy()
      expect(patch.files).toEqual([])
    },
  })
})

test("tracks new files", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      await Filesystem.write(`${tmp.path}/new.txt`, "NEW")

      const patch = await Snapshot.patch(before!)
      expect(patch.files).toContain(normalizePath(`${tmp.path}/new.txt`))
    },
  })
})

test("tracks modified files", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      await Filesystem.write(`${tmp.path}/a.txt`, "MODIFIED")

      const patch = await Snapshot.patch(before!)
      expect(patch.files).toContain(normalizePath(`${tmp.path}/a.txt`))
    },
  })
})

test("tracks deleted files correctly", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      // Use Bun's fs API instead of rm command for cross-platform compatibility
      await fs.unlink(`${tmp.path}/a.txt`)

      const patch = await Snapshot.patch(before!)
      expect(patch.files).toContain(normalizePath(`${tmp.path}/a.txt`))
    },
  })
})

test("revert should remove new files", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      await Filesystem.write(`${tmp.path}/new.txt`, "NEW")

      await Snapshot.revert([await Snapshot.patch(before!)])

      expect(
        await fs
          .access(`${tmp.path}/new.txt`)
          .then(() => true)
          .catch(() => false),
      ).toBe(false)
    },
  })
})

test("revert in subdirectory", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      // Use Bun's fs API for cross-platform mkdir
      await fs.mkdir(`${tmp.path}/sub`, { recursive: true })
      await Filesystem.write(`${tmp.path}/sub/file.txt`, "SUB")

      await Snapshot.revert([await Snapshot.patch(before!)])

      expect(
        await fs
          .access(`${tmp.path}/sub/file.txt`)
          .then(() => true)
          .catch(() => false),
      ).toBe(false)
    },
  })
})

test("multiple file operations", async () => {
  await using tmp = await bootstrap()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const before = await Snapshot.track()
      expect(before).toBeTruthy()

      // Multiple operations using cross-platform APIs
      await fs.unlink(`${tmp.path}/a.txt`)
      await fs.mkdir(`${tmp.path}/dir`, { recursive: true })
      await Filesystem.write(`${tmp.path}/new.txt`, "NEW")
      await Filesystem.write(`${tmp.path}/b.txt`, "MODIFIED")

      const patch = await Snapshot.patch(before!)
      expect(patch.files.length).toBeGreaterThan(0)
    },
  })
})  // End of Snapshot describe block
})
