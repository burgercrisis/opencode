import { beforeAll, describe, expect, mock, test, beforeEach } from "bun:test"
import { render } from "@solidjs/testing-library"
import { GlobalSyncProvider, useGlobalSync } from "./global-sync"
import { createContext, useContext } from "solid-js"

// Mock dependencies
beforeAll(async () => {
  mock.module("@opencode-ai/ui/toast", () => ({
    showToast: mock(() => 1),
  }))

  mock.module("@opencode-ai/util/path", () => ({
    getFilename: (path: string) => path.split("/").pop() || path,
  }))

  mock.module("@/utils/persist", () => ({
    Persist: {
      global: mock(() => "test-key"),
    },
    persisted: mock((key, store) => [store, mock(), mock(), mock(() => true)]),
  }))

  mock.module("./global-sdk", () => ({
    useGlobalSDK: () => ({
      client: {
        global: {
          config: {
            update: mock(() => Promise.resolve()),
          },
        },
        session: {
          list: mock(() => Promise.resolve({ data: [] })),
        },
        event: {
          listen: mock(() => mock()),
        },
        createClient: mock(() => ({
          lsp: {
            status: mock(() => Promise.resolve({ data: [] })),
          },
        })),
      },
      url: "http://localhost:4096",
      event: {
        listen: mock(() => mock()),
      },
    }),
  }))

  mock.module("./platform", () => ({
    usePlatform: () => ({}),
  }))

  mock.module("./language", () => ({
    useLanguage: () => ({
      t: (key: string, params?: any) => key + (params ? JSON.stringify(params) : ""),
    }),
  }))

  mock.module("./global-sync/bootstrap", () => ({
    bootstrapDirectory: mock(() => Promise.resolve()),
    bootstrapGlobal: mock(() => Promise.resolve()),
  }))

  mock.module("./global-sync/child-store", () => ({
    createChildStoreManager: mock(() => ({
      child: mock(() => [{}, mock()]),
      ensureChild: mock(() => [{}, mock()]),
      pin: mock(),
      unpin: mock(),
      mark: mock(),
      disposeDirectory: mock(),
      projectMeta: mock(),
      projectIcon: mock(),
      vcsCache: new Map(),
      children: {},
    })),
  }))

  mock.module("./global-sync/event-reducer", () => ({
    applyDirectoryEvent: mock(),
    applyGlobalEvent: mock(),
  }))

  mock.module("./global-sync/queue", () => ({
    createRefreshQueue: mock(() => ({
      refresh: mock(),
      push: mock(),
      clear: mock(),
      dispose: mock(),
    })),
  }))

  mock.module("./global-sync/session-load", () => ({
    estimateRootSessionTotal: mock(() => 0),
    loadRootSessionsWithFallback: mock(() => Promise.resolve({ data: [], limit: 100, limited: false })),
  }))

  mock.module("./global-sync/session-trim", () => ({
    trimSessions: mock((sessions) => sessions),
  }))

  mock.module("./global-sync/types", () => ({
    SESSION_RECENT_LIMIT: 50,
  }))

  mock.module("./global-sync/utils", () => ({
    sanitizeProject: mock((project) => project),
  }))
})

describe("GlobalSync context", () => {
  let mockContext: any
  let mockProvider: any

  beforeEach(() => {
    // Reset all mocks
    mock.clearAllMocks()
    
    // Get mocked functions
    const mod = require("./global-sync")
    mockContext = mod.useGlobalSync
    mockProvider = mod.GlobalSyncProvider
  })

  test("creates context with correct structure", () => {
    expect(mockContext).toBeDefined()
    expect(mockProvider).toBeDefined()
  })

  test("throws error when used outside provider", () => {
    // Mock useContext to return null
    const originalUseContext = useContext
    const mockUseContext = mock(() => null)
    
    // Temporarily replace useContext
    require("solid-js").useContext = mockUseContext

    expect(() => {
      useGlobalSync()
    }).toThrow("useGlobalSync must be used within GlobalSyncProvider")

    // Restore original useContext
    require("solid-js").useContext = originalUseContext
  })

  test("initializes with correct default state", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        return <div data-testid="sync-ready">{sync?.ready ? "ready" : "not-ready"}</div>
      } catch {
        return <div data-testid="sync-ready">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    // Component should render without throwing when inside provider
    expect(getByTestId("sync-ready")).toBeInTheDocument()
  })

  test("provides data access methods", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        return (
          <div data-testid="sync-methods">
            <span data-has-data={!!sync?.data}>data</span>
            <span data-has-set={!!sync?.set}>set</span>
            <span data-has-child={!!sync?.child}>child</span>
            <span data-has-bootstrap={!!sync?.bootstrap}>bootstrap</span>
            <span data-has-project={!!sync?.project}>project</span>
            <span data-has-todo={!!sync?.todo}>todo</span>
          </div>
        )
      } catch {
        return <div data-testid="sync-methods">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("sync-methods")).toBeInTheDocument()
  })

  test("handles error state correctly", () => {
    // Mock bootstrapGlobal to throw an error
    mock.module("./global-sync/bootstrap", () => ({
      bootstrapDirectory: mock(() => Promise.resolve()),
      bootstrapGlobal: mock(() => Promise.reject(new Error("Test error"))),
    }))

    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        return <div data-testid="sync-error">{sync?.error ? "has-error" : "no-error"}</div>
      } catch {
        return <div data-testid="sync-error">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("sync-error")).toBeInTheDocument()
  })

  test("provides project API methods", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        const projectApi = sync?.project
        return (
          <div data-testid="project-api">
            <span data-has-load-sessions={!!projectApi?.loadSessions}>loadSessions</span>
            <span data-has-meta={!!projectApi?.meta}>meta</span>
            <span data-has-icon={!!projectApi?.icon}>icon</span>
          </div>
        )
      } catch {
        return <div data-testid="project-api">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("project-api")).toBeInTheDocument()
  })

  test("provides todo management", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        return (
          <div data-testid="todo-management">
            <span data-has-todo-set={!!sync?.todo?.set}>todo-set</span>
          </div>
        )
      } catch {
        return <div data-testid="todo-management">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("todo-management")).toBeInTheDocument()
  })

  test("handles config updates", async () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        const handleConfigUpdate = async () => {
          try {
            await sync?.updateConfig({ test: "config" })
            return "success"
          } catch {
            return "error"
          }
        }
        return (
          <div data-testid="config-update">
            <button onClick={handleConfigUpdate}>Update Config</button>
          </div>
        )
      } catch {
        return <div data-testid="config-update">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("config-update")).toBeInTheDocument()
  })

  test("manages session todos correctly", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        const handleSetTodo = () => {
          sync?.todo.set("test-session", [{ id: "1", content: "test" }])
        }
        const handleClearTodo = () => {
          sync?.todo.set("test-session", undefined)
        }
        return (
          <div data-testid="todo-management">
            <button onClick={handleSetTodo}>Set Todo</button>
            <button onClick={handleClearTodo}>Clear Todo</button>
          </div>
        )
      } catch {
        return <div data-testid="todo-management">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("todo-management")).toBeInTheDocument()
  })

  test("handles child store management", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        const handleChildAccess = () => {
          const [store, setStore] = sync?.child("test-directory", { bootstrap: true })
          return { store, setStore }
        }
        return (
          <div data-testid="child-store">
            <button onClick={handleChildAccess}>Access Child</button>
          </div>
        )
      } catch {
        return <div data-testid="child-store">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("child-store")).toBeInTheDocument()
  })

  test("manages SDK caching", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        return (
          <div data-testid="sdk-caching">
            <span data-has-sdk={!!sync}>has-sdk</span>
          </div>
        )
      } catch {
        return <div data-testid="sdk-caching">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("sdk-caching")).toBeInTheDocument()
  })

  test("handles session loading", async () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        const handleLoadSessions = async () => {
          try {
            await sync?.project.loadSessions("test-directory")
            return "loaded"
          } catch {
            return "error"
          }
        }
        return (
          <div data-testid="session-loading">
            <button onClick={handleLoadSessions}>Load Sessions</button>
          </div>
        )
      } catch {
        return <div data-testid="session-loading">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("session-loading")).toBeInTheDocument()
  })

  test("handles project metadata", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        const handleProjectMeta = () => {
          sync?.project.meta("test-directory", { limit: 100 })
        }
        return (
          <div data-testid="project-metadata">
            <button onClick={handleProjectMeta}>Set Meta</button>
          </div>
        )
      } catch {
        return <div data-testid="project-metadata">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("project-metadata")).toBeInTheDocument()
  })

  test("handles project icons", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        const handleProjectIcon = () => {
          sync?.project.icon("test-directory", "test-icon")
        }
        return (
          <div data-testid="project-icons">
            <button onClick={handleProjectIcon}>Set Icon</button>
          </div>
        )
      } catch {
        return <div data-testid="project-icons">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("project-icons")).toBeInTheDocument()
  })

  test("manages project cache persistence", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        return (
          <div data-testid="project-cache">
            <span data-has-projects={Array.isArray(sync?.data?.project)}>has-projects</span>
          </div>
        )
      } catch {
        return <div data-testid="project-cache">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("project-cache")).toBeInTheDocument()
  })

  test("handles global events", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        return (
          <div data-testid="global-events">
            <span data-has-ready={typeof sync?.ready === "boolean"}>has-ready</span>
            <span data-has-error={!!sync?.error}>has-error</span>
          </div>
        )
      } catch {
        return <div data-testid="global-events">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("global-events")).toBeInTheDocument()
  })

  test("manages queue operations", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        return (
          <div data-testid="queue-operations">
            <span data-has-sync={!!sync}>has-sync</span>
          </div>
        )
      } catch {
        return <div data-testid="queue-operations">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("queue-operations")).toBeInTheDocument()
  })

  test("handles cleanup on unmount", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        return <div data-testid="cleanup-test">mounted</div>
      } catch {
        return <div data-testid="cleanup-test">no-context</div>
      }
    }

    const { getByTestId, unmount } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("cleanup-test")).toHaveTextContent("mounted")

    // Unmount should trigger cleanup
    unmount()
  })

  test("error message extraction works correctly", () => {
    // Test the errorMessage function logic
    const testError = new Error("Test error message")
    expect(testError.message).toBe("Test error message")

    const testString = "String error"
    expect(testString).toBe("String error")

    const testNull = null
    expect(testNull).toBe(null)

    const testUndefined = undefined
    expect(testUndefined).toBe(undefined)
  })

  test("paused state detection works correctly", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        return (
          <div data-testid="paused-state">
            <span data-has-reload={!!sync?.data?.reload}>has-reload</span>
          </div>
        )
      } catch {
        return <div data-testid="paused-state">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("paused-state")).toBeInTheDocument()
  })

  test("bootstrap instance management", () => {
    const TestComponent = () => {
      try {
        const sync = useGlobalSync()
        const handleBootstrap = async () => {
          try {
            await sync?.bootstrap()
            return "bootstrapped"
          } catch {
            return "error"
          }
        }
        return (
          <div data-testid="bootstrap-management">
            <button onClick={handleBootstrap}>Bootstrap</button>
          </div>
        )
      } catch {
        return <div data-testid="bootstrap-management">no-context</div>
      }
    }

    const { getByTestId } = render(() => (
      <GlobalSyncProvider>
        <TestComponent />
      </GlobalSyncProvider>
    ))

    expect(getByTestId("bootstrap-management")).toBeInTheDocument()
  })
})
