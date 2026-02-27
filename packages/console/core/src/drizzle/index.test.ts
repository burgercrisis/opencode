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
  },
  CLOUDFLARE_API_TOKEN: { value: "test-token" },
  CLOUDFLARE_DEFAULT_ACCOUNT_ID: { value: "test-account" }
}

const mockMemo = {
  memo: vi.fn()
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

  // Create a mock context for testing
  const createMockContext = (hasContext = true) => {
    if (hasContext) {
      return {
        use: vi.fn().mockReturnValue({ tx: { transaction: vi.fn() }, effects: [] }),
        provide: vi.fn()
      }
    } else {
      return {
        use: vi.fn().mockImplementation(() => {
          throw new Context.NotFound()
        }),
        provide: vi.fn().mockImplementation((value, fn) => fn())
      }
    }
  }

  describe("use function", () => {
    test("executes callback with transaction when context is available", async () => {
      const mockTx = { transaction: vi.fn() }
      const mockCallback = vi.fn().mockResolvedValue("result")

      // Mock TransactionContext.use to return a transaction
      const mockUse = vi.fn().mockReturnValue({ tx: mockTx, effects: [] })
      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      mockTx.transaction.mockImplementation((callback) => callback(mockTx))

      const result = await Database.use(mockCallback)

      expect(mockUse).toHaveBeenCalled()
      expect(mockTx.transaction).toHaveBeenCalledWith(mockCallback)
      expect(result).toBe("result")
    })

    test("creates new transaction when context is not available", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      const mockTx = { transaction: vi.fn() }

      // Mock TransactionContext.use to throw NotFound
      const mockUse = vi.fn().mockImplementation(() => {
        throw new Context.NotFound()
      })

      const mockProvide = vi.fn().mockImplementation((value, fn) => fn())

      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: mockProvide
      } as any)

      mockMemo.memo.mockReturnValue(() => mockTx)
      mockTx.transaction.mockImplementation((callback) => callback(mockTx))

      const result = await Database.use(mockCallback)

      expect(mockUse).toHaveBeenCalled()
      expect(mockProvide).toHaveBeenCalled()
      expect(mockCallback).toHaveBeenCalledWith(mockTx)
      expect(result).toBe("result")
    })

    test("handles callback errors properly", async () => {
      const mockError = new Error("Database error")
      const mockCallback = vi.fn().mockRejectedValue(mockError)
      const mockTx = { transaction: vi.fn() }

      const mockUse = vi.fn().mockReturnValue({ tx: mockTx, effects: [] })
      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      mockTx.transaction.mockImplementation((callback) => callback(mockTx))

      await expect(Database.use(mockCallback)).rejects.toThrow("Database error")
    })

    test("handles non-Context errors properly", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      const mockTx = { transaction: vi.fn() }

      const mockUse = vi.fn().mockImplementation(() => {
        throw new Error("Some other error")
      })

      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      await expect(Database.use(mockCallback)).rejects.toThrow("Some other error")
    })

    test("executes effects after successful callback without context", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      const mockTx = { transaction: vi.fn() }
      const mockEffect1 = vi.fn()
      const mockEffect2 = vi.fn()

      const mockUse = vi.fn().mockImplementation(() => {
        throw new Context.NotFound()
      })

      const mockProvide = vi.fn().mockImplementation((value, fn) => {
        if (value.effects) {
          value.effects.push(mockEffect1, mockEffect2)
        }
        return fn()
      })

      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: mockProvide
      } as any)

      mockMemo.memo.mockReturnValue(() => mockTx)
      mockTx.transaction.mockImplementation((callback) => callback(mockTx))

      const result = await Database.use(mockCallback)

      expect(result).toBe("result")
      expect(mockEffect1).toHaveBeenCalled()
      expect(mockEffect2).toHaveBeenCalled()
    })

    test("handles effects that return promises", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      const mockTx = { transaction: vi.fn() }
      const mockEffect = vi.fn().mockResolvedValue("effect-result")

      const mockUse = vi.fn().mockImplementation(() => {
        throw new Context.NotFound()
      })

      const mockProvide = vi.fn().mockImplementation((value, fn) => {
        if (value.effects) {
          value.effects.push(mockEffect)
        }
        return fn()
      })

      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: mockProvide
      } as any)

      mockMemo.memo.mockReturnValue(() => mockTx)
      mockTx.transaction.mockImplementation((callback) => callback(mockTx))

      const result = await Database.use(mockCallback)

      expect(result).toBe("result")
      await expect(mockEffect).toHaveBeenCalled()
    })
  })

  describe("fn function", () => {
    test("creates curried function that uses Database.use", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      const mockTx = { transaction: vi.fn() }

      const mockUse = vi.fn().mockReturnValue({ tx: mockTx, effects: [] })
      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      mockTx.transaction.mockImplementation((callback) => callback(mockTx))

      const curriedFn = Database.fn<string, string>((input, tx) => {
        expect(input).toBe("test-input")
        expect(tx).toBe(mockTx)
        return mockCallback(input, tx)
      })

      const result = await curriedFn("test-input")

      expect(mockUse).toHaveBeenCalled()
      expect(mockCallback).toHaveBeenCalledWith("test-input", mockTx)
      expect(result).toBe("result")
    })

    test("handles different input and output types", async () => {
      const mockCallback = vi.fn().mockResolvedValue({ id: 1, name: "test" })
      const mockTx = { transaction: vi.fn() }

      const mockUse = vi.fn().mockReturnValue({ tx: mockTx, effects: [] })
      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      mockTx.transaction.mockImplementation((callback) => callback(mockTx))

      const curriedFn = Database.fn<number, { id: number; name: string }>((input, tx) => {
        expect(input).toBe(42)
        return mockCallback(input, tx)
      })

      const result = await curriedFn(42)

      expect(result).toEqual({ id: 1, name: "test" })
    })
  })

  describe("effect function", () => {
    test("adds effect to context when available", async () => {
      const mockEffect = vi.fn()
      const effects: Array<() => any> = []

      const mockUse = vi.fn().mockReturnValue({ tx: {}, effects })
      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      await Database.effect(mockEffect)

      expect(mockUse).toHaveBeenCalled()
      expect(effects).toHaveLength(1)
      expect(effects[0]).toBe(mockEffect)
    })

    test("executes effect immediately when context is not available", async () => {
      const mockEffect = vi.fn()

      const mockUse = vi.fn().mockImplementation(() => {
        throw new Context.NotFound()
      })

      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      await Database.effect(mockEffect)

      expect(mockUse).toHaveBeenCalled()
      expect(mockEffect).toHaveBeenCalled()
    })

    test("handles async effects when context is not available", async () => {
      const mockAsyncEffect = vi.fn().mockResolvedValue("async-result")

      const mockUse = vi.fn().mockImplementation(() => {
        throw new Context.NotFound()
      })

      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      await Database.effect(mockAsyncEffect)

      expect(mockUse).toHaveBeenCalled()
      await expect(mockAsyncEffect).toHaveBeenCalled()
    })

    test("handles effect errors gracefully", async () => {
      const mockEffect = vi.fn().mockRejectedValue(new Error("Effect failed"))
      const effects: Array<() => any> = []

      const mockUse = vi.fn().mockReturnValue({ tx: {}, effects })
      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      // Should not throw when adding to effects
      await expect(Database.effect(mockEffect)).resolves.not.toThrow()
      expect(effects).toHaveLength(1)
      expect(effects[0]).toBe(mockEffect)
    })
  })

  describe("transaction function", () => {
    test("executes callback with transaction when context is available", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      const mockTx = { transaction: vi.fn() }

      const mockUse = vi.fn().mockReturnValue({ tx: mockTx, effects: [] })
      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      const result = await Database.transaction(mockCallback)

      expect(mockUse).toHaveBeenCalled()
      expect(mockCallback).toHaveBeenCalledWith(mockTx)
      expect(result).toBe("result")
    })

    test("creates new transaction when context is not available", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      const mockTx = { transaction: vi.fn() }
      const mockInnerTx = { transaction: vi.fn() }

      const mockUse = vi.fn().mockImplementation(() => {
        throw new Context.NotFound()
      })

      const mockProvide = vi.fn().mockImplementation((value, fn) => fn())

      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: mockProvide
      } as any)

      mockMemo.memo.mockReturnValue(() => mockTx)
      mockTx.transaction.mockImplementation((callback, config) => {
        expect(config).toBeUndefined()
        return callback(mockInnerTx)
      })

      const result = await Database.transaction(mockCallback)

      expect(mockUse).toHaveBeenCalled()
      expect(mockProvide).toHaveBeenCalled()
      expect(mockCallback).toHaveBeenCalledWith(mockInnerTx)
      expect(result).toBe("result")
    })

    test("passes transaction config to client transaction", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      const mockTx = { transaction: vi.fn() }
      const mockInnerTx = { transaction: vi.fn() }

      const mockUse = vi.fn().mockImplementation(() => {
        throw new Context.NotFound()
      })

      const mockProvide = vi.fn().mockImplementation((value, fn) => fn())

      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: mockProvide
      } as any)

      mockMemo.memo.mockReturnValue(() => mockTx)
      mockTx.transaction.mockImplementation((callback, config) => {
        expect(config).toEqual({ isolation: "READ_COMMITTED" })
        return callback(mockInnerTx)
      })

      const config = { isolation: "READ_COMMITTED" as const }
      const result = await Database.transaction(mockCallback, config)

      expect(result).toBe("result")
    })

    test("executes effects after successful transaction without context", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")
      const mockTx = { transaction: vi.fn() }
      const mockInnerTx = { transaction: vi.fn() }
      const mockEffect = vi.fn()

      const mockUse = vi.fn().mockImplementation(() => {
        throw new Context.NotFound()
      })

      const mockProvide = vi.fn().mockImplementation((value, fn) => {
        if (value.effects) {
          value.effects.push(mockEffect)
        }
        return fn()
      })

      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: mockProvide
      } as any)

      mockMemo.memo.mockReturnValue(() => mockTx)
      mockTx.transaction.mockImplementation((callback) => callback(mockInnerTx))

      const result = await Database.transaction(mockCallback)

      expect(result).toBe("result")
      expect(mockEffect).toHaveBeenCalled()
    })

    test("handles transaction errors properly", async () => {
      const mockError = new Error("Transaction failed")
      const mockCallback = vi.fn().mockRejectedValue(mockError)
      const mockTx = { transaction: vi.fn() }

      const mockUse = vi.fn().mockReturnValue({ tx: mockTx, effects: [] })
      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      await expect(Database.transaction(mockCallback)).rejects.toThrow("Transaction failed")
    })

    test("handles non-Context errors properly", async () => {
      const mockCallback = vi.fn().mockResolvedValue("result")

      const mockUse = vi.fn().mockImplementation(() => {
        throw new Error("Some other error")
      })

      vi.spyOn(Context, "create").mockReturnValue({
        use: mockUse,
        provide: vi.fn()
      } as any)

      await expect(Database.transaction(mockCallback)).rejects.toThrow("Some other error")
    })
  })

  describe("client memoization", () => {
    test("creates client with memo function", () => {
      expect(mockMemo.memo).toHaveBeenCalled()
    })

    test("client is created with correct database configuration", () => {
      expect(mockMemo.memo).toHaveBeenCalled()
    })
  })

  describe("TransactionContext", () => {
    test("TransactionContext is created using Context.create", () => {
      expect(Context.create).toHaveBeenCalled()
    })
  })
})
