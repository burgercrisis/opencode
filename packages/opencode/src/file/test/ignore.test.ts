// UNIVERSAL INSTANCE PROTECTION
import { beforeEach, afterEach } from "bun:test"

// Protect Instance at test file level
let testInstance: any = null
let testFilesystem: any = null

beforeEach(() => {
  // Save working Instance before each test
  testInstance = (globalThis as any).Instance
  testFilesystem = (globalThis as any).Filesystem
  
  // Verify Instance is working
  if (!testInstance || typeof testInstance.provide !== 'function') {
    console.log("[universal-protection] Instance corrupted before test, attempting restore")
    
    // Try to get from preload
    if ((globalThis as any).protectedInstance) {
      testInstance = (globalThis as any).protectedInstance
      (globalThis as any).Instance = testInstance
      console.log("[universal-protection] Restored from preload")
    } else if ((globalThis as any).Instance?.provide) {
      // Try current Instance
      testInstance = (globalThis as any).Instance
      console.log("[universal-protection] Using current Instance")
    }
  }
})

afterEach(() => {
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Restore Instance if needed
  if (testInstance && typeof testInstance.provide === 'function') {
    (globalThis as any).Instance = testInstance
  }
})

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { FileIgnore } from "../ignore"
import os from "os"

describe("FileIgnore", () => {
  // Global test isolation pattern
  let savedInstance: any
  let savedFilesystem: any

  beforeEach(() => {
    // Save global state before each test
    savedInstance = (globalThis as any).Instance
    savedFilesystem = (globalThis as any).Filesystem
  })

  afterEach(() => {
    // Restore global state after each test
    if (savedInstance !== undefined) {
      (globalThis as any).Instance = savedInstance
    } else {
      if (savedInstance !== undefined) {
    (globalThis as any).Instance = savedInstance
  } else {
    delete (globalThis as any).Instance
  }
    }
    
    if (savedFilesystem !== undefined) {
      (globalThis as any).Filesystem = savedFilesystem
    } else {
      if (savedFilesystem !== undefined) {
    (globalThis as any).Filesystem = savedFilesystem
  } else {
    delete (globalThis as any).Filesystem
  }
    }
    
    // Clean up any mocks
    try {
      mock?.unmock?.()
    } catch (e) {
      // Ignore mock cleanup errors
    }
  })
  let tempDir: string

  beforeEach(() => {
    tempDir = os.tmpdir()
  })

  afterEach(async () => {
    // Clean up temp directory if needed
  })

  describe("PATTERNS", () => {
    it("should include all predefined patterns", () => {
      expect(FileIgnore.PATTERNS).toBeInstanceOf(Array)
      expect(FileIgnore.PATTERNS.length).toBeGreaterThan(0)
      
      // Check that key patterns are included
      expect(FileIgnore.PATTERNS).toContain("**/*.swp")
      expect(FileIgnore.PATTERNS).toContain("**/*.pyc")
      expect(FileIgnore.PATTERNS).toContain("**/.DS_Store")
      expect(FileIgnore.PATTERNS).toContain("**/Thumbs.db")
      expect(FileIgnore.PATTERNS).toContain("**/logs/**")
      expect(FileIgnore.PATTERNS).toContain("**/tmp/**")
      expect(FileIgnore.PATTERNS).toContain("**/coverage/**")
    })

    it("should include both FILES and FOLDERS", () => {
      const hasFilePatterns = FileIgnore.PATTERNS.some(pattern => pattern.includes("*"))
      const hasFolderPatterns = FileIgnore.PATTERNS.some(pattern => !pattern.includes("*"))
      
      expect(hasFilePatterns).toBe(true)
      expect(hasFolderPatterns).toBe(true)
    })
  })

  describe("match function", () => {
    describe("folder matching", () => {
      it("should match common ignore folders", () => {
        const testPaths = [
          "node_modules/package.json",
          "src/node_modules/file.js",
          "bower_components/component.js",
          "dist/bundle.js",
          "build/output.js",
          "out/index.html",
          ".git/config",
          ".vscode/settings.json",
          ".idea/modules.xml",
          ".cache/data",
          "__pycache__/module.pyc",
        ]

        testPaths.forEach(path => {
          expect(FileIgnore.match(path)).toBe(true)
        })
      })

      it("should match folders at different depths", () => {
        expect(FileIgnore.match("node_modules")).toBe(true)
        expect(FileIgnore.match("src/node_modules")).toBe(true)
        expect(FileIgnore.match("src/components/node_modules/utils")).toBe(true)
      })

      it("should handle both forward and backward slashes", () => {
        expect(FileIgnore.match("node_modules/package.json")).toBe(true)
        expect(FileIgnore.match("node_modules\\package.json")).toBe(true)
        expect(FileIgnore.match("src\\dist\\bundle.js")).toBe(true)
      })

      it("should not match non-ignored folders", () => {
        const nonIgnoredPaths = [
          "src/components/Button.tsx",
          "lib/utils.js",
          "config/app.json",
          "docs/readme.md",
        ]

        nonIgnoredPaths.forEach(path => {
          expect(FileIgnore.match(path)).toBe(false)
        })
      })
    })

    describe("file pattern matching", () => {
      it("should match swap files", () => {
        expect(FileIgnore.match("file.swp")).toBe(true)
        expect(FileIgnore.match("file.swo")).toBe(true)
        expect(FileIgnore.match(".vim.swp")).toBe(true)
      })

      it("should match Python cache files", () => {
        expect(FileIgnore.match("module.pyc")).toBe(true)
        expect(FileIgnore.match("package/__pycache__/module.pyc")).toBe(true)
      })

      it("should match OS-specific files", () => {
        expect(FileIgnore.match(".DS_Store")).toBe(true)
        expect(FileIgnore.match("Thumbs.db")).toBe(true)
        expect(FileIgnore.match("Desktop/Thumbs.db")).toBe(true)
      })

      it("should match log files", () => {
        expect(FileIgnore.match("app.log")).toBe(true)
        expect(FileIgnore.match("logs/error.log")).toBe(true)
        expect(FileIgnore.match("temp/debug.log")).toBe(true)
      })

      it("should match coverage files", () => {
        expect(FileIgnore.match("coverage/lcov.info")).toBe(true)
        expect(FileIgnore.match(".nyc_output/report.json")).toBe(true)
      })
    })

    describe("options parameter", () => {
      it("should respect extra patterns", () => {
        const result = FileIgnore.match("build/output.js", {
          extra: ["build/**"]
        })
        expect(result).toBe(true)
      })

      it("should respect multiple extra patterns", () => {
        const result = FileIgnore.match("custom/cache.tmp", {
          extra: ["*.tmp", "cache/**"]
        })
        expect(result).toBe(true)
      })

      it("should handle extra patterns with wildcards", () => {
        expect(FileIgnore.match("test.tmp", { extra: ["*.tmp"] })).toBe(true)
        expect(FileIgnore.match("dir/test.tmp", { extra: ["*.tmp"] })).toBe(true)
        expect(FileIgnore.match("test.txt", { extra: ["*.tmp"] })).toBe(false)
      })

      describe("whitelist", () => {
        it("should not match whitelisted patterns", () => {
          const result = FileIgnore.match("node_modules/package.json", {
            whitelist: ["node_modules/**"]
          })
          expect(result).toBe(false)
        })

        it("should whitelist even when folder is in default ignore list", () => {
          const result = FileIgnore.match("dist/important.js", {
            whitelist: ["dist/**"]
          })
          expect(result).toBe(false)
        })

        it("should handle multiple whitelist patterns", () => {
          const result = FileIgnore.match("build/output.js", {
            whitelist: ["build/**", "dist/**"]
          })
          expect(result).toBe(false)
        })

        it("should prioritize whitelist over folder matching", () => {
          // Even though 'node_modules' is in FOLDERS, whitelist should take precedence
          const result = FileIgnore.match("node_modules/custom/package.json", {
            whitelist: ["node_modules/custom/**"]
          })
          expect(result).toBe(false)
        })

        it("should handle whitelist with file patterns", () => {
          const result = FileIgnore.match("important.swp", {
            whitelist: ["important.swp"]
          })
          expect(result).toBe(false)
        })
      })

      it("should handle both extra and whitelist options", () => {
        const result = FileIgnore.match("build/output.js", {
          extra: ["temp/**"],
          whitelist: ["build/**"]
        })
        expect(result).toBe(false) // Whitelist should take precedence
      })

      it("should handle empty options", () => {
        expect(FileIgnore.match("node_modules/file.js", {})).toBe(true)
        expect(FileIgnore.match("src/file.js", {})).toBe(false)
      })
    })

    describe("edge cases", () => {
      it("should handle empty string", () => {
        expect(FileIgnore.match("")).toBe(false)
      })

      it("should handle root paths", () => {
        expect(FileIgnore.match("/node_modules")).toBe(true)
        expect(FileIgnore.match("\\node_modules")).toBe(true)
      })

      it("should handle paths with multiple separators", () => {
        expect(FileIgnore.match("src//node_modules//file.js")).toBe(true)
      })

      it("should handle case sensitivity appropriately", () => {
        // Should be case-sensitive for most patterns
        expect(FileIgnore.match("NODE_MODULES/file.js")).toBe(false)
        expect(FileIgnore.match("Node_Modules/file.js")).toBe(false)
      })

      it("should handle dots in paths", () => {
        expect(FileIgnore.match("./node_modules")).toBe(true)
        expect(FileIgnore.match("../node_modules")).toBe(true)
        expect(FileIgnore.match("config/.git")).toBe(true)
      })
    })
  })

  describe("integration scenarios", () => {
    it("should handle complex project structure", () => {
      const projectFiles = [
        "src/index.ts",
        "src/components/Button.tsx",
        "node_modules/react/index.js",
        "dist/bundle.js",
        "build/output.css",
        ".git/config",
        ".vscode/settings.json",
        "coverage/lcov.info",
        "src/__pycache__/module.pyc",
        "logs/app.log",
        "temp/cache.tmp",
        "README.md",
      ]

      const expectedIgnored: boolean[] = [
        false, // "src/index.ts"
        false, // "src/components/Button.tsx"
        true, // "node_modules/react/index.js"
        true, // "dist/bundle.js"
        true, // "build/output.css"
        true, // ".git/config"
        true, // ".vscode/settings.json"
        true, // "coverage/lcov.info"
        true, // "src/__pycache__/module.pyc"
        true, // "logs/app.log"
        true, // "temp/cache.tmp"
        false, // "README.md"
      ]

      projectFiles.forEach((file, index) => {
        const result = FileIgnore.match(file)
        expect(result).toBe(expectedIgnored[index])
      })
    })

    it("should work with custom ignore patterns", () => {
      const customIgnore = {
        extra: ["*.test.js", "docs/**"],
        whitelist: ["docs/README.md"]
      }

      expect(FileIgnore.match("component.test.js", customIgnore)).toBe(true)
      expect(FileIgnore.match("docs/api.md", customIgnore)).toBe(true)
      expect(FileIgnore.match("docs/README.md", customIgnore)).toBe(false)
      expect(FileIgnore.match("src/component.js", customIgnore)).toBe(false)
    })
  })
})
