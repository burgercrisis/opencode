import { describe, test, expect, mock } from "bun:test"
import { assertExternalDirectory } from "../external-directory"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import * as path from "path"

describe("assertExternalDirectory", () => {
  const mockCtx = {
    sessionID: "test-session",
    messageID: "test-message",
    agent: "test-agent",
    abort: new AbortController().signal,
    messages: [],
    metadata: mock(() => {}),
    ask: mock(async () => {}),
  }

  test("should return undefined when path is within instance", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Pass ctx first, then the path
        const result = await assertExternalDirectory(mockCtx, path.join(tmp.path, "subdir"))
        expect(result).toBeUndefined()
      },
    })
  })

  test("should return undefined when target is undefined", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await assertExternalDirectory(mockCtx, undefined)
        expect(result).toBeUndefined()
      },
    })
  })

  test("should return undefined when bypass is true", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Use a path that's definitely outside the instance
        const externalPath = "C:\\external\\path"
        
        const result = await assertExternalDirectory(mockCtx, externalPath, { bypass: true })
        expect(result).toBeUndefined()
      },
    })
  })

  test("should request permission for external directory", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Use a path that's definitely outside the instance
        const externalPath = "C:\\external\\path"
        
        const result = assertExternalDirectory(mockCtx, externalPath)
        // The function returns a promise when permission is needed
        expect(result).toBeDefined()
        if (result) {
          await result
        }
        
        expect(mockCtx.ask).toHaveBeenCalled()
      },
    })
  })

  test("should handle directory kind option", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const externalPath = "C:\\external\\dir"
        
        const result = assertExternalDirectory(mockCtx, externalPath, { kind: "directory" })
        expect(result).toBeDefined()
        if (result) {
          await result
        }
        
        expect(mockCtx.ask).toHaveBeenCalled()
      },
    })
  })

  test("should handle file kind option (default)", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const externalPath = "C:\\external\\file.txt"
        
        const result = assertExternalDirectory(mockCtx, externalPath, { kind: "file" })
        expect(result).toBeDefined()
        if (result) {
          await result
        }
        
        expect(mockCtx.ask).toHaveBeenCalled()
      },
    })
  })
})
