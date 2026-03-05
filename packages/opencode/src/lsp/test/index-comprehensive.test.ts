import { expect, it, describe, beforeEach, afterEach } from "bun:test"
import { LSP } from "../index"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import path from "path"
import { BunProc } from "../../bun"
import { Flag } from "../../flag/flag"
import { LSPClient } from "../client"
import { Bus } from "../../bus/index"

describe("LSP Index - Comprehensive Coverage Tests", () => {
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
  let originalConfig: any
  let originalFlag: any

  beforeEach(async () => {
    tmp = await tmpdir()
    originalConfig = Config.get
    originalFlag = Flag.OPENCODE_EXPERIMENTAL_LSP_TY
  })

  afterEach(async () => {
    await tmp?.dispose?.()
    Config.get = originalConfig
    Flag.OPENCODE_EXPERIMENTAL_LSP_TY = originalFlag
  })

  describe("Experimental server filtering", () => {
    it("disables pyright when OPENCODE_EXPERIMENTAL_LSP_TY is true", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Flag.OPENCODE_EXPERIMENTAL_LSP_TY = true

          const servers = {
            "pyright": { id: "pyright" },
            "typescript": { id: "typescript" },
            "ty": { id: "ty" }
          }

          // Access the internal filter function through module state
          await LSP.init()
          const state = await (LSP as any).state()

          // The filtering should have removed pyright
          expect(state.servers["pyright"]).toBeUndefined()
          expect(state.servers["typescript"]).toBeDefined()
          expect(state.servers["ty"]).toBeDefined()
        }
      })
    })

    it("disables ty when OPENCODE_EXPERIMENTAL_LSP_TY is false", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Flag.OPENCODE_EXPERIMENTAL_LSP_TY = false

          const servers = {
            "pyright": { id: "pyright" },
            "typescript": { id: "typescript" },
            "ty": { id: "ty" }
          }

          await LSP.init()
          const state = await (LSP as any).state()

          // The filtering should have removed ty
          expect(state.servers["ty"]).toBeUndefined()
          expect(state.servers["pyright"]).toBeDefined()
          expect(state.servers["typescript"]).toBeDefined()
        }
      })
    })
  })

  describe("State management", () => {
    it("returns empty state when LSP is disabled", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({ lsp: false })

          const state = await (LSP as any).state()

          expect(state.clients).toEqual([])
          expect(state.servers).toEqual({})
          expect(state.broken).toBeInstanceOf(Set)
          expect(state.spawning).toBeInstanceOf(Map)
        }
      })
    })

    it("initializes with default servers when LSP is enabled", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({ lsp: true })

          const state = await (LSP as any).state()

          expect(state.servers).toBeDefined()
          expect(Object.keys(state.servers).length).toBeGreaterThan(0)
        }
      })
    })

    it("processes custom LSP configuration", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            lsp: {
              customServer: {
                command: ["custom-lsp"],
                extensions: [".custom"],
                initialization: { custom: "config" }
              },
              disabledServer: {
                disabled: true,
                command: ["disabled-lsp"],
                extensions: [".disabled"]
              }
            }
          })

          const state = await (LSP as any).state()

          expect(state.servers["customServer"]).toBeDefined()
          expect(state.servers["disabledServer"]).toBeUndefined()
        }
      })
    })
  })

  describe("Status function", () => {
    it("returns status for connected clients", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Mock a client in the state
          const mockClient = {
            serverID: "test-server",
            root: tmp.path,
            shutdown: () => Promise.resolve()
          }

          await LSP.init()
          const state = await (LSP as any).state()
          state.clients.push(mockClient)

          const status = await LSP.status()

          expect(status).toHaveLength(1)
          expect(status[0]).toMatchObject({
            id: "test-server",
            status: "connected"
          })
          expect(status[0].root).toBeDefined()
        }
      })
    })

    it("returns empty array when no clients", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({ lsp: false })

          const status = await LSP.status()

          expect(status).toEqual([])
        }
      })
    })
  })

  describe("Client management", () => {
    it("returns false for hasClients when no servers support file", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            lsp: {
              testServer: {
                command: ["test-lsp"],
                extensions: [".unsupported"]
              }
            }
          })

          const hasClients = await LSP.hasClients("test.txt")

          expect(hasClients).toBe(false)
        }
      })
    })

    it("returns true for hasClients when server supports file", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            lsp: {
              testServer: {
                command: ["test-lsp"],
                extensions: [".txt"]
              }
            }
          })

          const hasClients = await LSP.hasClients("test.txt")

          expect(hasClients).toBe(true)
        }
      })
    })

    it("handles broken servers in hasClients", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          Config.get = () => Promise.resolve({
            lsp: {
              testServer: {
                command: ["test-lsp"],
                extensions: [".txt"]
              }
            }
          })

          await LSP.init()
          const state = await (LSP as any).state()
          state.broken.add(tmp.path + "testServer")

          const hasClients = await LSP.hasClients("test.txt")

          expect(hasClients).toBe(false)
        }
      })
    })
  })

  describe("File operations", () => {
    it("handles touchFile with waitForDiagnostics", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const testFile = path.join(tmp.path, "test.ts")
          await Bun.write(testFile, "const x = 1;")

          let fileTouched = false
          const mockClient = {
            serverID: "test-server",
            root: tmp.path,
            notify: {
              open: async ({ path }: { path: string }) => {
                fileTouched = true
                expect(path).toContain("test.ts")
              }
            },
            waitForDiagnostics: async ({ path }: { path: string }) => {
              expect(path).toContain("test.ts")
            },
            shutdown: () => Promise.resolve()
          }

          // Mock getClients to return our mock client
          const originalGetClients = (LSP as any).getClients
            ; (LSP as any).getClients = () => Promise.resolve([mockClient])

          await LSP.touchFile("test.ts", true)

          expect(fileTouched).toBe(true)

            // Restore original function
            ; (LSP as any).getClients = originalGetClients
        }
      })
    })

    it("handles touchFile without waitForDiagnostics", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const testFile = path.join(tmp.path, "test.ts")
          await Bun.write(testFile, "const x = 1;")

          let fileTouched = false
          const mockClient = {
            serverID: "test-server",
            root: tmp.path,
            notify: {
              open: async ({ path }: { path: string }) => {
                fileTouched = true
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalGetClients = (LSP as any).getClients
            ; (LSP as any).getClients = () => Promise.resolve([mockClient])

          await LSP.touchFile("test.ts", false)

          expect(fileTouched).toBe(true)

            ; (LSP as any).getClients = originalGetClients
        }
      })
    })

    it("handles touchFile errors gracefully", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockClient = {
            serverID: "test-server",
            root: tmp.path,
            notify: {
              open: async () => {
                throw new Error("Test error")
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalGetClients = (LSP as any).getClients
            ; (LSP as any).getClients = () => Promise.resolve([mockClient])

          // Should not throw
          await LSP.touchFile("test.ts")

            ; (LSP as any).getClients = originalGetClients
        }
      })
    })

    it("collects diagnostics from all clients", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockClient1 = {
            diagnostics: new Map([
              ["file1.ts", [{ message: "error1" }]],
              ["file2.ts", [{ message: "error2" }]]
            ]),
            shutdown: () => Promise.resolve()
          }

          const mockClient2 = {
            diagnostics: new Map([
              ["file1.ts", [{ message: "error3" }]],
              ["file3.ts", [{ message: "error4" }]]
            ]),
            shutdown: () => Promise.resolve()
          }

          const originalRunAll = (LSP as any).runAll
            ; (LSP as any).runAll = () => Promise.resolve([mockClient1.diagnostics, mockClient2.diagnostics])

          const diagnostics = await LSP.diagnostics()

          expect(diagnostics["file1.ts"]).toHaveLength(2)
          expect(diagnostics["file2.ts"]).toHaveLength(1)
          expect(diagnostics["file3.ts"]).toHaveLength(1)

            ; (LSP as any).runAll = originalRunAll
        }
      })
    })
  })

  describe("LSP operations", () => {
    it("performs hover operation", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockClient = {
            connection: {
              sendRequest: async (request: string, params: any) => {
                expect(request).toBe("textDocument/hover")
                expect(params.textDocument.uri).toContain("test.ts")
                expect(params.position.line).toBe(1)
                expect(params.position.character).toBe(5)
                return { contents: "test hover result" }
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalRun = (LSP as any).run
            ; (LSP as any).run = () => Promise.resolve([mockClient])

          const result = await LSP.hover({ file: "test.ts", line: 1, character: 5 })

          expect(result).toEqual([{ contents: "test hover result" }])

            ; (LSP as any).run = originalRun
        }
      })
    })

    it("handles hover operation errors", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockClient = {
            connection: {
              sendRequest: async () => {
                throw new Error("Hover failed")
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalRun = (LSP as any).run
            ; (LSP as any).run = () => Promise.resolve([mockClient])

          const result = await LSP.hover({ file: "test.ts", line: 1, character: 5 })

          expect(result).toEqual([null])

            ; (LSP as any).run = originalRun
        }
      })
    })

    it("performs workspaceSymbol operation", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockSymbols = [
            { name: "testSymbol", kind: 5, location: { uri: "file://test.ts", range: {} } },
            { name: "testSymbol2", kind: 12, location: { uri: "file://test2.ts", range: {} } }
          ]

          const mockClient = {
            connection: {
              sendRequest: async (request: string, params: any) => {
                expect(request).toBe("workspace/symbol")
                expect(params.query).toBe("test")
                return mockSymbols
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalRunAll = (LSP as any).runAll
            ; (LSP as any).runAll = () => Promise.resolve([mockClient])

          const result = await LSP.workspaceSymbol("test")

          expect(result).toEqual(mockSymbols)

            ; (LSP as any).runAll = originalRunAll
        }
      })
    })

    it("filters workspace symbols by kind", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockSymbols = [
            { name: "classSymbol", kind: 5, location: { uri: "file://test.ts", range: {} } },
            { name: "functionSymbol", kind: 12, location: { uri: "file://test.ts", range: {} } },
            { name: "variableSymbol", kind: 13, location: { uri: "file://test.ts", range: {} } },
            { name: "unsupportedSymbol", kind: 1, location: { uri: "file://test.ts", range: {} } }
          ]

          const mockClient = {
            connection: {
              sendRequest: async () => mockSymbols
            },
            shutdown: () => Promise.resolve()
          }

          const originalRunAll = (LSP as any).runAll
            ; (LSP as any).runAll = () => Promise.resolve([mockClient])

          const result = await LSP.workspaceSymbol("test")

          // Should filter to only include Class, Function, Method, Interface, Variable, Constant, Struct, Enum
          expect(result).toHaveLength(3) // class, function, variable
          expect(result.find(s => s.name === "unsupportedSymbol")).toBeUndefined()

            ; (LSP as any).runAll = originalRunAll
        }
      })
    })

    it("limits workspace symbol results", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockSymbols = Array.from({ length: 15 }, (_, i) => ({
            name: `symbol${i}`,
            kind: 12,
            location: { uri: `file://test${i}.ts`, range: {} }
          }))

          const mockClient = {
            connection: {
              sendRequest: async () => mockSymbols
            },
            shutdown: () => Promise.resolve()
          }

          const originalRunAll = (LSP as any).runAll
            ; (LSP as any).runAll = () => Promise.resolve([mockClient])

          const result = await LSP.workspaceSymbol("test")

          expect(result).toHaveLength(10) // Limited to 10

            ; (LSP as any).runAll = originalRunAll
        }
      })
    })

    it("performs documentSymbol operation", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockSymbols = [
            { name: "testFunction", kind: 12, range: {}, selectionRange: {} },
            { name: "testClass", kind: 5, range: {}, selectionRange: {} }
          ]

          const mockClient = {
            connection: {
              sendRequest: async (request: string, params: any) => {
                expect(request).toBe("textDocument/documentSymbol")
                expect(params.textDocument.uri).toContain("test.ts")
                return mockSymbols
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalRun = (LSP as any).run
            ; (LSP as any).run = () => Promise.resolve([mockClient])

          const result = await LSP.documentSymbol("file://test.ts")

          expect(result).toEqual(mockSymbols)

            ; (LSP as any).run = originalRun
        }
      })
    })

    it("performs definition operation", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockDefinition = {
            uri: "file://definition.ts",
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }
          }

          const mockClient = {
            connection: {
              sendRequest: async (request: string, params: any) => {
                expect(request).toBe("textDocument/definition")
                expect(params.textDocument.uri).toContain("test.ts")
                expect(params.position.line).toBe(1)
                expect(params.position.character).toBe(5)
                return [mockDefinition]
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalRun = (LSP as any).run
            ; (LSP as any).run = () => Promise.resolve([mockClient])

          const result = await LSP.definition({ file: "test.ts", line: 1, character: 5 })

          expect(result).toEqual([mockDefinition])

            ; (LSP as any).run = originalRun
        }
      })
    })

    it("performs references operation", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockReferences = [
            {
              uri: "file://reference1.ts",
              range: { start: { line: 5, character: 10 }, end: { line: 5, character: 20 } }
            },
            {
              uri: "file://reference2.ts",
              range: { start: { line: 10, character: 5 }, end: { line: 10, character: 15 } }
            }
          ]

          const mockClient = {
            connection: {
              sendRequest: async (request: string, params: any) => {
                expect(request).toBe("textDocument/references")
                expect(params.context.includeDeclaration).toBe(true)
                return mockReferences
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalRun = (LSP as any).run
            ; (LSP as any).run = () => Promise.resolve([mockClient])

          const result = await LSP.references({ file: "test.ts", line: 1, character: 5 })

          expect(result).toEqual(mockReferences)

            ; (LSP as any).run = originalRun
        }
      })
    })

    it("performs implementation operation", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockImplementation = {
            uri: "file://implementation.ts",
            range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } }
          }

          const mockClient = {
            connection: {
              sendRequest: async (request: string, params: any) => {
                expect(request).toBe("textDocument/implementation")
                return [mockImplementation]
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalRun = (LSP as any).run
            ; (LSP as any).run = () => Promise.resolve([mockClient])

          const result = await LSP.implementation({ file: "test.ts", line: 1, character: 5 })

          expect(result).toEqual([mockImplementation])

            ; (LSP as any).run = originalRun
        }
      })
    })

    it("performs prepareCallHierarchy operation", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockHierarchy = [
            { name: "testFunction", kind: 12, uri: "file://test.ts", range: {} }
          ]

          const mockClient = {
            connection: {
              sendRequest: async (request: string, params: any) => {
                expect(request).toBe("textDocument/prepareCallHierarchy")
                return mockHierarchy
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalRun = (LSP as any).run
            ; (LSP as any).run = () => Promise.resolve([mockClient])

          const result = await LSP.prepareCallHierarchy({ file: "test.ts", line: 1, character: 5 })

          expect(result).toEqual(mockHierarchy)

            ; (LSP as any).run = originalRun
        }
      })
    })

    it("performs incomingCalls operation", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockHierarchy = [{ name: "testFunction", kind: 12 }]
          const mockIncomingCalls = [
            { name: "caller1", kind: 12 },
            { name: "caller2", kind: 12 }
          ]

          const mockClient = {
            connection: {
              sendRequest: async (request: string, params: any) => {
                if (request === "textDocument/prepareCallHierarchy") {
                  return mockHierarchy
                }
                if (request === "callHierarchy/incomingCalls") {
                  expect(params.item).toEqual(mockHierarchy[0])
                  return mockIncomingCalls
                }
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalRun = (LSP as any).run
            ; (LSP as any).run = () => Promise.resolve([mockClient])

          const result = await LSP.incomingCalls({ file: "test.ts", line: 1, character: 5 })

          expect(result).toEqual(mockIncomingCalls)

            ; (LSP as any).run = originalRun
        }
      })
    })

    it("performs outgoingCalls operation", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const mockHierarchy = [{ name: "testFunction", kind: 12 }]
          const mockOutgoingCalls = [
            { name: "callee1", kind: 12 },
            { name: "callee2", kind: 12 }
          ]

          const mockClient = {
            connection: {
              sendRequest: async (request: string, params: any) => {
                if (request === "textDocument/prepareCallHierarchy") {
                  return mockHierarchy
                }
                if (request === "callHierarchy/outgoingCalls") {
                  expect(params.item).toEqual(mockHierarchy[0])
                  return mockOutgoingCalls
                }
              }
            },
            shutdown: () => Promise.resolve()
          }

          const originalRun = (LSP as any).run
            ; (LSP as any).run = () => Promise.resolve([mockClient])

          const result = await LSP.outgoingCalls({ file: "test.ts", line: 1, character: 5 })

          expect(result).toEqual(mockOutgoingCalls)

            ; (LSP as any).run = originalRun
        }
      })
    })
  })

  describe("Diagnostic pretty printing", () => {
    it("formats error diagnostic correctly", () => {
      const diagnostic = {
        severity: 1,
        range: {
          start: { line: 10, character: 5 },
          end: { line: 10, character: 15 }
        },
        message: "Test error message"
      }

      const pretty = LSP.Diagnostic.pretty(diagnostic)

      expect(pretty).toBe("ERROR [11:6] Test error message")
    })

    it("formats warning diagnostic correctly", () => {
      const diagnostic = {
        severity: 2,
        range: {
          start: { line: 5, character: 10 },
          end: { line: 5, character: 20 }
        },
        message: "Test warning message"
      }

      const pretty = LSP.Diagnostic.pretty(diagnostic)

      expect(pretty).toBe("WARN [6:11] Test warning message")
    })

    it("formats info diagnostic correctly", () => {
      const diagnostic = {
        severity: 3,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 }
        },
        message: "Test info message"
      }

      const pretty = LSP.Diagnostic.pretty(diagnostic)

      expect(pretty).toBe("INFO [1:1] Test info message")
    })

    it("formats hint diagnostic correctly", () => {
      const diagnostic = {
        severity: 4,
        range: {
          start: { line: 100, character: 50 },
          end: { line: 100, character: 60 }
        },
        message: "Test hint message"
      }

      const pretty = LSP.Diagnostic.pretty(diagnostic)

      expect(pretty).toBe("HINT [101:51] Test hint message")
    })

    it("defaults to ERROR when severity is missing", () => {
      const diagnostic = {
        range: {
          start: { line: 1, character: 1 },
          end: { line: 1, character: 5 }
        },
        message: "Test message without severity"
      }

      const pretty = LSP.Diagnostic.pretty(diagnostic)

      expect(pretty).toBe("ERROR [2:2] Test message without severity")
    })
  })

  describe("Bus events", () => {
    it("publishes Updated event when client is spawned", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let eventPublished = false
          const originalPublish = Bus.publish
          Bus.publish = (event: any, data: any) => {
            if (event.type === "lsp.updated") {
              eventPublished = true
            }
          }

          Config.get = () => Promise.resolve({
            lsp: {
              testServer: {
                command: ["echo", "test"],
                extensions: [".ts"]
              }
            }
          })

          // Trigger client spawning
          await (LSP as any).getClients("test.ts")

          expect(eventPublished).toBe(true)
          Bus.publish = originalPublish
        }
      })
    })
  })
})
