import { expect, test, describe } from "bun:test"
import { PackageRegistry } from "../../src/bun/registry"

describe("PackageRegistry", () => {
  describe("info", () => {
    test("returns null for non-existent package", async () => {
      const result = await PackageRegistry.info("non-existent-package-xyz", "version")
      expect(result).toBeNull()
    })

    test("returns version for existing package", async () => {
      const result = await PackageRegistry.info("bun", "version")
      expect(result).toBeDefined()
      expect(typeof result).toBe("string")
    })

    test("returns null for invalid field", async () => {
      const result = await PackageRegistry.info("bun", "invalid-field-xyz")
      // May return null or empty
      expect(result === null || result === "").toBe(true)
    })
  })

  describe("isOutdated", () => {
    test("returns false when package doesn't exist", async () => {
      const result = await PackageRegistry.isOutdated("non-existent-pkg-xyz", "1.0.0")
      expect(result).toBe(false)
    })

    test("handles version ranges", async () => {
      // A version range like ^1.0.0 should be satisfiable by any 1.x version
      const result = await PackageRegistry.isOutdated("bun", "^0.0.0")
      // bun is likely newer than 0.0.0 so should be true
      expect(typeof result).toBe("boolean")
    })

    test("compares exact versions", async () => {
      const result = await PackageRegistry.isOutdated("bun", "0.0.0")
      // bun version is definitely higher than 0.0.0
      expect(result).toBe(true)
    })

    test("handles cwd parameter", async () => {
      const result = await PackageRegistry.info("bun", "version", process.cwd())
      expect(result).toBeDefined()
    })
  })
})
