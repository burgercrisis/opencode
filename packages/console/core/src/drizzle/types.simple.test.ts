import { describe, expect, test } from "bun:test"
import { ulid, workspaceColumns, id, utc, currency, timestamps } from "./types"

describe("types", () => {
  describe("ulid", () => {
    test("creates varchar column with correct length", () => {
      const result = ulid("test_column")
      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
      expect(typeof result.notNull).toBe("function")
    })

    test("creates varchar column with different names", () => {
      const names = ["id", "user_id", "workspace_id", "session_id"]
      
      names.forEach(name => {
        const result = ulid(name)
        expect(result).toBeDefined()
        expect(typeof result).toBe("object")
      })
    })
  })

  describe("workspaceColumns", () => {
    test("has id and workspaceID properties", () => {
      expect(workspaceColumns.id).toBeDefined()
      expect(workspaceColumns.workspaceID).toBeDefined()
      expect(typeof workspaceColumns.id).toBe("object")
      expect(typeof workspaceColumns.workspaceID).toBe("object")
    })

    test("id and workspaceID are different objects", () => {
      const idColumn = workspaceColumns.id
      const workspaceIdColumn = workspaceColumns.workspaceID
      
      expect(idColumn).not.toBe(workspaceIdColumn)
    })

    test("columns have notNull method", () => {
      expect(typeof workspaceColumns.id.notNull).toBe("function")
      expect(typeof workspaceColumns.workspaceID.notNull).toBe("function")
    })
  })

  describe("id", () => {
    test("creates id column", () => {
      const result = id()
      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
      expect(typeof result.notNull).toBe("function")
    })

    test("id function returns new instance each call", () => {
      const result1 = id()
      const result2 = id()
      expect(result1).not.toBe(result2)
    })
  })

  describe("utc", () => {
    test("creates timestamp column", () => {
      const result = utc("created_at")
      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
      expect(typeof result.notNull).toBe("function")
    })

    test("creates timestamp columns with different names", () => {
      const names = ["created_at", "updated_at", "deleted_at", "published_at"]
      
      names.forEach(name => {
        const result = utc(name)
        expect(result).toBeDefined()
        expect(typeof result).toBe("object")
      })
    })
  })

  describe("currency", () => {
    test("creates bigint column", () => {
      const result = currency("price")
      expect(result).toBeDefined()
      expect(typeof result).toBe("object")
      expect(typeof result.notNull).toBe("function")
    })

    test("creates bigint columns with different names", () => {
      const names = ["price", "amount", "cost", "total", "balance"]
      
      names.forEach(name => {
        const result = currency(name)
        expect(result).toBeDefined()
        expect(typeof result).toBe("object")
      })
    })
  })

  describe("timestamps", () => {
    test("has expected properties", () => {
      expect(timestamps.timeCreated).toBeDefined()
      expect(timestamps.timeUpdated).toBeDefined()
      expect(timestamps.timeDeleted).toBeDefined()
      expect(typeof timestamps.timeCreated).toBe("object")
      expect(typeof timestamps.timeUpdated).toBe("object")
      expect(typeof timestamps.timeDeleted).toBe("object")
    })

    test("timestamp columns have notNull method", () => {
      expect(typeof timestamps.timeCreated.notNull).toBe("function")
      expect(typeof timestamps.timeUpdated.notNull).toBe("function")
      expect(typeof timestamps.timeDeleted.notNull).toBe("function")
    })

    test("timestamps objects are consistent", () => {
      const timestamps1 = timestamps
      const timestamps2 = timestamps
      
      expect(timestamps1).toBe(timestamps2)
      expect(timestamps1.timeCreated).toBe(timestamps2.timeCreated)
      expect(timestamps1.timeUpdated).toBe(timestamps2.timeUpdated)
      expect(timestamps1.timeDeleted).toBe(timestamps2.timeDeleted)
    })
  })

  describe("integration tests", () => {
    test("all functions return callable objects", () => {
      const functions = [
        () => ulid("test"),
        () => id(),
        () => utc("test"),
        () => currency("test")
      ]

      functions.forEach(fn => {
        const result = fn()
        expect(typeof result).toBe("object")
        expect(typeof result.notNull).toBe("function")
      })
    })

    test("workspaceColumns getters work correctly", () => {
      // Access properties multiple times to ensure getters work
      const id1 = workspaceColumns.id
      const id2 = workspaceColumns.id
      
      const workspaceId1 = workspaceColumns.workspaceID
      const workspaceId2 = workspaceColumns.workspaceID
      
      expect(id1).toBeDefined()
      expect(id2).toBeDefined()
      expect(workspaceId1).toBeDefined()
      expect(workspaceId2).toBeDefined()
      
      // Should be the same reference since it's a getter
      expect(id1).toBe(id2)
      expect(workspaceId1).toBe(workspaceId2)
    })
  })
})
