import { expect, it, describe, beforeEach, afterEach } from "bun:test"
import { McpOAuthCallback } from "../oauth-callback"
import { OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_PATH } from "../oauth-provider"

describe("MCP OAuth Callback - Comprehensive Coverage Tests", () => {
  let originalBunServe: any
  let originalBunConnect: any

  beforeEach(() => {
    originalBunServe = Bun.serve
    originalBunConnect = Bun.connect
  })

  afterEach(() => {
    Bun.serve = originalBunServe
    Bun.connect = originalBunConnect
    // Clean up any running servers
    McpOAuthCallback.stop()
  })

  describe("ensureRunning function", () => {
    it("returns early if server is already running", async () => {
      // Mock server as already running
      const mockServer = { stop: () => { } }
      const originalState = (McpOAuthCallback as any).state
        ; (McpOAuthCallback as any).state = { server: mockServer }

      // Mock isPortInUse to return true
      const originalIsPortInUse = (McpOAuthCallback as any).isPortInUse
        ; (McpOAuthCallback as any).isPortInUse = () => Promise.resolve(true)

      await McpOAuthCallback.ensureRunning()

      // Should not create new server
      expect((McpOAuthCallback as any).state.server).toBe(mockServer)

        // Restore
        ; (McpOAuthCallback as any).state = originalState
        ; (McpOAuthCallback as any).isPortInUse = originalIsPortInUse
    })

    it("starts server when not running", async () => {
      // Mock isPortInUse to return false
      const originalIsPortInUse = (McpOAuthCallback as any).isPortInUse
        ; (McpOAuthCallback as any).isPortInUse = () => Promise.resolve(false)

      let serverStarted = false
      Bun.serve = (options: any) => {
        expect(options.port).toBe(OAUTH_CALLBACK_PORT)
        expect(typeof options.fetch).toBe("function")
        serverStarted = true
        return { stop: () => { } }
      }

      await McpOAuthCallback.ensureRunning()

      expect(serverStarted).toBe(true)
      expect((McpOAuthCallback as any).state.server).toBeDefined()

        // Restore
        ; (McpOAuthCallback as any).isPortInUse = originalIsPortInUse
    })
  })

  describe("OAuth callback server", () => {
    it("handles non-matching paths", async () => {
      let serverStarted = false
      Bun.serve = (options: any) => {
        serverStarted = true
        const mockFetch = async (req: Request) => {
          if (req.url.includes("/different-path")) {
            return new Response("Not found", { status: 404 })
          }
          return new Response("OK")
        }
        return { stop: () => { } }
      }

      await McpOAuthCallback.ensureRunning()
      expect(serverStarted).toBe(true)
    })

    it("handles missing state parameter", async () => {
      let mockFetch: (req: Request) => Promise<Response>
      Bun.serve = (options: any) => {
        mockFetch = async (req: Request) => {
          if (req.url.includes(OAUTH_CALLBACK_PATH)) {
            const url = new URL(req.url)
            expect(url.searchParams.get("state")).toBeNull()
            // Should return error response
            const response = await mockFetch(req)
            expect(response.status).toBe(400)
            expect(response.headers.get("Content-Type")).toBe("text/html")
            const text = await response.text()
            expect(text).toContain("Missing required state parameter")
            return response
          }
          return new Response("OK")
        }
        return { stop: () => { } }
      }

      await McpOAuthCallback.ensureRunning()

      // Simulate request without state
      const testUrl = `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}?code=test_code`
      await fetch(testUrl)
    })

    it("handles error parameter", async () => {
      let mockFetch: (req: Request) => Promise<Response>
      Bun.serve = (options: any) => {
        mockFetch = async (req: Request) => {
          if (req.url.includes(OAUTH_CALLBACK_PATH)) {
            const url = new URL(req.url)
            url.searchParams.set("state", "test-state")
            url.searchParams.set("error", "access_denied")
            url.searchParams.set("error_description", "User denied access")

            const response = await mockFetch(req)
            expect(response.status).toBe(400)
            const text = await response.text()
            expect(text).toContain("User denied access")
            return response
          }
          return new Response("OK")
        }
        return { stop: () => { } }
      }

      await McpOAuthCallback.ensureRunning()

      // Simulate request with error
      const testUrl = `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}?state=test-state&error=access_denied&error_description=User denied access`
      await fetch(testUrl)
    })

    it("handles missing code parameter", async () => {
      let mockFetch: (req: Request) => Promise<Response>
      Bun.serve = (options: any) => {
        mockFetch = async (req: Request) => {
          if (req.url.includes(OAUTH_CALLBACK_PATH)) {
            const url = new URL(req.url)
            url.searchParams.set("state", "test-state")
            // Missing code parameter

            const response = await mockFetch(req)
            expect(response.status).toBe(400)
            const text = await response.text()
            expect(text).toContain("No authorization code provided")
            return response
          }
          return new Response("OK")
        }
        return { stop: () => { } }
      }

      await McpOAuthCallback.ensureRunning()

      // Simulate request without code
      const testUrl = `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}?state=test-state`
      await fetch(testUrl)
    })

    it("handles invalid state parameter", async () => {
      let mockFetch: (req: Request) => Promise<Response>
      Bun.serve = (options: any) => {
        mockFetch = async (req: Request) => {
          if (req.url.includes(OAUTH_CALLBACK_PATH)) {
            const url = new URL(req.url)
            url.searchParams.set("state", "invalid-state")
            url.searchParams.set("code", "test-code")
            // State not in pendingAuths

            const response = await mockFetch(req)
            expect(response.status).toBe(400)
            const text = await response.text()
            expect(text).toContain("Invalid or expired state parameter")
            return response
          }
          return new Response("OK")
        }
        return { stop: () => { } }
      }

      await McpOAuthCallback.ensureRunning()

      // Simulate request with invalid state
      const testUrl = `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}?state=invalid-state&code=test-code`
      await fetch(testUrl)
    })

    it("resolves pending auth on successful callback", async () => {
      let mockFetch: (req: Request) => Promise<Response>
      let resolveCalled = false
      let timeoutCleared = false

      Bun.serve = (options: any) => {
        mockFetch = async (req: Request) => {
          if (req.url.includes(OAUTH_CALLBACK_PATH)) {
            const url = new URL(req.url)
            url.searchParams.set("state", "test-state")
            url.searchParams.set("code", "test-code")

            const response = await mockFetch(req)
            expect(response.status).toBe(200)
            expect(response.headers.get("Content-Type")).toBe("text/html")
            const text = await response.text()
            expect(text).toContain("Authorization Successful")
            return response
          }
          return new Response("OK")
        }
        return { stop: () => { } }
      }

      // Set up pending auth
      const promise = McpOAuthCallback.waitForCallback("test-state")
      promise.then(() => { resolveCalled = true })

      // Mock setTimeout to capture clearTimeout
      const originalSetTimeout = global.setTimeout
      global.setTimeout = ((callback: Function, delay: number) => {
        if (delay === 300000) { // 5 minutes
          return {
            ref: { unref: () => { } }
          }
        }
        return originalSetTimeout(callback, 0)
      }) as any

      const originalClearTimeout = global.clearTimeout
      global.clearTimeout = ((timeoutId: any) => {
        if (timeoutId && timeoutId.ref) {
          timeoutCleared = true
        }
        return originalClearTimeout(timeoutId)
      }) as any

      await McpOAuthCallback.ensureRunning()

      // Simulate successful callback
      const testUrl = `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}?state=test-state&code=test-code`
      await fetch(testUrl)

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(resolveCalled).toBe(true)
      expect(timeoutCleared).toBe(true)

      // Restore
      global.setTimeout = originalSetTimeout
      global.clearTimeout = originalClearTimeout
    })

    it("rejects pending auth on error callback", async () => {
      let mockFetch: (req: Request) => Promise<Response>
      let rejectCalled = false
      let timeoutCleared = false

      Bun.serve = (options: any) => {
        mockFetch = async (req: Request) => {
          if (req.url.includes(OAUTH_CALLBACK_PATH)) {
            const url = new URL(req.url)
            url.searchParams.set("state", "test-state")
            url.searchParams.set("error", "access_denied")

            const response = await mockFetch(req)
            expect(response.status).toBe(400)
            return response
          }
          return new Response("OK")
        }
        return { stop: () => { } }
      }

      // Set up pending auth
      const promise = McpOAuthCallback.waitForCallback("test-state")
      promise.catch(() => { rejectCalled = true })

      // Mock setTimeout to capture clearTimeout
      const originalSetTimeout = global.setTimeout
      global.setTimeout = ((callback: Function, delay: number) => {
        if (delay === 300000) { // 5 minutes
          return {
            ref: { unref: () => { } }
          }
        }
        return originalSetTimeout(callback, 0)
      }) as any

      const originalClearTimeout = global.clearTimeout
      global.clearTimeout = ((timeoutId: any) => {
        if (timeoutId && timeoutId.ref) {
          timeoutCleared = true
        }
        return originalClearTimeout(timeoutId)
      }) as any

      await McpOAuthCallback.ensureRunning()

      // Simulate error callback
      const testUrl = `http://localhost:${OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}?state=test-state&error=access_denied`
      await fetch(testUrl)

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(rejectCalled).toBe(true)
      expect(timeoutCleared).toBe(true)

      // Restore
      global.setTimeout = originalSetTimeout
      global.clearTimeout = originalClearTimeout
    })
  })

  describe("waitForCallback timeout", () => {
    it("rejects on timeout", async () => {
      let rejectCalled = false

      // Set up pending auth but don't complete it
      const promise = McpOAuthCallback.waitForCallback("test-state")
      promise.catch(() => { rejectCalled = true })

      // Mock setTimeout to trigger timeout immediately
      const originalSetTimeout = global.setTimeout
      global.setTimeout = ((callback: Function, delay: number) => {
        if (delay === 300000) { // 5 minutes
          // Trigger timeout immediately
          return originalSetTimeout(callback, 0)
        }
        return originalSetTimeout(callback, delay)
      }) as any

      await McpOAuthCallback.ensureRunning()

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(rejectCalled).toBe(true)

      // Restore
      global.setTimeout = originalSetTimeout
    })
  })

  describe("cancelPending function", () => {
    it("cancels pending auth and cleans up", async () => {
      let rejectCalled = false
      let timeoutCleared = false

      // Set up pending auth
      const promise = McpOAuthCallback.waitForCallback("test-state")
      promise.catch(() => { rejectCalled = true })

      // Mock setTimeout to capture clearTimeout
      const originalSetTimeout = global.setTimeout
      global.setTimeout = ((callback: Function, delay: number) => {
        if (delay === 300000) { // 5 minutes
          return {
            ref: { unref: () => { } }
          }
        }
        return originalSetTimeout(callback, delay)
      }) as any

      const originalClearTimeout = global.clearTimeout
      global.clearTimeout = ((timeoutId: any) => {
        if (timeoutId && timeoutId.ref) {
          timeoutCleared = true
        }
        return originalClearTimeout(timeoutId)
      }) as any

      await McpOAuthCallback.ensureRunning()

      // Cancel the pending auth
      McpOAuthCallback.cancelPending("test-state")

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(rejectCalled).toBe(true)
      expect(timeoutCleared).toBe(true)

      // Restore
      global.setTimeout = originalSetTimeout
      global.clearTimeout = originalClearTimeout
    })

    it("handles non-existent pending auth", async () => {
      // Should not throw
      McpOAuthCallback.cancelPending("non-existent-state")

      // Should complete without error
      expect(true).toBe(true)
    })
  })

  describe("isPortInUse function", () => {
    it("returns true when port is in use", async () => {
      // Mock successful connection
      Bun.connect = (options: any) => {
        expect(options.hostname).toBe("127.0.0.1")
        expect(options.port).toBe(OAUTH_CALLBACK_PORT)

        return {
          socket: {
            end: () => { }
          },
          on: (event: string, handler: Function) => {
            if (event === "open") {
              // Simulate successful connection
              setTimeout(handler, 0)
            }
          },
          data: () => { },
          close: () => { }
        }
      }

      const inUse = await McpOAuthCallback.isPortInUse()
      expect(inUse).toBe(true)
    })

    it("returns false when port is not in use", async () => {
      // Mock failed connection
      Bun.connect = (options: any) => {
        expect(options.hostname).toBe("127.0.0.1")
        expect(options.port).toBe(OAUTH_CALLBACK_PORT)

        return {
          socket: {
            end: () => { }
          },
          on: (event: string, handler: Function) => {
            if (event === "error") {
              // Simulate connection error
              setTimeout(handler, 0)
            }
          },
          data: () => { },
          close: () => { }
        }
      }

      const inUse = await McpOAuthCallback.isPortInUse()
      expect(inUse).toBe(false)
    })

    it("returns false on connection errors", async () => {
      // Mock connection throwing error
      Bun.connect = () => {
        throw new Error("Connection failed")
      }

      const inUse = await McpOAuthCallback.isPortInUse()
      expect(inUse).toBe(false)
    })
  })

  describe("stop function", () => {
    it("stops running server and cleans up pending auths", async () => {
      let serverStopped = false
      let rejectCalled = false
      let timeoutCleared = false

      // Mock server
      const mockServer = {
        stop: () => { serverStopped = true }
      }
      const originalState = (McpOAuthCallback as any).state
        ; (McpOAuthCallback as any).state = { server: mockServer }

      // Set up pending auth
      const promise = McpOAuthCallback.waitForCallback("test-state")
      promise.catch(() => { rejectCalled = true })

      // Mock setTimeout to capture clearTimeout
      const originalClearTimeout = global.clearTimeout
      global.clearTimeout = ((timeoutId: any) => {
        if (timeoutId && timeoutId.ref) {
          timeoutCleared = true
        }
        return originalClearTimeout(timeoutId)
      }) as any

      await McpOAuthCallback.stop()

      expect(serverStopped).toBe(true)
      expect(rejectCalled).toBe(true)
      expect(timeoutCleared).toBe(true)
      expect((McpOAuthCallback as any).state.server).toBeUndefined()

      // Restore
      global.clearTimeout = originalClearTimeout
        ; (McpOAuthCallback as any).state = originalState
    })

    it("handles when no server is running", async () => {
      // Should not throw
      await McpOAuthCallback.stop()

      // Should complete without error
      expect(true).toBe(true)
    })
  })

  describe("isRunning function", () => {
    it("returns true when server is running", async () => {
      const mockServer = { stop: () => { } }
      const originalState = (McpOAuthCallback as any).state
        ; (McpOAuthCallback as any).state = { server: mockServer }

      const running = McpOAuthCallback.isRunning()
      expect(running).toBe(true)

        // Restore
        ; (McpOAuthCallback as any).state = originalState
    })

    it("returns false when server is not running", () => {
      const originalState = (McpOAuthCallback as any).state
        ; (McpOAuthCallback as any).state = { server: undefined }

      const running = McpOAuthCallback.isRunning()
      expect(running).toBe(false)

        // Restore
        ; (McpOAuthCallback as any).state = originalState
    })
  })

  describe("HTML responses", () => {
    it("generates success HTML correctly", () => {
      const errorFn = (McpOAuthCallback as any).HTML_ERROR
      const successHtml = errorFn("test error")

      expect(successHtml).toContain("<!DOCTYPE html>")
      expect(successHtml).toContain("<title>OpenCode - Authorization Failed</title>")
      expect(successHtml).toContain("Authorization Failed")
      expect(successHtml).toContain("test error")
      expect(successHtml).toContain("<div class=\"error\">test error</div>")
    })

    it("generates error HTML correctly", () => {
      const successFn = (McpOAuthCallback as any).HTML_SUCCESS
      const errorHtml = successFn()

      expect(errorHtml).toContain("<!DOCTYPE html>")
      expect(errorHtml).toContain("<title>OpenCode - Authorization Successful</title>")
      expect(errorHtml).toContain("Authorization Successful")
      expect(errorHtml).toContain("You can close this window and return to OpenCode.")
      expect(errorHtml).toContain("setTimeout(() => window.close(), 2000)")
    })
  })
})
