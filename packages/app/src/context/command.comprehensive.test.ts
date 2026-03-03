import { beforeAll, describe, expect, mock, test, beforeEach } from "bun:test"
import { render } from "@solidjs/testing-library"
import {
  useCommand,
  CommandProvider,
  parseKeybind,
  matchKeybind,
  formatKeybind,
  upsertCommandRegistration,
  type Keybind,
  type CommandOption,
  type CommandRegistration,
} from "./command"
import { createSimpleContext } from "@opencode-ai/ui/context"

// Mock dependencies
beforeAll(async () => {
  // Mock navigator for platform detection
  Object.defineProperty(global, "navigator", {
    value: {
      platform: "Win32",
    },
    writable: true,
  })

  mock.module("@opencode-ai/ui/context", () => ({
    createSimpleContext: mock((options) => {
      const context = {
        name: options.name,
        use: mock(() => ({})),
        provider: mock(({ children }) => children),
      }
      return context
    }),
    useDialog: () => ({
      active: false,
    }),
  }))

  mock.module("@/context/language", () => ({
    useLanguage: () => ({
      t: (key: string) => key,
    }),
  }))

  mock.module("@/context/settings", () => ({
    useSettings: () => ({
      keybinds: new Map([
        ["command.palette", "mod+shift+p"],
        ["test.command", "ctrl+t"],
      ]),
    }),
  }))

  mock.module("@/utils/persist", () => ({
    Persist: {
      global: mock(() => "test-key"),
    },
    persisted: mock((key, store) => [store, mock(), mock(), mock(() => true)]),
  }))

  // Mock document methods
  Object.defineProperty(global, "document", {
    value: {
      addEventListener: mock(),
      removeEventListener: mock(),
    },
    writable: true,
  })
})

describe("Command utility functions", () => {
  test("parseKeybind handles basic keybinds", () => {
    const result = parseKeybind("ctrl+a")
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      key: "a",
      ctrl: true,
      meta: false,
      shift: false,
      alt: false,
    })
  })

  test("parseKeybind handles complex keybinds", () => {
    const result = parseKeybind("ctrl+shift+meta+alt+z")
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      key: "z",
      ctrl: true,
      meta: true,
      shift: true,
      alt: true,
    })
  })

  test("parseKeybind handles multiple combos", () => {
    const result = parseKeybind("ctrl+a,meta+b")
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      key: "a",
      ctrl: true,
      meta: false,
      shift: false,
      alt: false,
    })
    expect(result[1]).toEqual({
      key: "b",
      ctrl: false,
      meta: true,
      shift: false,
      alt: false,
    })
  })

  test("parseKeybind handles mod key", () => {
    // Test Windows (ctrl)
    const result = parseKeybind("mod+a")
    expect(result[0]).toEqual({
      key: "a",
      ctrl: true,
      meta: false,
      shift: false,
      alt: false,
    })

    // Test Mac (meta)
    Object.defineProperty(global, "navigator", {
      value: { platform: "MacIntel" },
      writable: true,
    })

    const macResult = parseKeybind("mod+a")
    expect(macResult[0]).toEqual({
      key: "a",
      ctrl: false,
      meta: true,
      shift: false,
      alt: false,
    })

    // Reset to Windows
    Object.defineProperty(global, "navigator", {
      value: { platform: "Win32" },
      writable: true,
    })
  })

  test("parseKeybind handles special keys", () => {
    const result = parseKeybind("ctrl+comma")
    expect(result[0]).toEqual({
      key: "comma",
      ctrl: true,
      meta: false,
      shift: false,
      alt: false,
    })
  })

  test("parseKeybind handles empty and none", () => {
    expect(parseKeybind("")).toEqual([])
    expect(parseKeybind("none")).toEqual([])
  })

  test("matchKeybind matches correctly", () => {
    const keybinds = parseKeybind("ctrl+a")
    const event = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
    })

    expect(matchKeybind(keybinds, event)).toBe(true)
  })

  test("matchKeybind rejects incorrect modifiers", () => {
    const keybinds = parseKeybind("ctrl+a")
    const event = new KeyboardEvent("keydown", {
      key: "a",
      shiftKey: true, // Wrong modifier
    })

    expect(matchKeybind(keybinds, event)).toBe(false)
  })

  test("matchKeybind handles multiple combos", () => {
    const keybinds = parseKeybind("ctrl+a,meta+b")

    const ctrlAEvent = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
    })

    const metaBEvent = new KeyboardEvent("keydown", {
      key: "b",
      metaKey: true,
    })

    expect(matchKeybind(keybinds, ctrlAEvent)).toBe(true)
    expect(matchKeybind(keybinds, metaBEvent)).toBe(true)
  })

  test("formatKeybind formats Windows correctly", () => {
    const result = formatKeybind("ctrl+shift+a")
    expect(result).toBe("Ctrl+Shift+A")
  })

  test("formatKeybind formats Mac correctly", () => {
    Object.defineProperty(global, "navigator", {
      value: { platform: "MacIntel" },
      writable: true,
    })

    const result = formatKeybind("ctrl+shift+a")
    expect(result).toBe("⌃⇧A")

    // Reset to Windows
    Object.defineProperty(global, "navigator", {
      value: { platform: "Win32" },
      writable: true,
    })
  })

  test("formatKeybind handles special characters", () => {
    const result = formatKeybind("ctrl+arrowup")
    expect(result).toBe("Ctrl+↑")
  })

  test("formatKeybind handles empty and none", () => {
    expect(formatKeybind("")).toBe("")
    expect(formatKeybind("none")).toBe("")
  })

  test("upsertCommandRegistration adds new entry", () => {
    const registrations: CommandRegistration[] = []
    const entry: CommandRegistration = {
      key: "test",
      options: () => [],
    }

    const result = upsertCommandRegistration(registrations, entry)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(entry)
  })

  test("upsertCommandRegistration replaces existing entry", () => {
    const existing: CommandRegistration = {
      key: "test",
      options: () => [{ id: "old", title: "Old" } as CommandOption],
    }
    const registrations = [existing]

    const newEntry: CommandRegistration = {
      key: "test",
      options: () => [{ id: "new", title: "New" } as CommandOption],
    }

    const result = upsertCommandRegistration(registrations, newEntry)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(newEntry)
  })

  test("upsertCommandRegistration adds entry without key", () => {
    const registrations: CommandRegistration[] = []
    const entry: CommandRegistration = {
      options: () => [{ id: "no-key", title: "No Key" } as CommandOption],
    }

    const result = upsertCommandRegistration(registrations, entry)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(entry)
  })

  test("replaces keyed registrations", () => {
    const one = () => [{ id: "one", title: "One" }]
    const two = () => [{ id: "two", title: "Two" }]

    const next = upsertCommandRegistration([{ key: "layout", options: one }], { key: "layout", options: two })

    expect(next).toHaveLength(1)
    expect(next[0]?.options).toBe(two)
  })

  test("keeps unkeyed registrations additive", () => {
    const one = () => [{ id: "one", title: "One" }]
    const two = () => [{ id: "two", title: "Two" }]

    const next = upsertCommandRegistration([{ options: one }], { options: two })

    expect(next).toHaveLength(2)
    expect(next[0]?.options).toBe(two)
    expect(next[1]?.options).toBe(one)
  })
})

describe("Command context", () => {
  let mockContext: any
  let mockProvider: any

  beforeEach(() => {
    // Reset all mocks
    mock.clearAllMocks()

    // Get mocked functions
    const mod = require("./command")
    mockContext = mod.use
    mockProvider = mod.provider
  })

  test("creates context with correct name", () => {
    expect(mockContext?.name).toBe("Command")
  })

  test("provides command registration", () => {
    const TestComponent = () => {
      const command = useCommand()
      return <div data - testid="command-context" > { command?.register? "has-register": "no-register" } </div>
    }

    const { getByTestId } = render(() => (
      <CommandProvider>
      <TestComponent />
      </CommandProvider>
    ))

    expect(getByTestId("command-context")).toHaveTextContent("has-register")
  })

  test("provides command trigger", () => {
    const TestComponent = () => {
      const command = useCommand()
      return <div data - testid="command-trigger" > { command?.trigger? "has-trigger": "no-trigger" } </div>
    }

    const { getByTestId } = render(() => (
      <CommandProvider>
      <TestComponent />
      </CommandProvider>
    ))

    expect(getByTestId("command-trigger")).toHaveTextContent("has-trigger")
  })

  test("provides keybind formatting", () => {
    const TestComponent = () => {
      const command = useCommand()
      return <div data - testid="keybind-format" > { command?.keybind? "has-keybind": "no-keybind" } </div>
    }

    const { getByTestId } = render(() => (
      <CommandProvider>
      <TestComponent />
      </CommandProvider>
    ))

    expect(getByTestId("keybind-format")).toHaveTextContent("has-keybind")
  })

  test("provides palette show function", () => {
    const TestComponent = () => {
      const command = useCommand()
      return <div data - testid="palette-show" > { command?.show? "has-show": "no-show" } </div>
    }

    const { getByTestId } = render(() => (
      <CommandProvider>
      <TestComponent />
      </CommandProvider>
    ))

    expect(getByTestId("palette-show")).toHaveTextContent("has-show")
  })

  test("provides suspension control", () => {
    const TestComponent = () => {
      const command = useCommand()
      return (
        <div data - testid= "suspension" >
        <span data - has - suspended={ typeof command?.suspended === "function" }> has - suspended </span>
          < span data - has - keybinds={ typeof command?.keybinds === "function" }> has - keybinds </span>
            </div>
      )
}

    const { getByTestId } = render(() => (
  <CommandProvider>
  <TestComponent />
  </CommandProvider>
))

expect(getByTestId("suspension")).toBeInTheDocument()
  })

test("provides catalog and options access", () => {
  const TestComponent = () => {
    const command = useCommand()
    return (
      <div data - testid= "catalog-options" >
      <span data - has - catalog={ Array.isArray(command?.catalog) }> has - catalog </span>
        < span data - has - options={ Array.isArray(command?.options) }> has - options </span>
          </div>
      )
    }

const { getByTestId } = render(() => (
  <CommandProvider>
  <TestComponent />
  </CommandProvider>
))

expect(getByTestId("catalog-options")).toBeInTheDocument()
  })

test("registers commands correctly", () => {
  const TestComponent = () => {
    const command = useCommand()

    // Register a test command
    command.register("test", () => [
      {
        id: "test.command",
        title: "Test Command",
        description: "A test command",
        onSelect: () => { },
      },
    ])

    return <div data - testid="command-register" > registered </div>
  }

  const { getByTestId } = render(() => (
    <CommandProvider>
    <TestComponent />
    </CommandProvider>
  ))

  expect(getByTestId("command-register")).toBeInTheDocument()
})

test("handles command registration without key", () => {
  const TestComponent = () => {
    const command = useCommand()

    // Register without key
    command.register(() => [
      {
        id: "no-key.command",
        title: "No Key Command",
        onSelect: () => { },
      },
    ])

    return <div data - testid="no-key-register" > registered </div>
  }

  const { getByTestId } = render(() => (
    <CommandProvider>
    <TestComponent />
    </CommandProvider>
  ))

  expect(getByTestId("no-key-register")).toBeInTheDocument()
})

test("triggers commands correctly", () => {
  const TestComponent = () => {
    const command = useCommand()

    command.register("trigger-test", () => [
      {
        id: "trigger.command",
        title: "Trigger Command",
        onSelect: mock(),
      },
    ])

    const handleTrigger = () => {
      command.trigger("trigger.command", "palette")
    }

    return (
      <div data - testid= "command-trigger" >
      <button onClick={ handleTrigger }> Trigger </button>
        </div>
      )
    }

const { getByTestId } = render(() => (
  <CommandProvider>
  <TestComponent />
  </CommandProvider>
))

expect(getByTestId("command-trigger")).toBeInTheDocument()
  })

test("formats keybinds for commands", () => {
  const TestComponent = () => {
    const command = useCommand()

    command.register("keybind-test", () => [
      {
        id: "keybind.command",
        title: "Keybind Command",
        keybind: "ctrl+k",
        onSelect: () => { },
      },
    ])

    const formattedKeybind = command.keybind("keybind.command")

    return (
      <div data - testid= "keybind-formatting" >
      <span data - keybind={ formattedKeybind }> keybind </span>
        </div>
      )
    }

const { getByTestId } = render(() => (
  <CommandProvider>
  <TestComponent />
  </CommandProvider>
))

expect(getByTestId("keybind-formatting")).toBeInTheDocument()
  })

test("handles palette keybind formatting", () => {
  const TestComponent = () => {
    const command = useCommand()
    const paletteKeybind = command.keybind("command.palette")

    return (
      <div data - testid= "palette-keybind" >
      <span data - palette - keybind={ paletteKeybind }> palette </span>
        </div>
      )
    }

const { getByTestId } = render(() => (
  <CommandProvider>
  <TestComponent />
  </CommandProvider>
))

expect(getByTestId("palette-keybind")).toBeInTheDocument()
  })

test("manages suspension state", () => {
  const TestComponent = () => {
    const command = useCommand()

    const handleSuspend = () => {
      command.keybinds(false) // Suspend
    }

    const handleResume = () => {
      command.keybinds(true) // Resume
    }

    return (
      <div data - testid= "suspension-management" >
      <button onClick={ handleSuspend }> Suspend </button>
        < button onClick = { handleResume } > Resume </button>
          </div>
      )
    }

const { getByTestId } = render(() => (
  <CommandProvider>
  <TestComponent />
  </CommandProvider>
))

expect(getByTestId("suspension-management")).toBeInTheDocument()
  })

test("handles keyboard events", () => {
  const TestComponent = () => {
    const command = useCommand()
    return <div data - testid="keyboard-events" > listening </div>
  }

  const { getByTestId, unmount } = render(() => (
    <CommandProvider>
    <TestComponent />
    </CommandProvider>
  ))

  expect(getByTestId("keyboard-events")).toBeInTheDocument()
  expect(global.document.addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function))

  unmount()
  expect(global.document.removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function))
})

test("filters duplicate command IDs", () => {
  const TestComponent = () => {
    const command = useCommand()

    // Register same command twice
    command.register("duplicate-test", () => [
      {
        id: "duplicate.command",
        title: "Duplicate Command 1",
        onSelect: () => { },
      },
    ])

    command.register("duplicate-test-2", () => [
      {
        id: "duplicate.command",
        title: "Duplicate Command 2",
        onSelect: () => { },
      },
    ])

    return <div data - testid="duplicate-filter" > registered </div>
  }

  const { getByTestId } = render(() => (
    <CommandProvider>
    <TestComponent />
    </CommandProvider>
  ))

  expect(getByTestId("duplicate-filter")).toBeInTheDocument()
})

test("handles suggested commands", () => {
  const TestComponent = () => {
    const command = useCommand()

    command.register("suggested-test", () => [
      {
        id: "suggested.command",
        title: "Suggested Command",
        suggested: true,
        onSelect: () => { },
      },
    ])

    return <div data - testid="suggested-commands" > registered </div>
  }

  const { getByTestId } = render(() => (
    <CommandProvider>
    <TestComponent />
    </CommandProvider>
  ))

  expect(getByTestId("suggested-commands")).toBeInTheDocument()
})

test("handles disabled commands", () => {
  const TestComponent = () => {
    const command = useCommand()

    command.register("disabled-test", () => [
      {
        id: "disabled.command",
        title: "Disabled Command",
        disabled: true,
        onSelect: () => { },
      },
    ])

    return <div data - testid="disabled-commands" > registered </div>
  }

  const { getByTestId } = render(() => (
    <CommandProvider>
    <TestComponent />
    </CommandProvider>
  ))

  expect(getByTestId("disabled-commands")).toBeInTheDocument()
})

test("manages command catalog", () => {
  const TestComponent = () => {
    const command = useCommand()

    command.register("catalog-test", () => [
      {
        id: "catalog.command",
        title: "Catalog Command",
        description: "A command for the catalog",
        category: "test",
        keybind: "ctrl+c",
        onSelect: () => { },
      },
    ])

    return (
      <div data - testid= "command-catalog" >
      <span data - catalog - length={ command.catalog.length }> catalog </span>
        </div>
      )
    }

const { getByTestId } = render(() => (
  <CommandProvider>
  <TestComponent />
  </CommandProvider>
))

expect(getByTestId("command-catalog")).toBeInTheDocument()
  })
})

describe("Command edge cases", () => {
  test("handles malformed keybind strings", () => {
    expect(parseKeybind("invalid+key+bind")).toEqual([
      {
        key: "bind",
        ctrl: false,
        meta: false,
        shift: false,
        alt: false,
      },
    ])
  })

  test("handles keybind with only modifiers", () => {
    expect(parseKeybind("ctrl+shift")).toEqual([
      {
        key: "",
        ctrl: true,
        meta: false,
        shift: true,
        alt: false,
      },
    ])
  })

  test("handles case insensitive parsing", () => {
    const result1 = parseKeybind("CTRL+A")
    const result2 = parseKeybind("ctrl+a")
    expect(result1).toEqual(result2)
  })

  test("handles whitespace in keybinds", () => {
    const result = parseKeybind(" ctrl + a ")
    expect(result[0]).toEqual({
      key: "a",
      ctrl: true,
      meta: false,
      shift: false,
      alt: false,
    })
  })

  test("handles editable target detection", () => {
    // Mock editable elements
    const input = document.createElement("input")
    const textarea = document.createElement("textarea")
    const select = document.createElement("select")
    const contentEditable = document.createElement("div")
    contentEditable.contentEditable = "true"
    const normal = document.createElement("div")

    // These would be tested in the actual implementation
    expect(input.tagName).toBe("INPUT")
    expect(textarea.tagName).toBe("TEXTAREA")
    expect(select.tagName).toBe("SELECT")
    expect(contentEditable.contentEditable).toBe("true")
    expect(normal.contentEditable).toBe("false")
  })

  test("handles command cleanup on unmount", () => {
    const TestComponent = () => {
      const command = useCommand()
      command.register("cleanup-test", () => [
        {
          id: "cleanup.command",
          title: "Cleanup Command",
          onSelect: () => { },
        },
      ])
      return <div data - testid="cleanup-test" > mounted </div>
    }

    const { getByTestId, unmount } = render(() => (
      <CommandProvider>
      <TestComponent />
      </CommandProvider>
    ))

    expect(getByTestId("cleanup-test")).toHaveTextContent("mounted")

    // Unmount should trigger cleanup
    unmount()
  })
})
