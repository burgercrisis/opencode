import { describe, expect, it, mock } from "bun:test"
import { assertExternalDirectory } from "../../src/tool/external-directory"
import { Filesystem } from "../../src/util/filesystem"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import * as path from "path"

describe("assertExternalDirectory", () => {
  it("returns undefined if target is missing", async () => {
    const result = await assertExternalDirectory({} as any)
    expect(result).toBeUndefined()
  })

  it("returns undefined if bypass is true", async () => {
    const result = await assertExternalDirectory({} as any, "/outside", { bypass: true })
    expect(result).toBeUndefined()
  })

  it("returns undefined if path is inside project", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const target = path.join(tmp.path, "file.txt")
        const result = await assertExternalDirectory({} as any, target)
        expect(result).toBeUndefined()
      },
    })
  })

  it("asks for permission if path is outside project (file kind)", async () => {
    await using tmp = await tmpdir({ git: true })
    await using outerTmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const askSpy = mock().mockResolvedValue(undefined)
        const ctx = { ask: askSpy } as any
        const target = path.join(outerTmp.path, "file.txt")
        const nativeTarget = Filesystem.nativePath(target)
        const parentDir = Filesystem.dirname(nativeTarget)
        const glob = Filesystem.join(parentDir, "*")

        await assertExternalDirectory(ctx, target)

        expect(askSpy).toHaveBeenCalledWith({
          permission: "external_directory",
          patterns: [glob],
          always: [glob],
          metadata: {
            filepath: nativeTarget,
            parentDir,
          }
        })
      },
    })
  })

  it("asks for permission if path is outside project (directory kind)", async () => {
    await using tmp = await tmpdir({ git: true })
    await using outerTmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const askSpy = mock().mockResolvedValue(undefined)
        const ctx = { ask: askSpy } as any
        const target = outerTmp.path
        const nativeTarget = Filesystem.nativePath(target)
        const glob = Filesystem.join(nativeTarget, "*")

        await assertExternalDirectory(ctx, target, { kind: "directory" })

        expect(askSpy).toHaveBeenCalledWith({
          permission: "external_directory",
          patterns: [glob],
          always: [glob],
          metadata: {
            filepath: nativeTarget,
            parentDir: nativeTarget,
          }
        })
      },
    })
  })
})
