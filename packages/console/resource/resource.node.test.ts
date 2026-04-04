import { describe, expect, test, vi, beforeEach, afterEach } from "bun:test"
import { Resource, waitUntil } from "./resource.node"

// Mock dependencies
const mockCloudflare = vi.fn()
const mockCloudflareClient = {
  kv: {
    namespaces: {
      bulkGet: vi.fn(),
      keys: {
        list: vi.fn()
      },
      values: {
        update: vi.fn(),
        delete: vi.fn()
      }
    }
  }
}

const mockResourceBase = {
  CLOUDFLARE_API_TOKEN: { value: "test-api-token" },
  CLOUDFLARE_DEFAULT_ACCOUNT_ID: { value: "test-account-id" },
  bucket: {
    type: "sst.cloudflare.Bucket"
  },
  kv: {
    type: "sst.cloudflare.Kv",
    namespaceId: "test-namespace-id"
  },
  other: {
    type: "other.type"
  }
}

// Mock the modules
vi.mock("cloudflare", () => ({
  default: mockCloudflare
}))

vi.mock("sst", () => ({
  Resource: mockResourceBase
}))

vi.mock("@cloudflare/workers-types", () => ({}))

describe("waitUntil", () => {
  test("awaits promise resolution", async () => {
    const mockPromise = vi.fn().mockResolvedValue("test result")
    await waitUntil(mockPromise())

    expect(mockPromise).toHaveBeenCalled()
  })

  test("awaits promise rejection", async () => {
    const mockPromise = vi.fn().mockRejectedValue(new Error("test error"))

    await expect(waitUntil(mockPromise())).rejects.toThrow("test error")
    expect(mockPromise).toHaveBeenCalled()
  })

  test("handles non-promise values", async () => {
    const result = await waitUntil("test value")
    expect(result).toBe("test value")
  })

  test("handles async function", async () => {
    const mockAsyncFn = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return "async result"
    })

    const result = await waitUntil(mockAsyncFn())
    expect(result).toBe("async result")
    expect(mockAsyncFn).toHaveBeenCalled()
  })

  test("handles undefined promise", async () => {
    const result = await waitUntil(undefined)
    expect(result).toBeUndefined()
  })

  test("handles null promise", async () => {
    const result = await waitUntil(null)
    expect(result).toBeNull()
  })
})

describe("Resource Proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCloudflare.mockReturnValue(mockCloudflareClient)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Bucket resources", () => {
    test("returns bucket interface for sst.cloudflare.Bucket type", () => {
      const bucket = Resource.bucket

      expect(bucket).toBeDefined()
      expect(typeof bucket.put).toBe("function")
    })

    test("bucket.put is a no-op function", async () => {
      const bucket = Resource.bucket
      await bucket.put()

      // Should not throw and should be callable
      expect(typeof bucket.put).toBe("function")
    })

    test("bucket.put accepts any arguments", async () => {
      const bucket = Resource.bucket
      await bucket.put("key", "value", { option: "test" })

      // Should handle any arguments without error
      expect(typeof bucket.put).toBe("function")
    })
  })

  describe("KV resources", () => {
    test("creates Cloudflare client with correct configuration", () => {
      const kv = Resource.kv

      expect(mockCloudflare).toHaveBeenCalledWith({
        apiToken: "test-api-token"
      })
      expect(kv).toBeDefined()
    })

    test("returns KV interface for sst.cloudflare.Kv type", () => {
      const kv = Resource.kv

      expect(kv).toBeDefined()
      expect(typeof kv.get).toBe("function")
      expect(typeof kv.put).toBe("function")
      expect(typeof kv.delete).toBe("function")
      expect(typeof kv.list).toBe("function")
    })

    test("kv.get handles single key request", async () => {
      const mockBulkGet = {
        values: {
          "test-key": "test-value"
        }
      }
      mockCloudflareClient.kv.namespaces.bulkGet.mockResolvedValue(mockBulkGet)

      const kv = Resource.kv
      const result = await kv.get("test-key")

      expect(mockCloudflareClient.kv.namespaces.bulkGet).toHaveBeenCalledWith("test-namespace-id", {
        keys: ["test-key"],
        account_id: "test-account-id"
      })
      expect(result).toBe("test-value")
    })

    test("kv.get handles multiple key request", async () => {
      const mockBulkGet = {
        values: {
          "key1": "value1",
          "key2": "value2"
        }
      }
      mockCloudflareClient.kv.namespaces.bulkGet.mockResolvedValue(mockBulkGet)

      const kv = Resource.kv
      const result = await kv.get(["key1", "key2"])

      expect(mockCloudflareClient.kv.namespaces.bulkGet).toHaveBeenCalledWith("test-namespace-id", {
        keys: ["key1", "key2"],
        account_id: "test-account-id"
      })
      expect(result).toBeInstanceOf(Map)
      expect(result.get("key1")).toBe("value1")
      expect(result.get("key2")).toBe("value2")
    })

    test("kv.get handles empty result", async () => {
      const mockBulkGet = { values: {} }
      mockCloudflareClient.kv.namespaces.bulkGet.mockResolvedValue(mockBulkGet)

      const kv = Resource.kv
      const result = await kv.get("non-existent-key")

      expect(result).toBeUndefined()
    })

    test("kv.get handles null result", async () => {
      const mockBulkGet = null
      mockCloudflareClient.kv.namespaces.bulkGet.mockResolvedValue(mockBulkGet)

      const kv = Resource.kv
      const result = await kv.get("test-key")

      expect(result).toBeUndefined()
    })

    test("kv.put calls values.update with correct parameters", async () => {
      mockCloudflareClient.kv.namespaces.values.update.mockResolvedValue({})

      const kv = Resource.kv
      await kv.put("test-key", "test-value", {
        expiration: 123,
        expirationTtl: 456,
        metadata: { custom: "data" }
      })

      expect(mockCloudflareClient.kv.namespaces.values.update).toHaveBeenCalledWith(
        "test-namespace-id",
        "test-key",
        {
          account_id: "test-account-id",
          value: "test-value",
          expiration: 123,
          expiration_ttl: 456, // Fix: use snake_case as expected by Cloudflare API
          metadata: { custom: "data" }
        }
      )
    })

    test("kv.put works without options", async () => {
      mockCloudflareClient.kv.namespaces.values.update.mockResolvedValue({})

      const kv = Resource.kv
      await kv.put("test-key", "test-value")

      expect(mockCloudflareClient.kv.namespaces.values.update).toHaveBeenCalledWith(
        "test-namespace-id",
        "test-key",
        {
          account_id: "test-account-id",
          value: "test-value",
          expiration: undefined,
          expirationTtl: undefined,
          metadata: undefined
        }
      )
    })

    test("kv.delete calls values.delete with correct parameters", async () => {
      mockCloudflareClient.kv.namespaces.values.delete.mockResolvedValue({})

      const kv = Resource.kv
      await kv.delete("test-key")

      expect(mockCloudflareClient.kv.namespaces.values.delete).toHaveBeenCalledWith(
        "test-namespace-id",
        "test-key",
        {
          account_id: "test-account-id"
        }
      )
    })

    test("kv.list calls keys.list with correct parameters", async () => {
      const mockListResult = {
        result: [
          { name: "key1" },
          { name: "key2" },
          { name: "key3" }
        ]
      }
      mockCloudflareClient.kv.namespaces.keys.list.mockResolvedValue(mockListResult)

      const kv = Resource.kv
      const result = await kv.list({
        prefix: "test-prefix",
        limit: 100
      })

      expect(mockCloudflareClient.kv.namespaces.keys.list).toHaveBeenCalledWith(
        "test-namespace-id",
        {
          account_id: "test-account-id",
          prefix: "test-prefix"
        }
      )
      expect(result).toEqual({
        keys: mockListResult.result,
        list_complete: true,
        cacheStatus: null
      })
    })

    test("kv.list works without options", async () => {
      const mockListResult = { result: [] }
      mockCloudflareClient.kv.namespaces.keys.list.mockResolvedValue(mockListResult)

      const kv = Resource.kv
      const result = await kv.list()

      expect(mockCloudflareClient.kv.namespaces.keys.list).toHaveBeenCalledWith(
        "test-namespace-id",
        {
          account_id: "test-account-id",
          prefix: undefined
        }
      )
      expect(result).toEqual({
        keys: [],
        list_complete: true,
        cacheStatus: null
      })
    })
  })

  describe("Other resource types", () => {
    test("returns original value for non-sst types", () => {
      const other = Resource.other

      expect(other).toBe(mockResourceBase.other)
      expect(other.type).toBe("other.type")
    })

    test("handles undefined resource properties", () => {
      const undefinedResource = Resource.undefined

      expect(undefinedResource).toBeUndefined()
    })

    test("handles null resource properties", () => {
      // Add a null property to the mock
      mockResourceBase.nullResource = null
      const nullResource = Resource.nullResource

      expect(nullResource).toBeNull()
    })
  })

  describe("Proxy behavior", () => {
    test("proxy handles all property access", () => {
      const bucket = Resource.bucket
      const kv = Resource.kv
      const other = Resource.other

      expect(bucket).toBeDefined()
      expect(kv).toBeDefined()
      expect(other).toBeDefined()
    })

    test("proxy handles non-existent properties", () => {
      const nonExistent = Resource.nonExistent

      expect(nonExistent).toBeUndefined()
    })

    test("proxy handles symbol properties", () => {
      const symbolProp = Resource[Symbol.iterator]

      expect(symbolProp).toBeUndefined()
    })

    test("proxy handles function calls on resources", () => {
      const bucket = Resource.bucket

      expect(typeof bucket.put).toBe("function")
      expect(() => bucket.put()).not.toThrow()
    })

    test("proxy maintains resource identity", () => {
      const bucket1 = Resource.bucket
      const bucket2 = Resource.bucket

      // Should be functionally equivalent (same structure)
      expect(typeof bucket1).toBe(typeof bucket2)
      expect(typeof bucket1.put).toBe(typeof bucket2.put)
    })
  })

  describe("error handling", () => {
    test("handles Cloudflare client creation errors", () => {
      mockCloudflare.mockImplementation(() => {
        throw new Error("Failed to create client")
      })

      expect(() => Resource.kv).toThrow("Failed to create client")
    })

    test("handles KV operation errors", async () => {
      mockCloudflareClient.kv.namespaces.bulkGet.mockRejectedValue(new Error("KV operation failed"))

      const kv = Resource.kv

      await expect(kv.get("test-key")).rejects.toThrow("KV operation failed")
    })

    test("handles list operation errors", async () => {
      mockCloudflareClient.kv.namespaces.keys.list.mockRejectedValue(new Error("List operation failed"))

      const kv = Resource.kv

      await expect(kv.list()).rejects.toThrow("List operation failed")
    })

    test("handles put operation errors", async () => {
      mockCloudflareClient.kv.namespaces.values.update.mockRejectedValue(new Error("Put operation failed"))

      const kv = Resource.kv

      await expect(kv.put("key", "value")).rejects.toThrow("Put operation failed")
    })

    test("handles delete operation errors", async () => {
      mockCloudflareClient.kv.namespaces.values.delete.mockRejectedValue(new Error("Delete operation failed"))

      const kv = Resource.kv

      await expect(kv.delete("key")).rejects.toThrow("Delete operation failed")
    })
  })

  describe("type checking", () => {
    test("checks type property existence", () => {
      // Should not throw when accessing resources with type property
      expect(() => {
        const bucket = Resource.bucket
        const kv = Resource.kv
        const other = Resource.other
      }).not.toThrow()
    })

    test("handles resources without type property", () => {
      // Add a resource without type property
      mockResourceBase.noType = { value: "test" }

      const noType = Resource.noType
      expect(noType).toBe(mockResourceBase.noType)
    })
  })

  describe("configuration validation", () => {
    test("uses correct API token from Resource", () => {
      Resource.kv

      expect(mockCloudflare).toHaveBeenCalledWith({
        apiToken: "test-api-token"
      })
    })

    test("uses correct account ID from Resource", async () => {
      mockCloudflareClient.kv.namespaces.bulkGet.mockResolvedValue({ values: {} })

      const kv = Resource.kv
      await kv.get("test-key")

      expect(mockCloudflareClient.kv.namespaces.bulkGet).toHaveBeenCalledWith(
        "test-namespace-id",
        expect.objectContaining({
          account_id: "test-account-id"
        })
      )
    })

    test("uses correct namespace ID from Resource", async () => {
      mockCloudflareClient.kv.namespaces.bulkGet.mockResolvedValue({ values: {} })

      const kv = Resource.kv
      await kv.get("test-key")

      expect(mockCloudflareClient.kv.namespaces.bulkGet).toHaveBeenCalledWith(
        "test-namespace-id",
        expect.any(Object)
      )
    })
  })
})
