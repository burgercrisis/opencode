import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import * as Instance from "../instance"

describe("Instance Module", () => {
  beforeEach(() => {
    // Clear cache before each test
    ;(Instance as any).cache?.clear()
  })

  afterEach(() => {
    // Clean up after each test
    ;(Instance as any).cache?.clear()
  })

  describe("provide function", () => {
    it("should create new instance for new directory", async () => {
      const mockProject = { id: "test-project", sandbox: "/test/sandbox" }
      const mockProjectFromDirectory = () => Promise.resolve({ 
        project: mockProject, 
        sandbox: mockProject.sandbox 
      })

      const originalProjectFromDirectory = (global as any).Project?.fromDirectory
      const originalContextProvide = (global as any).Context?.create?.()?.provide

      let contextProvided = false
      let contextData: any

      ;(global as any).Project = { fromDirectory: mockProjectFromDirectory }
      ;(global as any).Context = {
        create: () => ({
          provide: async (data: any, fn: any) => {
            contextProvided = true
            contextData = data
            return await fn()
          }
        })
      }

      const result = await Instance.provide({
        directory: "/test/dir",
        fn: () => "test-result"
      })

      expect(result).toBe("test-result")
      expect(contextProvided).toBe(true)
      expect(contextData).toEqual({
        directory: "/test/dir",
        worktree: "/test/sandbox",
        project: mockProject
      })

      // Restore
      if (originalProjectFromDirectory) {
        ;(global as any).Project.fromDirectory = originalProjectFromDirectory
      }
      if (originalContextProvide) {
        ;(global as any).Context.create().provide = originalContextProvide
      }
    })

    it("should use cached instance for existing directory", async () => {
      const mockProject = { id: "test-project", sandbox: "/test/sandbox" }
      const mockProjectFromDirectory = () => Promise.resolve({ 
        project: mockProject, 
        sandbox: mockProject.sandbox 
      })

      let callCount = 0
      const wrappedProjectFromDirectory = () => {
        callCount++
        return mockProjectFromDirectory()
      }

      const originalProjectFromDirectory = (global as any).Project?.fromDirectory
      const originalContextProvide = (global as any).Context?.create?.()?.provide

      ;(global as any).Project = { fromDirectory: wrappedProjectFromDirectory }
      ;(global as any).Context = {
        create: () => ({
          provide: async (data: any, fn: any) => await fn()
        })
      }

      // First call should create instance
      await Instance.provide({
        directory: "/test/dir",
        fn: () => "result1"
      })

      // Second call should use cached instance
      await Instance.provide({
        directory: "/test/dir",
        fn: () => "result2"
      })

      expect(callCount).toBe(1) // Should only be called once

      // Restore
      if (originalProjectFromDirectory) {
        ;(global as any).Project.fromDirectory = originalProjectFromDirectory
      }
      if (originalContextProvide) {
        ;(global as any).Context.create().provide = originalContextProvide
      }
    })

    it("should call init function when provided", async () => {
      let initCalled = false
      let initData: any

      const mockProject = { id: "test-project", sandbox: "/test/sandbox" }
      const mockProjectFromDirectory = () => Promise.resolve({ 
        project: mockProject, 
        sandbox: mockProject.sandbox 
      })

      const originalProjectFromDirectory = (global as any).Project?.fromDirectory
      const originalContextProvide = (global as any).Context?.create?.()?.provide

      ;(global as any).Project = { fromDirectory: mockProjectFromDirectory }
      ;(global as any).Context = {
        create: () => ({
          provide: async (data: any, fn: any) => {
            return await fn()
          }
        })
      }

      await Instance.provide({
        directory: "/test/dir",
        init: async () => {
          initCalled = true
          initData = "init-data"
        },
        fn: () => "test-result"
      })

      expect(initCalled).toBe(true)
      expect(initData).toBe("init-data")

      // Restore
      if (originalProjectFromDirectory) {
        ;(global as any).Project.fromDirectory = originalProjectFromDirectory
      }
      if (originalContextProvide) {
        ;(global as any).Context.create().provide = originalContextProvide
      }
    })

    it("should handle init function errors gracefully", async () => {
      const mockProject = { id: "test-project", sandbox: "/test/sandbox" }
      const mockProjectFromDirectory = () => Promise.resolve({ 
        project: mockProject, 
        sandbox: mockProject.sandbox 
      })

      const originalProjectFromDirectory = (global as any).Project?.fromDirectory
      const originalContextProvide = (global as any).Context?.create?.()?.provide

      ;(global as any).Project = { fromDirectory: mockProjectFromDirectory }
      ;(global as any).Context = {
        create: () => ({
          provide: async (data: any, fn: any) => {
            return await fn()
          }
        })
      }

      const result = await Instance.provide({
        directory: "/test/dir",
        init: async () => {
          throw new Error("Init failed")
        },
        fn: () => "test-result"
      })

      expect(result).toBe("test-result")

      // Restore
      if (originalProjectFromDirectory) {
        ;(global as any).Project.fromDirectory = originalProjectFromDirectory
      }
      if (originalContextProvide) {
        ;(global as any).Context.create().provide = originalContextProvide
      }
    })

    it("should log instance creation", async () => {
      let logMessage = ""
      let logData: any

      const mockLog = {
        info: (message: string, data: any) => {
          logMessage = message
          logData = data
        }
      }

      const mockProject = { id: "test-project", sandbox: "/test/sandbox" }
      const mockProjectFromDirectory = () => Promise.resolve({ 
        project: mockProject, 
        sandbox: mockProject.sandbox 
      })

      const originalProjectFromDirectory = (global as any).Project?.fromDirectory
      const originalContextProvide = (global as any).Context?.create?.()?.provide
      const originalLogDefault = (global as any).Log?.Default

      ;(global as any).Project = { fromDirectory: mockProjectFromDirectory }
      ;(global as any).Context = {
        create: () => ({
          provide: async (data: any, fn: any) => await fn()
        })
      }
      ;(global as any).Log = { Default: mockLog }

      await Instance.provide({
        directory: "/test/dir",
        fn: () => "result"
      })

      expect(logMessage).toBe("creating instance")
      expect(logData).toEqual({ directory: "/test/dir" })

      // Restore
      if (originalProjectFromDirectory) {
        ;(global as any).Project.fromDirectory = originalProjectFromDirectory
      }
      if (originalContextProvide) {
        ;(global as any).Context.create().provide = originalContextProvide
      }
      if (originalLogDefault) {
        ;(global as any).Log.Default = originalLogDefault
      }
    })
  })

  describe("directory getter", () => {
    it("should return current directory from context", async () => {
      const mockProject = { id: "test-project", sandbox: "/test/sandbox" }
      const mockProjectFromDirectory = () => Promise.resolve({ 
        project: mockProject, 
        sandbox: mockProject.sandbox 
      })

      const originalProjectFromDirectory = (global as any).Project?.fromDirectory
      const originalContextProvide = (global as any).Context?.create?.()?.provide
      const originalContextUse = (global as any).Context?.create?.()?.use

      let contextData: any

      ;(global as any).Project = { fromDirectory: mockProjectFromDirectory }
      ;(global as any).Context = {
        create: () => ({
          provide: async (data: any, fn: any) => {
            contextData = data
            return await fn()
          },
          use: () => contextData
        })
      }

      // First, set up the context
      await Instance.provide({
        directory: "/test/directory",
        fn: () => {}
      })

      // Now test the directory getter
      const directory = Instance.directory

      expect(directory).toBe("/test/directory")

      // Restore
      if (originalProjectFromDirectory) {
        ;(global as any).Project.fromDirectory = originalProjectFromDirectory
      }
      if (originalContextProvide) {
        ;(global as any).Context.create().provide = originalContextProvide
      }
      if (originalContextUse) {
        ;(global as any).Context.create().use = originalContextUse
      }
    })
  })

  describe("caching behavior", () => {
    it("should cache instances by directory", async () => {
      const mockProject = { id: "test-project", sandbox: "/test/sandbox" }
      const mockProjectFromDirectory = () => Promise.resolve({ 
        project: mockProject, 
        sandbox: mockProject.sandbox 
      })

      let callCount = 0
      const wrappedProjectFromDirectory = () => {
        callCount++
        return mockProjectFromDirectory()
      }

      const originalProjectFromDirectory = (global as any).Project?.fromDirectory
      const originalContextProvide = (global as any).Context?.create?.()?.provide

      ;(global as any).Project = { fromDirectory: wrappedProjectFromDirectory }
      ;(global as any).Context = {
        create: () => ({
          provide: async (data: any, fn: any) => await fn()
        })
      }

      // Multiple calls to same directory
      await Instance.provide({ directory: "/dir1", fn: () => "result1" })
      await Instance.provide({ directory: "/dir1", fn: () => "result2" })
      await Instance.provide({ directory: "/dir2", fn: () => "result3" })
      await Instance.provide({ directory: "/dir2", fn: () => "result4" })

      // Should only call Project.fromDirectory twice (once for each unique directory)
      expect(callCount).toBe(2)

      // Restore
      if (originalProjectFromDirectory) {
        ;(global as any).Project.fromDirectory = originalProjectFromDirectory
      }
      if (originalContextProvide) {
        ;(global as any).Context.create().provide = originalContextProvide
      }
    })

    it("should handle concurrent requests to same directory", async () => {
      const mockProject = { id: "test-project", sandbox: "/test/sandbox" }
      const mockProjectFromDirectory = () => Promise.resolve({ 
        project: mockProject, 
        sandbox: mockProject.sandbox 
      })

      let callCount = 0
      const wrappedProjectFromDirectory = () => {
        callCount++
        return mockProjectFromDirectory()
      }

      const originalProjectFromDirectory = (global as any).Project?.fromDirectory
      const originalContextProvide = (global as any).Context?.create?.()?.provide

      ;(global as any).Project = { fromDirectory: wrappedProjectFromDirectory }
      ;(global as any).Context = {
        create: () => ({
          provide: async (data: any, fn: any) => await fn()
        })
      }

      // Concurrent requests to same directory
      const promises = [
        Instance.provide({ directory: "/concurrent", fn: () => "result1" }),
        Instance.provide({ directory: "/concurrent", fn: () => "result2" }),
        Instance.provide({ directory: "/concurrent", fn: () => "result3" })
      ]

      await Promise.all(promises)

      // Should only call Project.fromDirectory once for concurrent requests
      expect(callCount).toBe(1)

      // Restore
      if (originalProjectFromDirectory) {
        ;(global as any).Project.fromDirectory = originalProjectFromDirectory
      }
      if (originalContextProvide) {
        ;(global as any).Context.create().provide = originalContextProvide
      }
    })
  })
})
