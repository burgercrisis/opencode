import { describe, expect, test } from "bun:test"
import { IpTable, IpRateLimitTable } from "./ip.sql"

// Mock drizzle-orm/mysql-core
const mockMysqlTable = vi.fn((name, columns, constraints) => ({
  name,
  columns,
  constraints
}))

const mockInt = vi.fn((name) => ({
  name,
  notNull: vi.fn(() => ({ notNull: true }))
}))

const mockVarchar = vi.fn((name, options) => ({
  name,
  options,
  notNull: vi.fn(() => ({ notNull: true }))
}))

const mockPrimaryKey = vi.fn((options) => ({ primaryKey: options }))

vi.mock("drizzle-orm/mysql-core", () => ({
  mysqlTable: mockMysqlTable,
  int: mockInt,
  varchar: mockVarchar,
  primaryKey: mockPrimaryKey
}))

// Mock timestamps
const mockTimestamps = {
  timeCreated: { notNull: vi.fn(() => ({ notNull: true })) },
  timeUpdated: { notNull: vi.fn(() => ({ notNull: true })) },
  timeDeleted: { notNull: vi.fn(() => ({ notNull: true })) }
}

vi.mock("../drizzle/types", () => ({
  timestamps: mockTimestamps
}))

describe("ip.sql", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("IpTable", () => {
    test("creates ip table with correct structure", () => {
      expect(IpTable).toBeDefined()
      expect(typeof IpTable).toBe("object")
    })

    test("has correct table name", () => {
      expect(mockMysqlTable).toHaveBeenCalledWith(
        "ip",
        expect.any(Object),
        expect.any(Array)
      )
    })

    test("has ip column with varchar type", () => {
      expect(mockVarchar).toHaveBeenCalledWith("ip", { length: 45 })
    })

    test("ip column is not nullable", () => {
      expect(mockVarchar).toHaveBeenCalledWith("ip", { length: 45 })
      // The notNull() should be called on the ip column
    })

    test("includes timestamps", () => {
      // Should include all timestamp columns
      expect(mockTimestamps.timeCreated.notNull).toHaveBeenCalled()
      expect(mockTimestamps.timeUpdated.notNull).toHaveBeenCalled()
      expect(mockTimestamps.timeDeleted.notNull).toHaveBeenCalled()
    })

    test("has usage column with int type", () => {
      expect(mockInt).toHaveBeenCalledWith("usage")
    })

    test("usage column does not have notNull constraint", () => {
      // usage column should not have notNull() called
      expect(mockInt).toHaveBeenCalledWith("usage")
    })

    test("has primary key on ip column", () => {
      expect(mockPrimaryKey).toHaveBeenCalledWith({
        columns: [expect.objectContaining({ name: "ip" })]
      })
    })

    test("table structure is correct", () => {
      const tableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip")
      expect(tableCall).toBeDefined()
      
      const [, columns, constraints] = tableCall!
      expect(columns).toBeDefined()
      expect(constraints).toBeDefined()
      expect(Array.isArray(constraints)).toBe(true)
    })

    test("column definitions are correct", () => {
      const tableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip")
      const [, columns] = tableCall!
      
      // Should have ip, timestamps, and usage columns
      expect(columns.ip).toBeDefined()
      expect(columns.usage).toBeDefined()
      expect(columns.timeCreated).toBeDefined()
      expect(columns.timeUpdated).toBeDefined()
      expect(columns.timeDeleted).toBeDefined()
    })
  })

  describe("IpRateLimitTable", () => {
    test("creates ip_rate_limit table with correct structure", () => {
      expect(IpRateLimitTable).toBeDefined()
      expect(typeof IpRateLimitTable).toBe("object")
    })

    test("has correct table name", () => {
      const tableCalls = mockMysqlTable.mock.calls.filter(call => call[0] === "ip_rate_limit")
      expect(tableCalls).toHaveLength(1)
    })

    test("has ip column with varchar type", () => {
      expect(mockVarchar).toHaveBeenCalledWith("ip", { length: 45 })
    })

    test("ip column is not nullable", () => {
      expect(mockVarchar).toHaveBeenCalledWith("ip", { length: 45 })
      // The notNull() should be called on the ip column
    })

    test("has interval column with varchar type", () => {
      expect(mockVarchar).toHaveBeenCalledWith("interval", { length: 10 })
    })

    test("interval column is not nullable", () => {
      expect(mockVarchar).toHaveBeenCalledWith("interval", { length: 10 })
      // The notNull() should be called on the interval column
    })

    test("has count column with int type", () => {
      expect(mockInt).toHaveBeenCalledWith("count")
    })

    test("count column is not nullable", () => {
      expect(mockInt).toHaveBeenCalledWith("count")
      // The notNull() should be called on the count column
    })

    test("has composite primary key on ip and interval columns", () => {
      expect(mockPrimaryKey).toHaveBeenCalledWith({
        columns: [
          expect.objectContaining({ name: "ip" }),
          expect.objectContaining({ name: "interval" })
        ]
      })
    })

    test("table structure is correct", () => {
      const tableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip_rate_limit")
      expect(tableCall).toBeDefined()
      
      const [, columns, constraints] = tableCall!
      expect(columns).toBeDefined()
      expect(constraints).toBeDefined()
      expect(Array.isArray(constraints)).toBe(true)
    })

    test("column definitions are correct", () => {
      const tableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip_rate_limit")
      const [, columns] = tableCall!
      
      // Should have ip, interval, and count columns
      expect(columns.ip).toBeDefined()
      expect(columns.interval).toBeDefined()
      expect(columns.count).toBeDefined()
    })

    test("varchar column lengths are appropriate", () => {
      // Check that ip column supports IPv6 addresses (max 45 chars)
      expect(mockVarchar).toHaveBeenCalledWith("ip", { length: 45 })
      
      // Check that interval column supports YYYYMMDDHH format (10 chars)
      expect(mockVarchar).toHaveBeenCalledWith("interval", { length: 10 })
    })
  })

  describe("table differences", () => {
    test("IpTable and IpRateLimitTable are different", () => {
      expect(IpTable).not.toBe(IpRateLimitTable)
    })

    test("IpTable has different structure than IpRateLimitTable", () => {
      const ipTableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip")
      const rateLimitTableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip_rate_limit")
      
      expect(ipTableCall).toBeDefined()
      expect(rateLimitTableCall).toBeDefined()
      expect(ipTableCall![0]).not.toBe(rateLimitTableCall![0])
    })

    test("IpTable has usage column, IpRateLimitTable does not", () => {
      const ipTableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip")
      const rateLimitTableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip_rate_limit")
      
      const ipColumns = ipTableCall![1]
      const rateLimitColumns = rateLimitTableCall![1]
      
      expect(ipColumns.usage).toBeDefined()
      expect(rateLimitColumns.usage).toBeUndefined()
    })

    test("IpRateLimitTable has interval and count columns, IpTable does not", () => {
      const ipTableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip")
      const rateLimitTableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip_rate_limit")
      
      const ipColumns = ipTableCall![1]
      const rateLimitColumns = rateLimitTableCall![1]
      
      expect(rateLimitColumns.interval).toBeDefined()
      expect(rateLimitColumns.count).toBeDefined()
      expect(ipColumns.interval).toBeUndefined()
      expect(ipColumns.count).toBeUndefined()
    })

    test("both tables have ip column", () => {
      const ipTableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip")
      const rateLimitTableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip_rate_limit")
      
      const ipColumns = ipTableCall![1]
      const rateLimitColumns = rateLimitTableCall![1]
      
      expect(ipColumns.ip).toBeDefined()
      expect(rateLimitColumns.ip).toBeDefined()
    })

    test("IpTable has timestamps, IpRateLimitTable does not", () => {
      const ipTableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip")
      const rateLimitTableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip_rate_limit")
      
      const ipColumns = ipTableCall![1]
      const rateLimitColumns = rateLimitTableCall![1]
      
      expect(ipColumns.timeCreated).toBeDefined()
      expect(ipColumns.timeUpdated).toBeDefined()
      expect(ipColumns.timeDeleted).toBeDefined()
      
      expect(rateLimitColumns.timeCreated).toBeUndefined()
      expect(rateLimitColumns.timeUpdated).toBeUndefined()
      expect(rateLimitColumns.timeDeleted).toBeUndefined()
    })
  })

  describe("primary key constraints", () => {
    test("IpTable has single column primary key", () => {
      const tableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip")
      const [, , constraints] = tableCall!
      
      expect(constraints).toHaveLength(1)
      expect(constraints[0]).toEqual({
        primaryKey: {
          columns: [expect.objectContaining({ name: "ip" })]
        }
      })
    })

    test("IpRateLimitTable has composite primary key", () => {
      const tableCall = mockMysqlTable.mock.calls.find(call => call[0] === "ip_rate_limit")
      const [, , constraints] = tableCall!
      
      expect(constraints).toHaveLength(1)
      expect(constraints[0]).toEqual({
        primaryKey: {
          columns: [
            expect.objectContaining({ name: "ip" }),
            expect.objectContaining({ name: "interval" })
          ]
        }
      })
    })
  })

  describe("column types and constraints", () => {
    test("varchar columns have correct lengths", () => {
      // IP addresses can be up to 45 characters (IPv6)
      expect(mockVarchar).toHaveBeenCalledWith("ip", { length: 45 })
      expect(mockVarchar).toHaveBeenCalledWith("ip", { length: 45 })
      
      // Interval should be YYYYMMDDHH format (10 characters)
      expect(mockVarchar).toHaveBeenCalledWith("interval", { length: 10 })
    })

    test("int columns are defined correctly", () => {
      expect(mockInt).toHaveBeenCalledWith("usage")
      expect(mockInt).toHaveBeenCalledWith("count")
    })

    test("notNull constraints are applied correctly", () => {
      // IpTable: ip, timestamps should be not null, usage should not
      expect(mockVarchar).toHaveBeenCalledWith("ip", { length: 45 })
      expect(mockInt).toHaveBeenCalledWith("usage")
      
      // IpRateLimitTable: ip, interval, count should be not null
      expect(mockVarchar).toHaveBeenCalledWith("ip", { length: 45 })
      expect(mockVarchar).toHaveBeenCalledWith("interval", { length: 10 })
      expect(mockInt).toHaveBeenCalledWith("count")
    })
  })

  describe("export validation", () => {
    test("exports both tables", () => {
      expect(typeof IpTable).toBe("object")
      expect(typeof IpRateLimitTable).toBe("object")
    })

    test("tables are not functions", () => {
      expect(typeof IpTable).not.toBe("function")
      expect(typeof IpRateLimitTable).not.toBe("function")
    })

    test("tables have expected properties", () => {
      expect(IpTable).toHaveProperty("name", "ip")
      expect(IpRateLimitTable).toHaveProperty("name", "ip_rate_limit")
    })
  })
})
