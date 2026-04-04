import { describe, expect, test } from "bun:test"
import { projectSelected, projectTileActive } from "./sidebar-project-helpers"
import { sidebarExpanded } from "./sidebar-shell-helpers"
import { workspaceOpenState } from "./sidebar-workspace-helpers"

describe("sidebar project helpers", () => {
  describe("projectSelected", () => {
    test("matches direct worktree", () => {
      expect(projectSelected("/tmp/root", "/tmp/root")).toBe(true)
    })

    test("matches sandbox worktree", () => {
      expect(projectSelected("/tmp/branch", "/tmp/root", ["/tmp/branch"])).toBe(true)
      expect(projectSelected("/tmp/other", "/tmp/root", ["/tmp/branch"])).toBe(false)
    })

    test("handles empty sandbox list", () => {
      expect(projectSelected("/tmp/branch", "/tmp/root", [])).toBe(false)
    })

    test("handles null worktree", () => {
      expect(projectSelected(null, "/tmp/root", [])).toBe(false)
      expect(projectSelected("/tmp/branch", null, [])).toBe(false)
    })
  })

  describe("projectTileActive", () => {
    test("menu state always wins", () => {
      expect(
        projectTileActive({
          menu: true,
          preview: false,
          open: false,
          overlay: false,
          worktree: "/tmp/root",
        }),
      ).toBe(true)
    })

    test("preview mode uses open state", () => {
      expect(
        projectTileActive({
          menu: false,
          preview: true,
          open: true,
          overlay: true,
          hoverProject: "/tmp/other",
          worktree: "/tmp/root",
        }),
      ).toBe(true)
    })

    test("overlay mode uses hovered project", () => {
      expect(
        projectTileActive({
          menu: false,
          preview: false,
          open: false,
          overlay: true,
          hoverProject: "/tmp/root",
          worktree: "/tmp/root",
        }),
      ).toBe(true)
    })

    test("overlay mode with different hovered project", () => {
      expect(
        projectTileActive({
          menu: false,
          preview: false,
          open: false,
          overlay: true,
          hoverProject: "/tmp/other",
          worktree: "/tmp/root",
        }),
      ).toBe(false)
    })

    test("open state when no other modes active", () => {
      expect(
        projectTileActive({
          menu: false,
          preview: false,
          open: true,
          overlay: false,
          worktree: "/tmp/root",
        }),
      ).toBe(true)
    })

    test("inactive when all modes false", () => {
      expect(
        projectTileActive({
          menu: false,
          preview: false,
          open: false,
          overlay: false,
          worktree: "/tmp/root",
        }),
      ).toBe(false)
    })

    test("handles missing worktree", () => {
      expect(
        projectTileActive({
          menu: false,
          preview: false,
          open: true,
          overlay: false,
          worktree: null,
        }),
      ).toBe(false)
    })
  })
})

describe("sidebar shell helpers", () => {
  describe("sidebarExpanded", () => {
    test("expands on mobile regardless of desktop open state", () => {
      expect(sidebarExpanded(true, false)).toBe(true)
      expect(sidebarExpanded(true, true)).toBe(true)
    })

    test("follows desktop open state when not mobile", () => {
      expect(sidebarExpanded(false, true)).toBe(true)
      expect(sidebarExpanded(false, false)).toBe(false)
    })

    test("handles undefined desktop state", () => {
      expect(sidebarExpanded(false, undefined)).toBe(false)
    })

    test("handles undefined mobile state", () => {
      expect(sidebarExpanded(undefined, true)).toBe(true)
      expect(sidebarExpanded(undefined, false)).toBe(false)
    })
  })
})

describe("sidebar workspace helpers", () => {
  describe("workspaceOpenState", () => {
    test("defaults to local workspace open", () => {
      expect(workspaceOpenState({}, "/tmp/root", true)).toBe(true)
      expect(workspaceOpenState({}, "/tmp/root", false)).toBe(false)
    })

    test("uses persisted expansion state when present", () => {
      expect(workspaceOpenState({ "/tmp/root": false }, "/tmp/root", true)).toBe(false)
      expect(workspaceOpenState({ "/tmp/branch": true }, "/tmp/branch", false)).toBe(true)
    })

    test("falls back to default when workspace not in persisted state", () => {
      expect(workspaceOpenState({ "/tmp/other": true }, "/tmp/root", true)).toBe(true)
      expect(workspaceOpenState({ "/tmp/other": false }, "/tmp/root", false)).toBe(false)
    })

    test("handles null workspace path", () => {
      expect(workspaceOpenState({}, null, true)).toBe(false)
      expect(workspaceOpenState({ "/tmp/root": true }, null, false)).toBe(false)
    })

    test("handles undefined persisted state", () => {
      expect(workspaceOpenState(undefined, "/tmp/root", true)).toBe(true)
      expect(workspaceOpenState(undefined, "/tmp/root", false)).toBe(false)
    })

    test("handles empty persisted state", () => {
      expect(workspaceOpenState({}, "/tmp/root", true)).toBe(true)
      expect(workspaceOpenState({}, "/tmp/root", false)).toBe(false)
    })
  })
})
