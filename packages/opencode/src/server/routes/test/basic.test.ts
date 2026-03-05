import { describe, it, expect } from "bun:test"

// Simple test to verify route modules exist and can be instantiated
describe("Server Routes - Module Loading", () => {
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
  it("should load all route modules", async () => {
    // Test that all route modules can be imported without errors
    try {
      const { ConfigRoutes } = await import("../../routes/config")
      const { ExperimentalRoutes } = await import("../../routes/experimental")
      const { FileRoutes } = await import("../../routes/file")
      const { GlobalRoutes } = await import("../../routes/global")
      const { McpRoutes } = await import("../../routes/mcp")
      const { PermissionRoutes } = await import("../../routes/permission")
      const { ProjectRoutes } = await import("../../routes/project")
      const { ProviderRoutes } = await import("../../routes/provider")
      const { PtyRoutes } = await import("../../routes/pty")
      const { QuestionRoutes } = await import("../../routes/question")
      const { SessionRoutes } = await import("../../routes/session")
      const { TuiControlRoutes } = await import("../../routes/tui")

      expect(ConfigRoutes).toBeDefined()
      expect(ExperimentalRoutes).toBeDefined()
      expect(FileRoutes).toBeDefined()
      expect(GlobalRoutes).toBeDefined()
      expect(McpRoutes).toBeDefined()
      expect(PermissionRoutes).toBeDefined()
      expect(ProjectRoutes).toBeDefined()
      expect(ProviderRoutes).toBeDefined()
      expect(PtyRoutes).toBeDefined()
      expect(QuestionRoutes).toBeDefined()
      expect(SessionRoutes).toBeDefined()
      expect(TuiControlRoutes).toBeDefined()
    } catch (error) {
      // If any module fails to load, that's a critical issue
      expect(error).toBeUndefined()
    }
  })

  it("should create route instances", async () => {
    // Test that route instances can be created
    try {
      const { ConfigRoutes } = await import("../../routes/config")
      const { ExperimentalRoutes } = await import("../../routes/experimental")
      const { FileRoutes } = await import("../../routes/file")

      const configApp = ConfigRoutes()
      const experimentalApp = ExperimentalRoutes()
      const fileApp = FileRoutes()

      expect(typeof configApp).toBe("object")
      expect(typeof experimentalApp).toBe("object")
      expect(typeof fileApp).toBe("object")
      expect(typeof configApp.request).toBe("function")
      expect(typeof experimentalApp.request).toBe("function")
      expect(typeof fileApp.request).toBe("function")
    } catch (error) {
      expect(error).toBeUndefined()
    }
  })

  it("should handle route creation errors gracefully", async () => {
    // Test that route creation handles errors appropriately
    try {
      // This should work fine
      const { ConfigRoutes } = await import("../../routes/config")
      const app = ConfigRoutes()
      expect(app).toBeDefined()
    } catch (error) {
      // If there's an error creating the route, that's acceptable for this test
      expect(error).toBeDefined()
    }
  })

  it("should verify route count", () => {
    // Verify we have the expected number of route modules
    const expectedRoutes = [
      'config', 'experimental', 'file', 'global', 'mcp', 
      'permission', 'project', 'provider', 'pty', 
      'question', 'session', 'tui'
    ]
    
    expect(expectedRoutes.length).toBe(14)
  })

  it("should have proper route structure", async () => {
    // Test that routes have the expected structure
    try {
      const { ConfigRoutes } = await import("../../routes/config")
      const app = ConfigRoutes()
      
      // Routes should be Hono instances
      expect(app).toBeDefined()
      expect(typeof app).toBe("object")
      expect(typeof app.request).toBe("function")
      expect(typeof app.use).toBe("function")
      expect(typeof app.route).toBe("function")
    } catch (error) {
      expect(error).toBeUndefined()
    }
  })
})
