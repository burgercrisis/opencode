import { expect, test } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import type * as SDK from "@opencode-ai/sdk/v2"

test("sdk v2 client exposes expected api surface", () => {
  const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:4096" })
  expect(typeof client.global.health).toBe("function")
  expect(typeof client.project.list).toBe("function")
})

test("sdk v2 types are exported", () => {
  const _x: SDK.Message | undefined = undefined
  expect(_x).toBeUndefined()
})
