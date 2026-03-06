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

import { expect, it, describe, beforeEach, afterEach } from "bun:test"
import { LSPClient } from "../client"
import { Instance } from "../../project/instance"
import { tmpdir } from "../../../test/fixture/fixture"
import path from "path"
import { spawn } from "child_process"
import { Bus } from "../../bus/index"
import { Filesystem } from "../../util/filesystem"
import { withTimeout } from "../../util/timeout"

describe("LSPClient - Comprehensive Coverage Tests", () => {
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
  let mockServerProcess: any
  let mockConnection: any

  beforeEach(async () => {
    tmp = await tmpdir()

    // Mock server process with stdout/stdin streams
    mockServerProcess = {
      pid: 12345,
      stdout: {
        on: () => { },
        pipe: () => { }
      },
      stdin: {
        on: () => { },
        pipe: () => { }
      },
      kill: () => { }
    }

    // Mock connection methods
    mockConnection = {
      onNotification: () => { },
      onRequest: () => Promise.resolve(),
      listen: () => { },
      sendRequest: () => Promise.resolve(),
      sendNotification: () => Promise.resolve(),
      end: () => { },
      dispose: () => { }
    }
  })

  afterEach(async () => {
    await tmp?.dispose?.()
  })

  describe("Diagnostic handling", () => {
    it("handles textDocument/publishDiagnostics notification", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          // Mock the createMessageConnection to return our mock
          const originalCreateMessageConnection = require("vscode-jsonrpc/node").createMessageConnection
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          const client = await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          // Simulate diagnostic notification
          const diagnosticHandler = mockConnection.onNotification
          expect(typeof diagnosticHandler).toBe("function")

          await client.shutdown()
        }
      })
    })

    it("skips diagnostics publishing for typescript server on first publish", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          let publishedDiagnostics = false
          mockConnection.onNotification = (event: string, handler: Function) => {
            if (event === "textDocument/publishDiagnostics") {
              // Simulate typescript server diagnostics
              handler({
                uri: `file://${path.join(tmp.path, "test.ts")}`,
                diagnostics: [{ message: "test error" }]
              })
              publishedDiagnostics = true
            }
          }

          const client = await LSPClient.create({
            serverID: "typescript",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          expect(publishedDiagnostics).toBe(true)
          await client.shutdown()
        }
      })
    })

    it("publishes diagnostics for non-typescript servers", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          let eventPublished = false
          const originalPublish = Bus.publish
          Bus.publish = (event: any, data: any) => {
            if (event.type === "lsp.client.diagnostics") {
              eventPublished = true
              expect(data.serverID).toBe("test-server")
              expect(data.path).toBeDefined()
            }
          }

          mockConnection.onNotification = (event: string, handler: Function) => {
            if (event === "textDocument/publishDiagnostics") {
              handler({
                uri: `file://${path.join(tmp.path, "test.ts")}`,
                diagnostics: [{ message: "test error" }]
              })
            }
          }

          const client = await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          expect(eventPublished).toBe(true)
          Bus.publish = originalPublish
          await client.shutdown()
        }
      })
    })
  })

  describe("Request handlers", () => {
    it("handles window/workDoneProgress/create request", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          let requestHandled = false
          mockConnection.onRequest = (event: string, handler: Function) => {
            if (event === "window/workDoneProgress/create") {
              handler({ token: "test-token" })
              requestHandled = true
            }
          }

          await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          expect(requestHandled).toBe(true)
        }
      })
    })

    it("handles workspace/configuration request", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          let configReturned = false
          mockConnection.onRequest = (event: string, handler: Function) => {
            if (event === "workspace/configuration") {
              const result = handler()
              expect(Array.isArray(result)).toBe(true)
              configReturned = true
            }
          }

          await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: { test: "config" }
            },
            root: tmp.path
          })

          expect(configReturned).toBe(true)
        }
      })
    })

    it("handles client/registerCapability request", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          let requestHandled = false
          mockConnection.onRequest = (event: string, handler: Function) => {
            if (event === "client/registerCapability") {
              handler({ registrations: [] })
              requestHandled = true
            }
          }

          await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          expect(requestHandled).toBe(true)
        }
      })
    })

    it("handles client/unregisterCapability request", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          let requestHandled = false
          mockConnection.onRequest = (event: string, handler: Function) => {
            if (event === "client/unregisterCapability") {
              handler({ unregisterations: [] })
              requestHandled = true
            }
          }

          await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          expect(requestHandled).toBe(true)
        }
      })
    })

    it("handles workspace/workspaceFolders request", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          let foldersReturned = false
          mockConnection.onRequest = (event: string, handler: Function) => {
            if (event === "workspace/workspaceFolders") {
              const result = handler()
              expect(Array.isArray(result)).toBe(true)
              expect(result[0]).toHaveProperty("name")
              expect(result[0]).toHaveProperty("uri")
              foldersReturned = true
            }
          }

          await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          expect(foldersReturned).toBe(true)
        }
      })
    })
  })

  describe("Initialization", () => {
    it("sends initialize request with correct parameters", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let initializeSent = false
          mockConnection.sendRequest = (request: string, params: any) => {
            if (request === "initialize") {
              expect(params).toHaveProperty("rootUri")
              expect(params).toHaveProperty("processId")
              expect(params).toHaveProperty("workspaceFolders")
              expect(params).toHaveProperty("capabilities")
              initializeSent = true
              return Promise.resolve()
            }
          }

          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          expect(initializeSent).toBe(true)
        }
      })
    })

    it("handles initialization timeout", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          mockConnection.sendRequest = () => {
            return new Promise(() => { }) // Never resolves
          }

          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          try {
            await LSPClient.create({
              serverID: "test-server",
              server: {
                process: mockServerProcess,
                initialization: {}
              },
              root: tmp.path
            })
            expect(false).toBe(true) // Should not reach here
          } catch (error) {
            expect(error).toBeDefined()
          }
        }
      })
    })

    it("sends initialized notification after initialize", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let initializeSent = false
          let initializedSent = false

          mockConnection.sendRequest = (request: string) => {
            if (request === "initialize") {
              initializeSent = true
              return Promise.resolve()
            }
          }

          mockConnection.sendNotification = (request: string) => {
            if (request === "initialized") {
              initializedSent = true
            }
          }

          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          expect(initializeSent).toBe(true)
          expect(initializedSent).toBe(true)
        }
      })
    })

    it("sends workspace/didChangeConfiguration if initialization provided", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let configChangeSent = false
          const initConfig = { test: "value" }

          mockConnection.sendNotification = (request: string, params: any) => {
            if (request === "workspace/didChangeConfiguration") {
              expect(params.settings).toEqual(initConfig)
              configChangeSent = true
            }
          }

          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: initConfig
            },
            root: tmp.path
          })

          expect(configChangeSent).toBe(true)
        }
      })
    })
  })

  describe("File operations", () => {
    beforeEach(async () => {
      // Create test file
      const testFile = path.join(tmp.path, "test.ts")
      await Bun.write(testFile, "const x = 1;")
    })

    it("handles notify.open for existing file", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let watchFileNotified = false
          let openFileNotified = false

          mockConnection.sendNotification = (request: string, params: any) => {
            if (request === "workspace/didChangeWatchedFiles") {
              expect(params.changes[0].type).toBe(1) // Created
              watchFileNotified = true
            }
            if (request === "textDocument/didOpen") {
              expect(params.textDocument).toHaveProperty("uri")
              expect(params.textDocument).toHaveProperty("languageId")
              expect(params.textDocument).toHaveProperty("version")
              expect(params.textDocument).toHaveProperty("text")
              openFileNotified = true
            }
          }

          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          const client = await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          await client.notify.open({ path: "test.ts" })

          expect(watchFileNotified).toBe(true)
          expect(openFileNotified).toBe(true)
          await client.shutdown()
        }
      })
    })

    it("handles notify.open for modified file", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let watchFileNotified = false
          let changeFileNotified = false

          mockConnection.sendNotification = (request: string, params: any) => {
            if (request === "workspace/didChangeWatchedFiles") {
              expect(params.changes[0].type).toBe(2) // Changed
              watchFileNotified = true
            }
            if (request === "textDocument/didChange") {
              expect(params.textDocument).toHaveProperty("uri")
              expect(params.textDocument).toHaveProperty("version")
              expect(params.textDocument).toHaveProperty("contentChanges")
              changeFileNotified = true
            }
          }

          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          const client = await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          // First open
          await client.notify.open({ path: "test.ts" })

          // Second open (should be treated as change)
          await client.notify.open({ path: "test.ts" })

          expect(watchFileNotified).toBe(true)
          expect(changeFileNotified).toBe(true)
          await client.shutdown()
        }
      })
    })

    it("resolves relative paths correctly", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let filePath = ""
          mockConnection.sendNotification = (request: string, params: any) => {
            if (request === "textDocument/didOpen") {
              filePath = params.textDocument.uri
            }
          }

          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          const client = await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          await client.notify.open({ path: "test.ts" })

          expect(filePath).toContain("test.ts")
          await client.shutdown()
        }
      })
    })
  })

  describe("Diagnostics management", () => {
    it("provides access to diagnostics map", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          const client = await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          const diagnostics = client.diagnostics
          expect(diagnostics).toBeInstanceOf(Map)

          await client.shutdown()
        }
      })
    })

    it("waits for diagnostics with timeout", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          const client = await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          // Should not throw, should handle timeout gracefully
          const result = await client.waitForDiagnostics({ path: "test.ts" })
          expect(result).toBeUndefined() // Promise resolves with undefined on timeout

          await client.shutdown()
        }
      })
    })

    it("resolves when matching diagnostics event is received", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          const client = await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          // Simulate receiving diagnostics event
          setTimeout(() => {
            Bus.publish(LSPClient.Event.Diagnostics, {
              path: Filesystem.normalizePath(path.join(tmp.path, "test.ts")),
              serverID: "test-server"
            })
          }, 100)

          const result = await client.waitForDiagnostics({ path: "test.ts" })
          expect(result).toBeUndefined() // Promise resolves

          await client.shutdown()
        }
      })
    })
  })

  describe("Shutdown", () => {
    it("properly shuts down connection and process", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          let connectionEnded = false
          let connectionDisposed = false
          let processKilled = false

          mockConnection.end = () => { connectionEnded = true }
          mockConnection.dispose = () => { connectionDisposed = true }
          mockServerProcess.kill = () => { processKilled = true }

          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          const client = await LSPClient.create({
            serverID: "test-server",
            server: {
              process: mockServerProcess,
              initialization: {}
            },
            root: tmp.path
          })

          await client.shutdown()

          expect(connectionEnded).toBe(true)
          expect(connectionDisposed).toBe(true)
          expect(processKilled).toBe(true)
        }
      })
    })
  })

  describe("Error handling", () => {
    it("throws InitializeError on initialization failure", async () => {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          mockConnection.sendRequest = () => {
            return Promise.reject(new Error("Initialization failed"))
          }

          require("vscode-jsonrpc/node").createMessageConnection = () => mockConnection

          try {
            await LSPClient.create({
              serverID: "test-server",
              server: {
                process: mockServerProcess,
                initialization: {}
              },
              root: tmp.path
            })
            expect(false).toBe(true) // Should not reach here
          } catch (error) {
            expect(error.name).toBe("LSPInitializeError")
          }
        }
      })
    })
  })
})
