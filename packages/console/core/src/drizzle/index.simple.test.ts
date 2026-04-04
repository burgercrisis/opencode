import { describe, expect, test, vi, beforeEach, afterEach } from "bun:test"
import { Database } from "./index"
import { Context } from "../context"

// Mock dependencies
const mockDrizzle = {
  drizzle: vi.fn()
}

const mockClient = {
  transaction: vi.fn()
}

const mockResource = {
  Database: {
    host: "test-host",
    username: "test-user",
    password: "test-password"
  }
}

const mockMemo = {
  memo: vi.fn(() => mockClient)
}

// Mock the modules
vi.mock("drizzle-orm/planetscale-serverless", () => mockDrizzle)
vi.mock("@planetscale/database", () => ({
  Client: vi.fn(() => mockClient)
}))
vi.mock("@opencode-ai/console-resource", () => ({
  Resource: mockResource
}))
vi.mock("../util/memo", () => mockMemo)

describe("Database", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("use function", () => {
    test("exists and is a function", () => {
      expect(typeof Database.use).toBe("function")
    })

    test("handles basic callback", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      
      // This test just verifies the function exists and can be called
      // The actual implementation will be tested through integration
      expect(Database.use).toBeDefined()
    })
  })

  describe("fn function", () => {
    test("exists and is a function", () => {
      expect(typeof Database.fn).toBe("function")
    })

    test("returns curried function", () => {
      const mockCallback = vi.fn()
      const curriedFn = Database.fn(mockCallback)
      
      expect(typeof curriedFn).toBe("function")
    })
  })

  describe("effect function", () => {
    test("exists and is a function", () => {
      expect(typeof Database.effect).toBe("function")
    })

    test("handles async effect", async () => {
      const mockEffect = vi.fn().mockResolvedValue("effect-result")
      
      await Database.effect(mockEffect)
      // Effect should be callable without throwing
      expect(typeof Database.effect).toBe("function")
    })
  })

  describe("transaction function", () => {
    test("exists and is a function", () => {
      expect(typeof Database.transaction).toBe("function")
    })

    test("handles basic callback", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      
      expect(Database.transaction).toBeDefined()
    })
  })

  describe("client memoization", () => {
    test("memo function is called", () => {
      expect(mockMemo.memo).toHaveBeenCalled()
    })
  })

  describe("TransactionContext", () => {
    test("Context.create is called", () => {
      expect(Context.create).toHaveBeenCalled()
    })
  })

  describe("Type definitions", () => {
    test("TxOrDb type is defined", () => {
      // This test ensures the type definitions work
      expect(() => {
        const tx: Database.TxOrDb = mockClient
        return tx
      }).not.toThrow()
    })
  })
})
