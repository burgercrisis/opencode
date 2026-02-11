import { describe, expect, it, mock } from "bun:test"
import { assertExternalDirectory } from "../../src/tool/external-directory"
import { Filesystem } from "../../src/util/filesystem"
import { Instance } from "../../src/project/instance"

mock.module("../../src/project/instance", () => ({
  Instance: {
    containsPath: mock().mockImplementation((path: string) => path.includes("in-project")),
    disposeAll: mock().mockResolvedValue(undefined)
  }
}))

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
    const target = "/in-project/file.txt"
    const result = await assertExternalDirectory({} as any, target)
    expect(result).toBeUndefined()
  })

  it("asks for permission if path is outside project (file kind)", async () => {
    const askSpy = mock().mockResolvedValue(undefined)
    const ctx = { ask: askSpy } as any
    const target = "/outside/file.txt"
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
  })

  it("asks for permission if path is outside project (directory kind)", async () => {
    const askSpy = mock().mockResolvedValue(undefined)
    const ctx = { ask: askSpy } as any
    const target = "/outside/dir"
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
  })
})
