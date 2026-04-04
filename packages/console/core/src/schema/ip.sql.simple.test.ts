import { describe, expect, test } from "bun:test"
import { IpTable, IpRateLimitTable } from "./ip.sql"

describe("ip.sql", () => {
  describe("IpTable", () => {
    test("creates ip table with correct structure", () => {
      expect(IpTable).toBeDefined()
      expect(typeof IpTable).toBe("object")
      expect(IpTable.name).toBe("ip")
    })

    test("has expected columns", () => {
      expect(IpTable.columns.ip).toBeDefined()
      expect(IpTable.columns.usage).toBeDefined()
      expect(IpTable.columns.timeCreated).toBeDefined()
      expect(IpTable.columns.timeUpdated).toBeDefined()
      expect(IpTable.columns.timeDeleted).toBeDefined()
    })

    test("has primary key constraint", () => {
      expect(IpTable.constraints).toBeDefined()
      expect(Array.isArray(IpTable.constraints)).toBe(true)
      expect(IpTable.constraints.length).toBeGreaterThan(0)
    })
  })

  describe("IpRateLimitTable", () => {
    test("creates ip_rate_limit table with correct structure", () => {
      expect(IpRateLimitTable).toBeDefined()
      expect(typeof IpRateLimitTable).toBe("object")
      expect(IpRateLimitTable.name).toBe("ip_rate_limit")
    })

    test("has expected columns", () => {
      expect(IpRateLimitTable.columns.ip).toBeDefined()
      expect(IpRateLimitTable.columns.interval).toBeDefined()
      expect(IpRateLimitTable.columns.count).toBeDefined()
    })

    test("has composite primary key constraint", () => {
      expect(IpRateLimitTable.constraints).toBeDefined()
      expect(Array.isArray(IpRateLimitTable.constraints)).toBe(true)
      expect(IpRateLimitTable.constraints.length).toBeGreaterThan(0)
    })
  })

  describe("table differences", () => {
    test("IpTable and IpRateLimitTable are different", () => {
      expect(IpTable).not.toBe(IpRateLimitTable)
      expect(IpTable.name).not.toBe(IpRateLimitTable.name)
    })

    test("IpTable has usage column, IpRateLimitTable does not", () => {
      expect(IpTable.columns.usage).toBeDefined()
      expect(IpRateLimitTable.columns.usage).toBeUndefined()
    })

    test("IpRateLimitTable has interval and count columns, IpTable does not", () => {
      expect(IpRateLimitTable.columns.interval).toBeDefined()
      expect(IpRateLimitTable.columns.count).toBeDefined()
      expect(IpTable.columns.interval).toBeUndefined()
      expect(IpTable.columns.count).toBeUndefined()
    })

    test("both tables have ip column", () => {
      expect(IpTable.columns.ip).toBeDefined()
      expect(IpRateLimitTable.columns.ip).toBeDefined()
    })

    test("IpTable has timestamps, IpRateLimitTable does not", () => {
      expect(IpTable.columns.timeCreated).toBeDefined()
      expect(IpTable.columns.timeUpdated).toBeDefined()
      expect(IpTable.columns.timeDeleted).toBeDefined()
      
      expect(IpRateLimitTable.columns.timeCreated).toBeUndefined()
      expect(IpRateLimitTable.columns.timeUpdated).toBeUndefined()
      expect(IpRateLimitTable.columns.timeDeleted).toBeUndefined()
    })
  })

  describe("column properties", () => {
    test("ip columns have correct properties", () => {
      const ipColumn1 = IpTable.columns.ip
      const ipColumn2 = IpRateLimitTable.columns.ip
      
      expect(ipColumn1.name).toBe("ip")
      expect(ipColumn2.name).toBe("ip")
      expect(typeof ipColumn1.notNull).toBe("function")
      expect(typeof ipColumn2.notNull).toBe("function")
    })

    test("interval column has correct properties", () => {
      const intervalColumn = IpRateLimitTable.columns.interval
      expect(intervalColumn.name).toBe("interval")
      expect(typeof intervalColumn.notNull).toBe("function")
    })

    test("count column has correct properties", () => {
      const countColumn = IpRateLimitTable.columns.count
      expect(countColumn.name).toBe("count")
      expect(typeof countColumn.notNull).toBe("function")
    })

    test("usage column has correct properties", () => {
      const usageColumn = IpTable.columns.usage
      expect(usageColumn.name).toBe("usage")
      expect(typeof usageColumn.notNull).toBe("function")
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
      expect(IpTable).toHaveProperty("columns")
      expect(IpRateLimitTable).toHaveProperty("columns")
      expect(IpTable).toHaveProperty("constraints")
      expect(IpRateLimitTable).toHaveProperty("constraints")
    })
  })
})
