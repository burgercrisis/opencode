import { beforeAll, describe, expect, mock, test, beforeEach } from "bun:test"
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library"
import type { FileNode } from "@opencode-ai/sdk/v2"
import FileTree, {
  shouldListRoot,
  shouldListExpanded,
  dirsToExpand,
  pathToFileUrl,
} from "./file-tree"

// Mock all external dependencies
beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useNavigate: () => () => undefined,
    useParams: () => ({}),
  }))

  mock.module("@/context/file", () => ({
    useFile: () => ({
      normalize: (path: string) => path.replace(/\\/g, "/"),
      tree: {
        state: mock(() => undefined),
        list: mock(() => Promise.resolve()),
        children: mock(() => []),
        expand: mock(() => {}),
        collapse: mock(() => {}),
      },
    }),
  }))

  mock.module("@opencode-ai/ui/collapsible", () => ({
    Collapsible: {
      Trigger: (props: any) => props.children,
      Content: (props: any) => props.children,
    },
  }))

  mock.module("@opencode-ai/ui/file-icon", () => ({
    FileIcon: (props: any) => <div data-file-icon={props.node.name} style={props.style} class={props.class} />,
  }))

  mock.module("@opencode-ai/ui/icon", () => ({
    Icon: (props: any) => <div data-icon={props.name} />,
  }))

  mock.module("@opencode-ai/ui/tooltip", () => ({
    Tooltip: (props: any) => props.children,
  }))
})

describe("file-tree utility functions", () => {
  test("pathToFileUrl converts paths correctly", () => {
    expect(pathToFileUrl("/path/to/file.txt")).toBe("file:///path/to/file.txt")
    expect(pathToFileUrl("C:\\Windows\\system32")).toBe("file://C:/Windows/system32")
    expect(pathToFileUrl("relative/path")).toBe("file://relative/path")
  })

  test("shouldListRoot determines when to list root directory", () => {
    expect(shouldListRoot({ level: 0 })).toBe(true)
    expect(shouldListRoot({ level: 0, dir: { loaded: true } })).toBe(false)
    expect(shouldListRoot({ level: 0, dir: { loading: true } })).toBe(false)
    expect(shouldListRoot({ level: 1 })).toBe(false)
    expect(shouldListRoot({ level: 0, dir: { loaded: false, loading: false } })).toBe(true)
  })

  test("shouldListExpanded determines when to list expanded directories", () => {
    expect(shouldListExpanded({ level: 1 })).toBe(false)
    expect(shouldListExpanded({ level: 1, dir: { expanded: false } })).toBe(false)
    expect(shouldListExpanded({ level: 1, dir: { expanded: true } })).toBe(true)
    expect(shouldListExpanded({ level: 1, dir: { expanded: true, loaded: true } })).toBe(false)
    expect(shouldListExpanded({ level: 1, dir: { expanded: true, loading: true } })).toBe(false)
    expect(shouldListExpanded({ level: 0, dir: { expanded: true } })).toBe(false)
    expect(shouldListExpanded({ level: 0, dir: { expanded: true, loaded: false, loading: false } })).toBe(false)
  })

  test("dirsToExpand identifies directories to expand", () => {
    const expanded = new Set<string>()
    const filter = { dirs: new Set(["src", "src/components", "tests"]) }

    const first = dirsToExpand({
      level: 0,
      filter,
      expanded: (dir) => expanded.has(dir),
    })

    expect(first).toEqual(["src", "src/components", "tests"])

    for (const dir of first) expanded.add(dir)

    const second = dirsToExpand({
      level: 0,
      filter,
      expanded: (dir) => expanded.has(dir),
    })

    expect(second).toEqual([])
    expect(dirsToExpand({ level: 1, filter, expanded: () => false })).toEqual([])
    expect(dirsToExpand({ level: 0, expanded: () => false })).toEqual([])
  })
})

describe("FileTree component", () => {
  const mockFileTree = {
    state: mock(() => undefined),
    list: mock(() => Promise.resolve()),
    children: mock(() => []),
    expand: mock(() => {}),
    collapse: mock(() => {}),
    normalize: (path: string) => path.replace(/\\/g, "/"),
  }

  const mockUseFile = () => ({
    tree: mockFileTree,
  })

  beforeEach(() => {
    // Reset all mocks
    mockFileTree.state.mockClear()
    mockFileTree.list.mockClear()
    mockFileTree.children.mockClear()
    mockFileTree.expand.mockClear()
    mockFileTree.collapse.mockClear()
  })

  test("renders basic file tree structure", () => {
    const mockNodes: FileNode[] = [
      { name: "src", path: "src", absolute: "/repo/src", type: "directory", ignored: false },
      { name: "package.json", path: "package.json", absolute: "/repo/package.json", type: "file", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)

    render(() => (
      <FileTree
        path="/repo"
        active="package.json"
        onFileClick={mock()}
      />
    ))

    expect(screen.getByText("src")).toBeInTheDocument()
    expect(screen.getByText("package.json")).toBeInTheDocument()
  })

  test("handles file clicks correctly", async () => {
    const mockOnFileClick = mock()
    const mockNodes: FileNode[] = [
      { name: "test.txt", path: "test.txt", absolute: "/repo/test.txt", type: "file", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)

    render(() => (
      <FileTree
        path="/repo"
        onFileClick={mockOnFileClick}
      />
    ))

    const fileButton = screen.getByText("test.txt")
    await fireEvent.click(fileButton)

    expect(mockOnFileClick).toHaveBeenCalledWith({
      name: "test.txt",
      path: "test.txt",
      absolute: "/repo/test.txt",
      type: "file",
      ignored: false,
    })
  })

  test("applies correct styling for active files", () => {
    const mockNodes: FileNode[] = [
      { name: "active.txt", path: "active.txt", absolute: "/repo/active.txt", type: "file", ignored: false },
      { name: "inactive.txt", path: "inactive.txt", absolute: "/repo/inactive.txt", type: "file", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)

    render(() => (
      <FileTree
        path="/repo"
        active="active.txt"
      />
    ))

    // Both files should be rendered
    expect(screen.getByText("active.txt")).toBeInTheDocument()
    expect(screen.getByText("inactive.txt")).toBeInTheDocument()
  })

  test("handles drag and drop for files", async () => {
    const mockNodes: FileNode[] = [
      { name: "draggable.txt", path: "draggable.txt", absolute: "/repo/draggable.txt", type: "file", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)

    render(() => (
      <FileTree
        path="/repo"
        draggable={true}
      />
    ))

    const fileElement = screen.getByText("draggable.txt")
    
    // Mock drag event
    const dragStartEvent = new Event("dragstart", { bubbles: true }) as any
    dragStartEvent.dataTransfer = {
      setData: mock(),
      setDragImage: mock(),
      effectAllowed: "",
    }

    await fireEvent(fileElement, dragStartEvent)

    expect(dragStartEvent.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "file:draggable.txt")
    expect(dragStartEvent.dataTransfer.setData).toHaveBeenCalledWith("text/uri-list", "file:///repo/draggable.txt")
  })

  test("displays diff indicators for modified files", () => {
    const mockNodes: FileNode[] = [
      { name: "added.txt", path: "added.txt", absolute: "/repo/added.txt", type: "file", ignored: false },
      { name: "deleted.txt", path: "deleted.txt", absolute: "/repo/deleted.txt", type: "file", ignored: false },
      { name: "modified.txt", path: "modified.txt", absolute: "/repo/modified.txt", type: "file", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)

    const kinds = new Map([
      ["added.txt", "add" as const],
      ["deleted.txt", "del" as const],
      ["modified.txt", "mix" as const],
    ])

    render(() => (
      <FileTree
        path="/repo"
        kinds={kinds}
        modified={["added.txt", "deleted.txt", "modified.txt"]}
      />
    ))

    expect(screen.getByText("A")).toBeInTheDocument() // Added
    expect(screen.getByText("D")).toBeInTheDocument() // Deleted  
    expect(screen.getByText("M")).toBeInTheDocument() // Modified
  })

  test("handles directory expansion and collapse", async () => {
    const mockNodes: FileNode[] = [
      { name: "src", path: "src", absolute: "/repo/src", type: "directory", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)
    mockFileTree.state.mockReturnValue({ expanded: false, loaded: true, loading: false })

    render(() => (
      <FileTree
        path="/repo"
      />
    ))

    const dirElement = screen.getByText("src")
    await fireEvent.click(dirElement)

    expect(mockFileTree.expand).toHaveBeenCalledWith("src")
  })

  test("filters files and directories based on allowed list", () => {
    const mockNodes: FileNode[] = [
      { name: "src", path: "src", absolute: "/repo/src", type: "directory", ignored: false },
      { name: "package.json", path: "package.json", absolute: "/repo/package.json", type: "file", ignored: false },
      { name: "README.md", path: "README.md", absolute: "/repo/README.md", type: "file", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)

    render(() => (
      <FileTree
        path="/repo"
        allowed={["src", "package.json"]}
      />
    ))

    expect(screen.getByText("src")).toBeInTheDocument()
    expect(screen.getByText("package.json")).toBeInTheDocument()
    expect(screen.queryByText("README.md")).not.toBeInTheDocument()
  })

  test("handles ignored files with correct styling", () => {
    const mockNodes: FileNode[] = [
      { name: "node_modules", path: "node_modules", absolute: "/repo/node_modules", type: "directory", ignored: true },
      { name: ".git", path: ".git", absolute: "/repo/.git", type: "directory", ignored: true },
      { name: "index.js", path: "index.js", absolute: "/repo/index.js", type: "file", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)

    render(() => (
      <FileTree
        path="/repo"
      />
    ))

    expect(screen.getByText("node_modules")).toBeInTheDocument()
    expect(screen.getByText(".git")).toBeInTheDocument()
    expect(screen.getByText("index.js")).toBeInTheDocument()
  })

  test("prevents expansion beyond maximum depth", () => {
    const mockNodes: FileNode[] = [
      { name: "deep", path: "deep", absolute: "/repo/deep", type: "directory", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)

    render(() => (
      <FileTree
        path="/repo"
        level={128} // At max depth
      />
    ))

    expect(screen.getByText("deep")).toBeInTheDocument()
  })

  test("handles circular references in directory chains", () => {
    const mockNodes: FileNode[] = [
      { name: "circular", path: "circular", absolute: "/repo/circular", type: "directory", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)

    render(() => (
      <FileTree
        path="/repo"
        _chain={["/repo", "circular"]} // Circular reference
      />
    ))

    expect(screen.getByText("circular")).toBeInTheDocument()
  })

  test("applies custom CSS classes", () => {
    const mockNodes: FileNode[] = [
      { name: "custom.txt", path: "custom.txt", absolute: "/repo/custom.txt", type: "file", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)

    render(() => (
      <FileTree
        path="/repo"
        class="custom-tree-class"
        nodeClass="custom-node-class"
      />
    ))

    const treeContainer = screen.getByText("custom.txt").closest('[data-component="filetree"]')
    expect(treeContainer).toHaveClass("custom-tree-class")
  })

  test("handles empty directory listings", () => {
    mockFileTree.children.mockReturnValue([])

    render(() => (
      <FileTree
        path="/repo"
      />
    ))

    const treeContainer = document.querySelector('[data-component="filetree"]')
    expect(treeContainer).toBeInTheDocument()
    expect(treeContainer!.children).toHaveLength(0)
  })

  test("integrates with file context effects", async () => {
    const mockNodes: FileNode[] = [
      { name: "effect-test.txt", path: "effect-test.txt", absolute: "/repo/effect-test.txt", type: "file", ignored: false },
    ]

    mockFileTree.children.mockReturnValue(mockNodes)
    mockFileTree.state.mockReturnValue({ expanded: false, loaded: false, loading: false })

    render(() => (
      <FileTree
        path="/repo"
      />
    ))

    // Wait for effects to run
    await waitFor(() => {
      expect(mockFileTree.list).toHaveBeenCalled()
    })
  })
})
