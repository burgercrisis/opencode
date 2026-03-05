import { expect, it, describe, beforeEach, afterEach } from "bun:test"
import { LSPServer } from "../server"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import path from "path"
import { BunProc } from "../../bun"
import { Global } from "../../global"
import { Filesystem } from "../../util/filesystem"
import { Flag } from "../../flag/flag"

describe("LSPServer - Comprehensive Coverage Tests", () => {
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
  let tmp: any
  let originalBunWhich: any
  let originalBunResolve: any
  let originalGlobalPath: any

  beforeEach(async () => {
    tmp = await tmpdir()
    originalBunWhich = Bun.which
    originalBunResolve = Bun.resolve
    originalGlobalPath = Global.Path.data
  })

  afterEach(async () => {
    await tmp?.dispose?.()
    Bun.which = originalBunWhich
    Bun.resolve = originalBunResolve
    Global.Path.data = originalGlobalPath
  })

  describe("pathExists utility", () => {
    it("returns true when file exists", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const testFile = path.join(tmp.path, "test.txt")
          await Bun.write(testFile, "test content")

          // Access internal pathExists function through module
          const result = await (LSPServer as any).pathExists(testFile)
          expect(result).toBe(true)
        }
      })
    })

    it("returns false when file does not exist", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const nonExistentFile = path.join(tmp.path, "nonexistent.txt")

          const result = await (LSPServer as any).pathExists(nonExistentFile)
          expect(result).toBe(false)
        }
      })
    })
  })

  describe("NearestRoot utility", () => {
    it("finds root with include patterns", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Create package.json in parent directory
          const packageJson = path.join(tmp.path, "package.json")
          await Bun.write(packageJson, '{"name": "test"}')

          const subDir = path.join(tmp.path, "src")
          await Bun.mkdir(subDir, { recursive: true })
          const testFile = path.join(subDir, "test.ts")
          await Bun.write(testFile, "const x = 1;")

          const rootFn = (LSPServer as any).NearestRoot(["package.json"])
          const root = await rootFn(testFile)

          expect(root).toBe(tmp.path)
        }
      })
    })

    it("returns instance directory when no pattern found", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const testFile = path.join(tmp.path, "test.ts")
          await Bun.write(testFile, "const x = 1;")

          const rootFn = (LSPServer as any).NearestRoot(["nonexistent.json"])
          const root = await rootFn(testFile)

          expect(root).toBe(Instance.directory)
        }
      })
    })

    it("respects exclude patterns", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Create package.json in parent directory
          const packageJson = path.join(tmp.path, "package.json")
          await Bun.write(packageJson, '{"name": "test"}')

          // Create deno.json to exclude
          const denoJson = path.join(tmp.path, "deno.json")
          await Bun.write(denoJson, '{"compilerOptions": {}}')

          const subDir = path.join(tmp.path, "src")
          await Bun.mkdir(subDir, { recursive: true })
          const testFile = path.join(subDir, "test.ts")
          await Bun.write(testFile, "const x = 1;")

          const rootFn = (LSPServer as any).NearestRoot(["package.json"], ["deno.json"])
          const root = await rootFn(testFile)

          expect(root).toBeUndefined() // Excluded by deno.json
        }
      })
    })
  })

  describe("Deno server", () => {
    it("returns undefined when deno is not found", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => undefined

          const handle = await LSPServer.Deno.spawn(tmp.path)
          expect(handle).toBeUndefined()
        }
      })
    })

    it("spawns deno process when available", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => "/usr/bin/deno"

          const handle = await LSPServer.Deno.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()
          expect(handle.process.spawnargs).toEqual(["lsp"])
          expect(handle.process.spawnfile).toBe("/usr/bin/deno")
        }
      })
    })

    it("finds deno.json root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const denoJson = path.join(tmp.path, "deno.json")
          await Bun.write(denoJson, '{"compilerOptions": {}}')

          const subDir = path.join(tmp.path, "src")
          await Bun.mkdir(subDir, { recursive: true })
          const testFile = path.join(subDir, "test.ts")
          await Bun.write(testFile, "const x = 1;")

          const root = await LSPServer.Deno.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })

    it("returns undefined when no deno.json found", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const testFile = path.join(tmp.path, "test.ts")
          await Bun.write(testFile, "const x = 1;")

          const root = await LSPServer.Deno.root(testFile)
          expect(root).toBeUndefined()
        }
      })
    })

    it("finds deno.jsonc root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const denoJsonc = path.join(tmp.path, "deno.jsonc")
          await Bun.write(denoJsonc, '{"compilerOptions": {}}')

          const testFile = path.join(tmp.path, "test.ts")
          await Bun.write(testFile, "const x = 1;")

          const root = await LSPServer.Deno.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })
  })

  describe("TypeScript server", () => {
    it("returns undefined when tsserver is not found", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.resolve = () => Promise.reject(new Error("Not found"))

          const handle = await LSPServer.Typescript.spawn(tmp.path)
          expect(handle).toBeUndefined()
        }
      })
    })

    it("spawns typescript server when tsserver is found", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.resolve = () => Promise.resolve("/path/to/tsserver.js")
          BunProc.which = () => "bun"

          const handle = await LSPServer.Typescript.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()
          expect(handle.process.spawnargs).toEqual(["x", "typescript-language-server", "--stdio"])
        }
      })
    })

    it("finds package.json root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const packageJson = path.join(tmp.path, "package.json")
          await Bun.write(packageJson, '{"name": "test"}')

          const subDir = path.join(tmp.path, "src")
          await Bun.mkdir(subDir, { recursive: true })
          const testFile = path.join(subDir, "test.ts")
          await Bun.write(testFile, "const x = 1;")

          const root = await LSPServer.Typescript.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })

    it("respects deno.json exclusion", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const packageJson = path.join(tmp.path, "package.json")
          await Bun.write(packageJson, '{"name": "test"}')

          const denoJson = path.join(tmp.path, "deno.json")
          await Bun.write(denoJson, '{"compilerOptions": {}}')

          const testFile = path.join(tmp.path, "test.ts")
          await Bun.write(testFile, "const x = 1;")

          const root = await LSPServer.Typescript.root(testFile)
          expect(root).toBeUndefined() // Should be excluded by deno.json
        }
      })
    })

    it("finds various lock files", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const lockFiles = [
            "package-lock.json",
            "bun.lockb",
            "bun.lock",
            "pnpm-lock.yaml",
            "yarn.lock"
          ]

          for (const lockFile of lockFiles) {
            await Instance.provide({
              directory: tmp.path,
              fn: async () => {
                const lockPath = path.join(tmp.path, lockFile)
                await Bun.write(lockPath, "{}")

                const testFile = path.join(tmp.path, "test.ts")
                await Bun.write(testFile, "const x = 1;")

                const root = await LSPServer.Typescript.root(testFile)
                expect(root).toBe(tmp.path)

                // Clean up for next iteration
                await Bun.remove(lockPath)
              }
            })
          }
        }
      })
    })
  })

  describe("Python server", () => {
    it("finds pyproject.toml root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const pyprojectToml = path.join(tmp.path, "pyproject.toml")
          await Bun.write(pyprojectToml, "[tool.poetry]\nname = 'test'")

          const testFile = path.join(tmp.path, "test.py")
          await Bun.write(testFile, "x = 1")

          const root = await LSPServer.Pyright.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })

    it("finds requirements.txt root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const requirementsTxt = path.join(tmp.path, "requirements.txt")
          await Bun.write(requirementsTxt, "flask==2.0.0")

          const testFile = path.join(tmp.path, "test.py")
          await Bun.write(testFile, "x = 1")

          const root = await LSPServer.Pyright.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })

    it("finds setup.py root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const setupPy = path.join(tmp.path, "setup.py")
          await Bun.write(setupPy, "from setuptools import setup\nsetup(name='test')")

          const testFile = path.join(tmp.path, "test.py")
          await Bun.write(testFile, "x = 1")

          const root = await LSPServer.Pyright.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })

    it("finds .pylintrc root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const pylintrc = path.join(tmp.path, ".pylintrc")
          await Bun.write(pylintrc, "[FORMAT]\nmax-line-length=88")

          const testFile = path.join(tmp.path, "test.py")
          await Bun.write(testFile, "x = 1")

          const root = await LSPServer.Pyright.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })

    it("spawns pyright process when available", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => "/usr/bin/pyright"

          const handle = await LSPServer.Pyright.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()
          expect(handle.process.spawnargs).toEqual(["--stdio"])
          expect(handle.process.spawnfile).toBe("/usr/bin/pyright")
        }
      })
    })

    it("returns undefined when pyright is not found", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => undefined

          const handle = await LSPServer.Pyright.spawn(tmp.path)
          expect(handle).toBeUndefined()
        }
      })
    })
  })

  describe("Experimental TY server", () => {
    it("finds go.mod root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const goMod = path.join(tmp.path, "go.mod")
          await Bun.write(goMod, "module test\n\ngo 1.21")

          const testFile = path.join(tmp.path, "test.go")
          await Bun.write(testFile, "package main\n\nfunc main() {}")

          const root = await LSPServer.Ty.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })

    it("spawns ty process when available", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => "/usr/bin/ty"

          const handle = await LSPServer.Ty.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()
          expect(handle.process.spawnargs).toEqual(["lsp"])
          expect(handle.process.spawnfile).toBe("/usr/bin/ty")
        }
      })
    })

    it("returns undefined when ty is not found", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => undefined

          const handle = await LSPServer.Ty.spawn(tmp.path)
          expect(handle).toBeUndefined()
        }
      })
    })
  })

  describe("HTML server", () => {
    it("finds package.json root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const packageJson = path.join(tmp.path, "package.json")
          await Bun.write(packageJson, '{"name": "test"}')

          const testFile = path.join(tmp.path, "test.html")
          await Bun.write(testFile, "<html></html>")

          const root = await LSPServer.HTML.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })

    it("spawns vscode-html-languageserver process when available", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => "/usr/bin/vscode-html-languageserver"

          const handle = await LSPServer.HTML.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()
          expect(handle.process.spawnargs).toEqual(["--stdio"])
          expect(handle.process.spawnfile).toBe("/usr/bin/vscode-html-languageserver")
        }
      })
    })

    it("returns undefined when vscode-html-languageserver is not found", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => undefined

          const handle = await LSPServer.HTML.spawn(tmp.path)
          expect(handle).toBeUndefined()
        }
      })
    })
  })

  describe("CSS server", () => {
    it("finds package.json root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const packageJson = path.join(tmp.path, "package.json")
          await Bun.write(packageJson, '{"name": "test"}')

          const testFile = path.join(tmp.path, "test.css")
          await Bun.write(testFile, "body { margin: 0; }")

          const root = await LSPServer.CSS.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })

    it("spawns vscode-css-languageserver process when available", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => "/usr/bin/vscode-css-languageserver"

          const handle = await LSPServer.CSS.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()
          expect(handle.process.spawnargs).toEqual(["--stdio"])
          expect(handle.process.spawnfile).toBe("/usr/bin/vscode-css-languageserver")
        }
      })
    })

    it("returns undefined when vscode-css-languageserver is not found", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => undefined

          const handle = await LSPServer.CSS.spawn(tmp.path)
          expect(handle).toBeUndefined()
        }
      })
    })
  })

  describe("JSON server", () => {
    it("finds package.json root correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const packageJson = path.join(tmp.path, "package.json")
          await Bun.write(packageJson, '{"name": "test"}')

          const testFile = path.join(tmp.path, "test.json")
          await Bun.write(testFile, '{"key": "value"}')

          const root = await LSPServer.JSON.root(testFile)
          expect(root).toBe(tmp.path)
        }
      })
    })

    it("spawns vscode-json-languageserver process when available", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => "/usr/bin/vscode-json-languageserver"

          const handle = await LSPServer.JSON.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()
          expect(handle.process.spawnargs).toEqual(["--stdio"])
          expect(handle.process.spawnfile).toBe("/usr/bin/vscode-json-languageserver")
        }
      })
    })

    it("returns undefined when vscode-json-languageserver is not found", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => undefined

          const handle = await LSPServer.JSON.spawn(tmp.path)
          expect(handle).toBeUndefined()
        }
      })
    })
  })

  describe("Global servers", () => {
    it("handles global TypeScript server", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.resolve = () => Promise.resolve("/path/to/tsserver.js")
          BunProc.which = () => "bun"

          const handle = await LSPServer.TypescriptGlobal.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()
          expect(handle.process.spawnargs).toEqual(["x", "typescript-language-server", "--stdio"])
        }
      })
    })

    it("handles global Ty server", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Bun.which = () => "/usr/bin/ty"

          const handle = await LSPServer.TyGlobal.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()
          expect(handle.process.spawnargs).toEqual(["lsp"])
          expect(handle.process.spawnfile).toBe("/usr/bin/ty")
        }
      })
    })
  })

  describe("Archive-based servers", () => {
    it("handles Rust analyzer server", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Mock archive extraction
          const mockExtract = () => Promise.resolve()
          const originalExtract = (Archive as any).extract
            ; (Archive as any).extract = mockExtract

          // Mock platform detection
          const originalPlatform = process.platform
          Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true
          })

          // Mock file existence check
          const originalPathExists = (LSPServer as any).pathExists
            ; (LSPServer as any).pathExists = () => Promise.resolve(true)

          const handle = await LSPServer.RustAnalyzer.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()

            // Restore mocks
            ; (Archive as any).extract = originalExtract
            ; (LSPServer as any).pathExists = originalPathExists
          Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            configurable: true
          })
        }
      })
    })

    it("handles CLangD server", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Mock archive extraction
          const mockExtract = () => Promise.resolve()
          const originalExtract = (Archive as any).extract
            ; (Archive as any).extract = mockExtract

          // Mock platform detection
          const originalPlatform = process.platform
          Object.defineProperty(process, 'platform', {
            value: 'linux',
            configurable: true
          })

          // Mock file existence check
          const originalPathExists = (LSPServer as any).pathExists
            ; (LSPServer as any).pathExists = () => Promise.resolve(true)

          const handle = await LSPServer.Clangd.spawn(tmp.path)

          expect(handle).toBeDefined()
          expect(handle.process).toBeDefined()

            // Restore mocks
            ; (Archive as any).extract = originalExtract
            ; (LSPServer as any).pathExists = originalPathExists
          Object.defineProperty(process, 'platform', {
            value: originalPlatform,
            configurable: true
          })
        }
      })
    })
  })

  describe("Extension filtering", () => {
    it("correctly matches TypeScript extensions", () => {
      const extensions = LSPServer.Typescript.extensions
      expect(extensions).toContain(".ts")
      expect(extensions).toContain(".tsx")
      expect(extensions).toContain(".js")
      expect(extensions).toContain(".jsx")
      expect(extensions).toContain(".mjs")
      expect(extensions).toContain(".cjs")
      expect(extensions).toContain(".mts")
      expect(extensions).toContain(".cts")
    })

    it("correctly matches Python extensions", () => {
      const extensions = LSPServer.Pyright.extensions
      expect(extensions).toContain(".py")
    })

    it("correctly matches Go extensions", () => {
      const extensions = LSPServer.Ty.extensions
      expect(extensions).toContain(".go")
    })

    it("correctly matches HTML extensions", () => {
      const extensions = LSPServer.HTML.extensions
      expect(extensions).toContain(".html")
      expect(extensions).toContain(".htm")
    })

    it("correctly matches CSS extensions", () => {
      const extensions = LSPServer.CSS.extensions
      expect(extensions).toContain(".css")
      expect(extensions).toContain(".scss")
      expect(extensions).toContain(".less")
    })

    it("correctly matches JSON extensions", () => {
      const extensions = LSPServer.JSON.extensions
      expect(extensions).toContain(".json")
    })
  })

  describe("Server properties", () => {
    it("has correct server IDs", () => {
      expect(LSPServer.Deno.id).toBe("deno")
      expect(LSPServer.Typescript.id).toBe("typescript")
      expect(LSPServer.Pyright.id).toBe("pyright")
      expect(LSPServer.Ty.id).toBe("ty")
      expect(LSPServer.HTML.id).toBe("html")
      expect(LSPServer.CSS.id).toBe("css")
      expect(LSPServer.JSON.id).toBe("json")
      expect(LSPServer.RustAnalyzer.id).toBe("rust-analyzer")
      expect(LSPServer.Clangd.id).toBe("clangd")
    })

    it("has correct global flags", () => {
      expect(LSPServer.TypescriptGlobal.global).toBe(true)
      expect(LSPServer.TyGlobal.global).toBe(true)
      expect(LSPServer.Deno.global).toBeUndefined()
      expect(LSPServer.Pyright.global).toBeUndefined()
    })
  })
})
