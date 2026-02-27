import { describe, expect, test } from "bun:test"
import { ulid, workspaceColumns, id, utc, currency, timestamps } from "./types"

// Mock drizzle-orm
const mockVarchar = vi.fn((name, options) => ({
  name,
  options,
  notNull: vi.fn(() => ({ notNull: true })),
  default: vi.fn((value) => ({ default: value }))
}))

const mockBigint = vi.fn((name, options) => ({
  name,
  options,
  notNull: vi.fn(() => ({ notNull: true }))
}))

const mockTimestamp = vi.fn((name, options) => ({
  name,
  options,
  notNull: vi.fn(() => ({ notNull: true })),
  defaultNow: vi.fn(() => ({ defaultNow: true }))
}))

const mockSql = vi.fn((value) => ({ sql: value }))

vi.mock("drizzle-orm", () => ({
  sql: mockSql
}))

vi.mock("drizzle-orm/mysql-core", () => ({
  bigint: mockBigint,
  timestamp: mockTimestamp,
  varchar: mockVarchar
}))

describe("types", () => {
  describe("ulid", () => {
    test("creates varchar column with correct length", () => {
      const result = ulid("test_column")
      
      expect(mockVarchar).toHaveBeenCalledWith("test_column", { length: 30 })
      expect(result).toBeDefined()
    })

    test("creates varchar column with different names", () => {
      const names = ["id", "user_id", "workspace_id", "session_id"]
      
      names.forEach(name => {
        const result = ulid(name)
        expect(mockVarchar).toHaveBeenCalledWith(name, { length: 30 })
        expect(result).toBeDefined()
      })
    })

    test("returns consistent column definition", () => {
      const result1 = ulid("column1")
      const result2 = ulid("column2")
      
      expect(typeof result1).toBe("object")
      expect(typeof result2).toBe("object")
      expect(result1).not.toBe(result2) // Different instances
    })
  })

  describe("workspaceColumns", () => {
    test("creates id column with ulid", () => {
      const idColumn = workspaceColumns.id
      
      expect(mockVarchar).toHaveBeenCalledWith("id", { length: 30 })
      expect(idColumn).toBeDefined()
      expect(idColumn.notNull).toBeDefined()
    })

    test("creates workspaceID column with ulid", () => {
      const workspaceIdColumn = workspaceColumns.workspaceID
      
      expect(mockVarchar).toHaveBeenCalledWith("workspace_id", { length: 30 })
      expect(workspaceIdColumn).toBeDefined()
      expect(workspaceIdColumn.notNull).toBeDefined()
    })

    test("id and workspaceID are different column instances", () => {
      const idColumn = workspaceColumns.id
      const workspaceIdColumn = workspaceColumns.workspaceID
      
      expect(idColumn).not.toBe(workspaceIdColumn)
    })

    test("workspaceColumns has expected properties", () => {
      expect(Object.keys(workspaceColumns)).toEqual(["id", "workspaceID"])
      expect(typeof workspaceColumns.id).toBe("object")
      expect(typeof workspaceColumns.workspaceID).toBe("object")
    })

    test("id column has correct structure", () => {
      const idColumn = workspaceColumns.id
      
      // The column should have notNull method
      expect(typeof idColumn.notNull).toBe("function")
      
      // Call notNull to get the column definition
      const notNullColumn = idColumn.notNull()
      expect(notNullColumn.notNull).toBe(true)
    })

    test("workspaceID column has correct structure", () => {
      const workspaceIdColumn = workspaceColumns.workspaceID
      
      // The column should have notNull method
      expect(typeof workspaceIdColumn.notNull).toBe("function")
      
      // Call notNull to get the column definition
      const notNullColumn = workspaceIdColumn.notNull()
      expect(notNullColumn.notNull).toBe(true)
    })
  })

  describe("id", () => {
    test("creates id column with ulid", () => {
      const result = id()
      
      expect(mockVarchar).toHaveBeenCalledWith("id", { length: 30 })
      expect(result).toBeDefined()
      expect(result.notNull).toBeDefined()
    })

    test("id column is not nullable", () => {
      const result = id()
      const notNullColumn = result.notNull()
      
      expect(notNullColumn.notNull).toBe(true)
    })

    test("id function returns new instance each call", () => {
      const result1 = id()
      const result2 = id()
      
      expect(result1).not.toBe(result2)
    })

    test("id uses fixed column name", () => {
      id()
      expect(mockVarchar).toHaveBeenCalledWith("id", { length: 30 })
    })
  })

  describe("utc", () => {
    test("creates timestamp column with correct options", () => {
      const result = utc("created_at")
      
      expect(mockTimestamp).toHaveBeenCalledWith("created_at", {
        fsp: 3
      })
      expect(result).toBeDefined()
    })

    test("creates timestamp columns with different names", () => {
      const names = ["created_at", "updated_at", "deleted_at", "published_at"]
      
      names.forEach(name => {
        const result = utc(name)
        expect(mockTimestamp).toHaveBeenCalledWith(name, { fsp: 3 })
        expect(result).toBeDefined()
      })
    })

    test("timestamp column has correct fractional seconds precision", () => {
      utc("test_column")
      
      expect(mockTimestamp).toHaveBeenCalledWith("test_column", {
        fsp: 3
      })
    })

    test("returns consistent timestamp definition", () => {
      const result1 = utc("column1")
      const result2 = utc("column2")
      
      expect(typeof result1).toBe("object")
      expect(typeof result2).toBe("object")
      expect(result1).not.toBe(result2)
    })
  })

  describe("currency", () => {
    test("creates bigint column with correct options", () => {
      const result = currency("price")
      
      expect(mockBigint).toHaveBeenCalledWith("price", {
        mode: "number"
      })
      expect(result).toBeDefined()
    })

    test("creates bigint columns with different names", () => {
      const names = ["price", "amount", "cost", "total", "balance"]
      
      names.forEach(name => {
        const result = currency(name)
        expect(mockBigint).toHaveBeenCalledWith(name, { mode: "number" })
        expect(result).toBeDefined()
      })
    })

    test("currency column has correct number mode", () => {
      currency("test_column")
      
      expect(mockBigint).toHaveBeenCalledWith("test_column", {
        mode: "number"
      })
    })

    test("returns consistent currency definition", () => {
      const result1 = currency("amount1")
      const result2 = currency("amount2")
      
      expect(typeof result1).toBe("object")
      expect(typeof result2).toBe("object")
      expect(result1).not.toBe(result2)
    })
  })

  describe("timestamps", () => {
    test("creates timeCreated column with default now", () => {
      const timeCreated = timestamps.timeCreated
      
      expect(mockTimestamp).toHaveBeenCalledWith("time_created", {
        fsp: 3
      })
      expect(timeCreated).toBeDefined()
      
      const notNullColumn = timeCreated.notNull()
      expect(notNullColumn.notNull).toBe(true)
      
      const defaultColumn = notNullColumn.defaultNow()
      expect(defaultColumn.defaultNow).toBe(true)
    })

    test("creates timeUpdated column with current timestamp default", () => {
      const timeUpdated = timestamps.timeUpdated
      
      expect(mockTimestamp).toHaveBeenCalledWith("time_updated", {
        fsp: 3
      })
      expect(timeUpdated).toBeDefined()
      
      const notNullColumn = timeUpdated.notNull()
      expect(notNullColumn.notNull).toBe(true)
      
      const defaultColumn = notNullColumn.default(mockSql`CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`)
      expect(defaultColumn.default).toEqual({ sql: "CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)" })
    })

    test("creates timeDeleted column without constraints", () => {
      const timeDeleted = timestamps.timeDeleted
      
      expect(mockTimestamp).toHaveBeenCalledWith("time_deleted", {
        fsp: 3
      })
      expect(timeDeleted).toBeDefined()
      expect(typeof timeDeleted.notNull).toBe("function")
    })

    test("timestamps has expected properties", () => {
      expect(Object.keys(timestamps)).toEqual(["timeCreated", "timeUpdated", "timeDeleted"])
      expect(typeof timestamps.timeCreated).toBe("object")
      expect(typeof timestamps.timeUpdated).toBe("object")
      expect(typeof timestamps.timeDeleted).toBe("object")
    })

    test("timeCreated column structure", () => {
      const timeCreated = timestamps.timeCreated
      
      expect(typeof timeCreated.notNull).toBe("function")
      
      const notNullColumn = timeCreated.notNull()
      expect(notNullColumn.notNull).toBe(true)
      
      const defaultColumn = notNullColumn.defaultNow()
      expect(defaultColumn.defaultNow).toBe(true)
    })

    test("timeUpdated column structure", () => {
      const timeUpdated = timestamps.timeUpdated
      
      expect(typeof timeUpdated.notNull).toBe("function")
      
      const notNullColumn = timeUpdated.notNull()
      expect(notNullColumn.notNull).toBe(true)
      
      const defaultColumn = notNullColumn.default(mockSql`CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`)
      expect(defaultColumn.default.sql).toBe("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)")
    })

    test("timeDeleted column structure", () => {
      const timeDeleted = timestamps.timeDeleted
      
      expect(typeof timeDeleted.notNull).toBe("function")
      // timeDeleted doesn't have default constraints
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

    test("timestamps objects are consistent", () => {
      const timestamps1 = timestamps
      const timestamps2 = timestamps
      
      expect(timestamps1).toBe(timestamps2)
      expect(timestamps1.timeCreated).toBe(timestamps2.timeCreated)
      expect(timestamps1.timeUpdated).toBe(timestamps2.timeUpdated)
      expect(timestamps1.timeDeleted).toBe(timestamps2.timeDeleted)
    })
  })
})
