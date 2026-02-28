import { test, expect, beforeEach, afterEach, beforeAll, describe, mock, spyOn, restoreAllMocks } from "bun:test"
import path from "path"
import os from "os"
import fs from "fs"

// Track what options were passed to each transport constructor
let transportCalls: Array<{
  type: "streamable" | "sse"
  url: string
  options: { authProvider?: unknown; requestInit?: RequestInit }
}> = []

// Mock the transport constructors to capture their arguments
const MockStreamableHTTP = mock(() => {
  return {
    start: async () => {
      throw new Error("Mock transport cannot connect")
    },
  }
})

const MockSSE = mock(() => {
  return {
    start: async () => {
      throw new Error("Mock transport cannot connect")
    },
  }
})

let MCP: any
let Instance: any
let tmpdir: any

describe("MCP Headers", () => {
  beforeAll(async () => {
    // Global is auto-initialized via preload.ts
    const { Config } = await import("../../src/config/config")
    Config.global.reset()

    const mcpMod = await import("../../src/mcp/index")
    MCP = mcpMod.MCP
    const instanceMod = await import("../../src/project/instance")
    Instance = instanceMod.Instance
    const fixtureMod = await import("../fixture/fixture")
    tmpdir = fixtureMod.tmpdir
  })

  beforeEach(() => {
    transportCalls = []
  })

  afterEach(() => {
    restoreAllMocks()
  })

  test("headers are passed to transports when oauth is enabled (default)", async () => {
    await using tmp = await tmpdir({
      init: async (dir: string) => {
        await Bun.write(
          `${dir}/opencode.json`,
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            mcp: {
              "test-server": {
                type: "remote",
                url: "https://example.com/mcp",
                headers: {
                  Authorization: "Bearer test-token",
                  "X-Custom-Header": "custom-value",
                },
              },
            },
          }),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Trigger MCP initialization - it will fail to connect but we can check the transport options
        await MCP.add("test-server", {
          type: "remote",
          url: "https://example.com/mcp",
          headers: {
            Authorization: "Bearer test-token",
            "X-Custom-Header": "custom-value",
          },
        }).catch(() => {})

        // Both transports should have been created with headers
        expect(transportCalls.length).toBeGreaterThanOrEqual(1)

        for (const call of transportCalls) {
          expect(call.options.requestInit).toBeDefined()
          expect(call.options.requestInit?.headers).toEqual({
            Authorization: "Bearer test-token",
            "X-Custom-Header": "custom-value",
          })
          // OAuth should be enabled by default, so authProvider should exist
          expect(call.options.authProvider).toBeDefined()
        }
      },
    })
  })

  test("headers are passed to transports when oauth is explicitly disabled", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        transportCalls.length = 0

        await MCP.add("test-server-no-oauth", {
          type: "remote",
          url: "https://example.com/mcp",
          oauth: false,
          headers: {
            Authorization: "Bearer test-token",
          },
        }).catch(() => {})

        expect(transportCalls.length).toBeGreaterThanOrEqual(1)

        for (const call of transportCalls) {
          expect(call.options.requestInit).toBeDefined()
          expect(call.options.requestInit?.headers).toEqual({
            Authorization: "Bearer test-token",
          })
          // OAuth is disabled, so no authProvider
          expect(call.options.authProvider).toBeUndefined()
        }
      },
    })
  })

  test("no requestInit when headers are not provided", async () => {
    await using tmp = await tmpdir()

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        transportCalls.length = 0

        await MCP.add("test-server-no-headers", {
          type: "remote",
          url: "https://example.com/mcp",
        }).catch(() => {})

        expect(transportCalls.length).toBeGreaterThanOrEqual(1)

        for (const call of transportCalls) {
          // No headers means requestInit should be undefined
          expect(call.options.requestInit).toBeUndefined()
        }
      },
    })
  })
})
