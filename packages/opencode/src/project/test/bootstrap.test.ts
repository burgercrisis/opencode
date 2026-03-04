import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { InstanceBootstrap } from "../bootstrap"

describe("Project Bootstrap", () => {
  let originalFlag: any

  beforeEach(() => {
    // Store original flag value
    originalFlag = (global as any).Flag?.OPENCODE_EXPERIMENTAL_NO_BOOTSTRAP
  })

  afterEach(() => {
    // Restore original flag value
    if (originalFlag !== undefined) {
      (global as any).Flag.OPENCODE_EXPERIMENTAL_NO_BOOTSTRAP = originalFlag
    }
  })

  it("should return early when experimental flag is set", async () => {
    // Set the flag to true
    (global as any).Flag = {
      OPENCODE_EXPERIMENTAL_NO_BOOTSTRAP: true
    }

    // Mock all the dependencies to track if they're called
    const mockPlugin = {
      init: () => {
        throw new Error("Plugin.init should not be called")
      }
    }
    const mockShareNext = {
      init: () => {
        throw new Error("ShareNext.init should not be called")
      }
    }
    const mockFormat = {
      init: () => {
        throw new Error("Format.init should not be called")
      }
    }
    const mockLSP = {
      init: () => {
        throw new Error("LSP.init should not be called")
      }
    }
    const mockFileWatcher = {
      init: () => {
        throw new Error("FileWatcher.init should not be called")
      }
    }
    const mockFile = {
      init: () => {
        throw new Error("File.init should not be called")
      }
    }
    const mockVcs = {
      init: () => {
        throw new Error("Vcs.init should not be called")
      }
    }
    const mockSnapshot = {
      init: () => {
        throw new Error("Snapshot.init should not be called")
      }
    }
    const mockTruncate = {
      init: () => {
        throw new Error("Truncate.init should not be called")
      }
    }
    const mockBus = {
      subscribe: () => {
        throw new Error("Bus.subscribe should not be called")
      }
    }
    const mockCommand = {
      Event: {
        Executed: "executed-event"
      },
      Default: {
        INIT: "init-command"
      }
    }
    const mockProject = {
      setInitialized: () => {
        throw new Error("Project.setInitialized should not be called")
      }
    }

    // Mock the modules
    const originalModules = {
      Plugin: (global as any).Plugin,
      ShareNext: (global as any).ShareNext,
      Format: (global as any).Format,
      LSP: (global as any).LSP,
      FileWatcher: (global as any).FileWatcher,
      File: (global as any).File,
      Vcs: (global as any).Vcs,
      Snapshot: (global as any).Snapshot,
      Truncate: (global as any).Truncate,
      Bus: (global as any).Bus,
      Command: (global as any).Command,
      Project: (global as any).Project
    }

      ; (global as any).Plugin = mockPlugin
      ; (global as any).ShareNext = mockShareNext
      ; (global as any).Format = mockFormat
      ; (global as any).LSP = mockLSP
      ; (global as any).FileWatcher = mockFileWatcher
      ; (global as any).File = mockFile
      ; (global as any).Vcs = mockVcs
      ; (global as any).Snapshot = mockSnapshot
      ; (global as any).Truncate = mockTruncate
      ; (global as any).Bus = mockBus
      ; (global as any).Command = mockCommand
      ; (global as any).Project = mockProject

    // This should not throw since it returns early
    await expect(InstanceBootstrap()).resolves.toBeUndefined()

    // Restore original modules
    Object.keys(originalModules).forEach(key => {
      if (originalModules[key as string]) {
        ; (global as any)[key] = originalModules[key as string]
      }
    })
  })

  it("should call all init functions when flag is not set", async () => {
    // Set the flag to false
    (global as any).Flag = {
      OPENCODE_EXPERIMENTAL_NO_BOOTSTRAP: false
    }

    // Track which init functions were called
    const calledInits = []

    const mockPlugin = {
      init: () => {
        calledInits.push("Plugin.init")
        return Promise.resolve()
      }
    }
    const mockShareNext = {
      init: () => {
        calledInits.push("ShareNext.init")
        return Promise.resolve()
      }
    }
    const mockFormat = {
      init: () => {
        calledInits.push("Format.init")
        return Promise.resolve()
      }
    }
    const mockLSP = {
      init: () => {
        calledInits.push("LSP.init")
        return Promise.resolve()
      }
    }
    const mockFileWatcher = {
      init: () => {
        calledInits.push("FileWatcher.init")
        return Promise.resolve()
      }
    }
    const mockFile = {
      init: () => {
        calledInits.push("File.init")
        return Promise.resolve()
      }
    }
    const mockVcs = {
      init: () => {
        calledInits.push("Vcs.init")
        return Promise.resolve()
      }
    }
    const mockSnapshot = {
      init: () => {
        calledInits.push("Snapshot.init")
        return Promise.resolve()
      }
    }
    const mockTruncate = {
      init: () => {
        calledInits.push("Truncate.init")
        return Promise.resolve()
      }
    }

    let busSubscribeCalled = false
    let subscribeEvent: any
    let subscribeHandler: any

    const mockBus = {
      subscribe: (event: any, handler: any) => {
        busSubscribeCalled = true
        subscribeEvent = event
        subscribeHandler = handler
      }
    }

    const mockCommand = {
      Event: {
        Executed: "executed-event"
      },
      Default: {
        INIT: "init-command"
      }
    }

    let projectSetInitializedCalled = false
    let setInitializedProjectId: any

    const mockProject = {
      setInitialized: (projectId: any) => {
        projectSetInitializedCalled = true
        setInitializedProjectId = projectId
        return Promise.resolve()
      }
    }

    const mockInstance = {
      project: { id: "test-project-id" },
      directory: "/test/directory",
      provide: async () => ({}) as any
    }

    // Mock the modules
    const originalModules = {
      Plugin: (global as any).Plugin,
      ShareNext: (global as any).ShareNext,
      Format: (global as any).Format,
      LSP: (global as any).LSP,
      FileWatcher: (global as any).FileWatcher,
      File: (global as any).File,
      Vcs: (global as any).Vcs,
      Snapshot: (global as any).Snapshot,
      Truncate: (global as any).Truncate,
      Bus: (global as any).Bus,
      Command: (global as any).Command,
      Project: (global as any).Project,
      Instance: (global as any).Instance
    }

      ; (global as any).Plugin = mockPlugin
      ; (global as any).ShareNext = mockShareNext
      ; (global as any).Format = mockFormat
      ; (global as any).LSP = mockLSP
      ; (global as any).FileWatcher = mockFileWatcher
      ; (global as any).File = mockFile
      ; (global as any).Vcs = mockVcs
      ; (global as any).Snapshot = mockSnapshot
      ; (global as any).Truncate = mockTruncate
      ; (global as any).Bus = mockBus
      ; (global as any).Command = mockCommand
      ; (global as any).Project = mockProject
      ; (global as any).Instance = mockInstance

    await InstanceBootstrap()

    // Check that all init functions were called in correct order
    expect(calledInits).toEqual([
      "Plugin.init",
      "ShareNext.init",
      "Format.init",
      "LSP.init",
      "FileWatcher.init",
      "File.init",
      "Vcs.init",
      "Snapshot.init",
      "Truncate.init"
    ])

    // Check that bus subscription was set up
    expect(busSubscribeCalled).toBe(true)
    expect(subscribeEvent).toBe("executed-event")

    // Test the event handler
    expect(typeof subscribeHandler).toBe("function")

    // Simulate the event handler being called with INIT command
    await subscribeHandler({
      properties: { name: "init-command" }
    })

    // Check that Project.setInitialized was called
    expect(projectSetInitializedCalled).toBe(true)
    expect(setInitializedProjectId).toBe("test-project-id")

    // Restore original modules
    Object.keys(originalModules).forEach(key => {
      if (originalModules[key as string]) {
        ; (global as any)[key] = originalModules[key as string]
      }
    })
  })

  it("should handle async init functions", async () => {
    (global as any).Flag = {
      OPENCODE_EXPERIMENTAL_NO_BOOTSTRAP: false
    }

    let initOrder = []

    const asyncMockPlugin = {
      init: async () => {
        initOrder.push("Plugin.init start")
        await new Promise(resolve => setTimeout(resolve, 10))
        initOrder.push("Plugin.init end")
      }
    }

    const asyncMockShareNext = {
      init: async () => {
        initOrder.push("ShareNext.init start")
        await new Promise(resolve => setTimeout(resolve, 5))
        initOrder.push("ShareNext.init end")
      }
    }

    // Mock other modules with sync functions
    const mockFormat = { init: () => initOrder.push("Format.init") }
    const mockLSP = { init: () => initOrder.push("LSP.init") }
    const mockFileWatcher = { init: () => initOrder.push("FileWatcher.init") }
    const mockFile = { init: () => initOrder.push("File.init") }
    const mockVcs = { init: () => initOrder.push("Vcs.init") }
    const mockSnapshot = { init: () => initOrder.push("Snapshot.init") }
    const mockTruncate = { init: () => initOrder.push("Truncate.init") }

    const mockBus = { subscribe: () => { } }
    const mockCommand = {
      Event: { Executed: "executed-event" },
      Default: { INIT: "init-command" }
    }
    const mockProject = { setInitialized: () => Promise.resolve() }

    // Mock the modules
    const originalModules = {
      Plugin: (global as any).Plugin,
      ShareNext: (global as any).ShareNext,
      Format: (global as any).Format,
      LSP: (global as any).LSP,
      FileWatcher: (global as any).FileWatcher,
      File: (global as any).File,
      Vcs: (global as any).Vcs,
      Snapshot: (global as any).Snapshot,
      Truncate: (global as any).Truncate,
      Bus: (global as any).Bus,
      Command: (global as any).Command,
      Project: (global as any).Project
    }

      ; (global as any).Plugin = asyncMockPlugin
      ; (global as any).ShareNext = asyncMockShareNext
      ; (global as any).Format = mockFormat
      ; (global as any).LSP = mockLSP
      ; (global as any).FileWatcher = mockFileWatcher
      ; (global as any).File = mockFile
      ; (global as any).Vcs = mockVcs
      ; (global as any).Snapshot = mockSnapshot
      ; (global as any).Truncate = mockTruncate
      ; (global as any).Bus = mockBus
      ; (global as any).Command = mockCommand
      ; (global as any).Project = mockProject

    await InstanceBootstrap()

    // Check that async functions were awaited properly
    expect(initOrder).toEqual([
      "Plugin.init start",
      "Plugin.init end",
      "ShareNext.init start",
      "ShareNext.init end",
      "Format.init",
      "LSP.init",
      "FileWatcher.init",
      "File.init",
      "Vcs.init",
      "Snapshot.init",
      "Truncate.init"
    ])

    // Restore original modules
    Object.keys(originalModules).forEach(key => {
      if (originalModules[key as string]) {
        ; (global as any)[key] = originalModules[key as string]
      }
    })
  })

  it("should log bootstrapping message", async () => {
    (global as any).Flag = {
      OPENCODE_EXPERIMENTAL_NO_BOOTSTRAP: false
    }

    let logMessage = ""
    let logData: any

    const mockLog = {
      info: (message: string, data: any) => {
        logMessage = message
        logData = data
      }
    }

    const mockInstance = {
      directory: "/test/directory",
      provide: async () => ({}) as any
    }

    // Mock modules
    const originalModules = {
      Plugin: (global as any).Plugin,
      ShareNext: (global as any).ShareNext,
      Format: (global as any).Format,
      LSP: (global as any).LSP,
      FileWatcher: (global as any).FileWatcher,
      File: (global as any).File,
      Vcs: (global as any).Vcs,
      Snapshot: (global as any).Snapshot,
      Truncate: (global as any).Truncate,
      Bus: (global as any).Bus,
      Command: (global as any).Command,
      Project: (global as any).Project,
      Instance: (global as any).Instance
    }

    const mockModules = {
      Plugin: { init: () => Promise.resolve() },
      ShareNext: { init: () => Promise.resolve() },
      Format: { init: () => { } },
      LSP: { init: () => Promise.resolve() },
      FileWatcher: { init: () => { } },
      File: { init: () => { } },
      Vcs: { init: () => { } },
      Snapshot: { init: () => { } },
      Truncate: { init: () => { } },
      Bus: { subscribe: () => { } },
      Command: {
        Event: { Executed: "executed-event" },
        Default: { INIT: "init-command" }
      },
      Project: { setInitialized: () => Promise.resolve() }
    }

    Object.keys(mockModules).forEach(key => {
      ; (global as any)[key] = mockModules[key as string]
    })

    // Override Log.Default
    const originalLogDefault = (global as any).Log?.Default
      ; (global as any).Log = { Default: mockLog }
      ; (global as any).Instance = mockInstance

    await InstanceBootstrap()

    expect(logMessage).toBe("bootstrapping")
    expect(logData).toEqual({ directory: "/test/directory" })

    // Restore
    Object.keys(originalModules).forEach(key => {
      if (originalModules[key as string]) {
        ; (global as any)[key] = originalModules[key as string]
      }
    })
    if (originalLogDefault) {
      ; (global as any).Log.Default = originalLogDefault
    }
  })
})
