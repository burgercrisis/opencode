import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import * as Formatter from "../formatter"
import { Instance } from "../../project/instance"
import { Flag } from "../../flag/flag"

describe("Formatter", () => {
  let originalInstance: any

  beforeEach(() => {
    // Save original Instance before mocking
    originalInstance = (globalThis as any).Instance
    // Mock Instance
    globalThis.Instance = {
      directory: "/test/project",
      worktree: "/test/project",
      provide: async () => ({}) as any
    } as any
  })

  afterEach(() => {
    // Restore original Instance instead of deleting
    if (originalInstance !== undefined) {
      (globalThis as any).Instance = originalInstance
    } else {
      delete (globalThis as any).Instance
    }
  })

  describe("gofmt formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.gofmt.name).toBe("gofmt")
      expect(Formatter.gofmt.command).toEqual(["gofmt", "-w", "$FILE"])
      expect(Formatter.gofmt.extensions).toEqual([".go"])
    })

    it("should check if gofmt is available", async () => {
      // Mock Bun.which
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/gofmt"
        }
      })()

      const enabled = await Formatter.gofmt.enabled()
      expect(enabled).toBe(true)
    })

    it("should return false when gofmt is not available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => null
        }
      })()

      const enabled = await Formatter.gofmt.enabled()
      expect(enabled).toBe(false)
    })
  })

  describe("mix formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.mix.name).toBe("mix")
      expect(Formatter.mix.command).toEqual(["mix", "format", "$FILE"])
      expect(Formatter.mix.extensions).toEqual([".ex", ".exs", ".eex", ".heex", ".leex", ".neex", ".sface"])
    })

    it("should check if mix is available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/mix"
        }
      })()

      const enabled = await Formatter.mix.enabled()
      expect(enabled).toBe(true)
    })
  })

  describe("prettier formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.prettier.name).toBe("prettier")
      expect(Formatter.prettier.extensions).toContain(".ts")
      expect(Formatter.prettier.extensions).toContain(".js")
      expect(Formatter.prettier.extensions).toContain(".json")
      expect(Formatter.prettier.environment).toEqual({ BUN_BE_BUN: "1" })
    })

    it("should check package.json for prettier dependency", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([
            "/test/project/package.json"
          ]),
          readJson: () => Promise.resolve({
            dependencies: { prettier: "^3.0.0" }
          })
        }
      })()

      const enabled = await Formatter.prettier.enabled()
      expect(enabled).toBe(true)
    })

    it("should check devDependencies for prettier", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([
            "/test/project/package.json"
          ]),
          readJson: () => Promise.resolve({
            devDependencies: { prettier: "^3.0.0" }
          })
        }
      })()

      const enabled = await Formatter.prettier.enabled()
      expect(enabled).toBe(true)
    })

    it("should return false when prettier not found", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([
            "/test/project/package.json"
          ]),
          readJson: () => Promise.resolve({
            dependencies: { lodash: "^4.0.0" }
          })
        }
      })()

      const enabled = await Formatter.prettier.enabled()
      expect(enabled).toBe(false)
    })
  })

  describe("oxfmt formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.oxfmt.name).toBe("oxfmt")
      expect(Formatter.oxfmt.extensions).toContain(".ts")
      expect(Formatter.oxfmt.environment).toEqual({ BUN_BE_BUN: "1" })
    })

    it("should respect OPENCODE_EXPERIMENTAL_OXFMT flag", async () => {
      mock(async () => {
        const mod = await import("../../flag/flag")
        return {
          ...mod.Flag,
          OPENCODE_EXPERIMENTAL_OXFMT: false
        }
      })()

      const enabled = await Formatter.oxfmt.enabled()
      expect(enabled).toBe(false)
    })

    it("should check package.json for oxfmt dependency", async () => {
      mock(async () => {
        const mod = await import("../../flag/flag")
        return {
          ...mod.Flag,
          OPENCODE_EXPERIMENTAL_OXFMT: true
        }
      })()

      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([
            "/test/project/package.json"
          ]),
          readJson: () => Promise.resolve({
            dependencies: { oxfmt: "^0.1.0" }
          })
        }
      })()

      const enabled = await Formatter.oxfmt.enabled()
      expect(enabled).toBe(true)
    })
  })

  describe("biome formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.biome.name).toBe("biome")
      expect(Formatter.biome.command).toContain("@biomejs/biome")
      expect(Formatter.biome.extensions).toContain(".ts")
      expect(Formatter.biome.extensions).toContain(".js")
    })

    it("should check for biome.json config file", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([
            "/test/project/biome.json"
          ])
        }
      })()

      const enabled = await Formatter.biome.enabled()
      expect(enabled).toBe(true)
    })

    it("should check for biome.jsonc config file", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([
            "/test/project/biome.jsonc"
          ])
        }
      })()

      const enabled = await Formatter.biome.enabled()
      expect(enabled).toBe(true)
    })

    it("should return false when no config found", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([])
        }
      })()

      const enabled = await Formatter.biome.enabled()
      expect(enabled).toBe(false)
    })
  })

  describe("zig formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.zig.name).toBe("zig")
      expect(Formatter.zig.command).toEqual(["zig", "fmt", "$FILE"])
      expect(Formatter.zig.extensions).toEqual([".zig", ".zon"])
    })

    it("should check if zig is available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/zig"
        }
      })()

      const enabled = await Formatter.zig.enabled()
      expect(enabled).toBe(true)
    })
  })

  describe("clang formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.clang.name).toBe("clang-format")
      expect(Formatter.clang.command).toEqual(["clang-format", "-i", "$FILE"])
      expect(Formatter.clang.extensions).toContain(".c")
      expect(Formatter.clang.extensions).toContain(".cpp")
      expect(Formatter.clang.extensions).toContain(".h")
    })

    it("should check for .clang-format config file", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([
            "/test/project/.clang-format"
          ])
        }
      })()

      const enabled = await Formatter.clang.enabled()
      expect(enabled).toBe(true)
    })

    it("should return false when no config found", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([])
        }
      })()

      const enabled = await Formatter.clang.enabled()
      expect(enabled).toBe(false)
    })
  })

  describe("ruff formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.ruff.name).toBe("ruff")
      expect(Formatter.ruff.command).toEqual(["ruff", "format", "$FILE"])
      expect(Formatter.ruff.extensions).toEqual([".py", ".pyi"])
    })

    it("should check if ruff is available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/ruff"
        }
      })()

      const enabled = await Formatter.ruff.enabled()
      expect(enabled).toBe(true)
    })

    it("should check pyproject.toml for ruff config", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([
            "/test/project/pyproject.toml"
          ]),
          readText: () => Promise.resolve("[tool.ruff]\nline-length = 88")
        }
      })()

      const enabled = await Formatter.ruff.enabled()
      expect(enabled).toBe(true)
    })

    it("should check requirements.txt for ruff dependency", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([
            "/test/project/requirements.txt"
          ]),
          readText: () => Promise.resolve("ruff==0.1.0")
        }
      })()

      const enabled = await Formatter.ruff.enabled()
      expect(enabled).toBe(true)
    })

    it("should return false when ruff not found", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => null
        }
      })()

      const enabled = await Formatter.ruff.enabled()
      expect(enabled).toBe(false)
    })
  })

  describe("uvformat formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.uvformat.name).toBe("uv")
      expect(Formatter.uvformat.command).toEqual(["uv", "format", "--", "$FILE"])
      expect(Formatter.uvformat.extensions).toEqual([".py", ".pyi"])
    })

    it("should be disabled when ruff is available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/ruff"
        }
      })()

      const enabled = await Formatter.uvformat.enabled()
      expect(enabled).toBe(false)
    })

    it("should check uv help command", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/uv",
          spawn: () => ({
            exited: Promise.resolve(0)
          })
        }
      })()

      const enabled = await Formatter.uvformat.enabled()
      expect(enabled).toBe(true)
    })
  })

  describe("rubocop formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.rubocop.name).toBe("rubocop")
      expect(Formatter.rubocop.command).toEqual(["rubocop", "--autocorrect", "$FILE"])
      expect(Formatter.rubocop.extensions).toEqual([".rb", ".rake", ".gemspec", ".ru"])
    })

    it("should check if rubocop is available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/rubocop"
        }
      })()

      const enabled = await Formatter.rubocop.enabled()
      expect(enabled).toBe(true)
    })
  })

  describe("standardrb formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.standardrb.name).toBe("standardrb")
      expect(Formatter.standardrb.command).toEqual(["standardrb", "--fix", "$FILE"])
      expect(Formatter.standardrb.extensions).toEqual([".rb", ".rake", ".gemspec", ".ru"])
    })

    it("should check if standardrb is available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/standardrb"
        }
      })()

      const enabled = await Formatter.standardrb.enabled()
      expect(enabled).toBe(true)
    })
  })

  describe("dart formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.dart.name).toBe("dart")
      expect(Formatter.dart.command).toEqual(["dart", "format", "$FILE"])
      expect(Formatter.dart.extensions).toEqual([".dart"])
    })

    it("should check if dart is available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/dart"
        }
      })()

      const enabled = await Formatter.dart.enabled()
      expect(enabled).toBe(true)
    })
  })

  describe("rustfmt formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.rustfmt.name).toBe("rustfmt")
      expect(Formatter.rustfmt.command).toEqual(["rustfmt", "$FILE"])
      expect(Formatter.rustfmt.extensions).toEqual([".rs"])
    })

    it("should check if rustfmt is available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/rustfmt"
        }
      })()

      const enabled = await Formatter.rustfmt.enabled()
      expect(enabled).toBe(true)
    })
  })

  describe("shfmt formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.shfmt.name).toBe("shfmt")
      expect(Formatter.shfmt.command).toEqual(["shfmt", "-w", "$FILE"])
      expect(Formatter.shfmt.extensions).toEqual([".sh", ".bash"])
    })

    it("should check if shfmt is available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/shfmt"
        }
      })()

      const enabled = await Formatter.shfmt.enabled()
      expect(enabled).toBe(true)
    })
  })

  describe("terraform formatter", () => {
    it("should have correct configuration", () => {
      expect(Formatter.terraform.name).toBe("terraform")
      expect(Formatter.terraform.command).toEqual(["terraform", "fmt", "$FILE"])
      expect(Formatter.terraform.extensions).toEqual([".tf", ".tfvars"])
    })

    it("should check if terraform is available", async () => {
      mock(async () => {
        const { Bun } = await import("bun")
        return {
          which: () => "/usr/local/bin/terraform"
        }
      })()

      const enabled = await Formatter.terraform.enabled()
      expect(enabled).toBe(true)
    })
  })

  describe("error handling", () => {
    it("should handle filesystem errors gracefully", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.reject(new Error("Permission denied"))
        }
      })()

      const enabled = await Formatter.prettier.enabled()
      expect(enabled).toBe(false)
    })

    it("should handle invalid JSON gracefully", async () => {
      mock(async () => {
        const mod = await import("../../util/filesystem")
        return {
          ...mod.Filesystem,
          findUp: () => Promise.resolve([
            "/test/project/package.json"
          ]),
          readJson: () => Promise.reject(new Error("Invalid JSON"))
        }
      })()

      const enabled = await Formatter.prettier.enabled()
      expect(enabled).toBe(false)
    })
  })

  describe("all formatters", () => {
    it("should export all expected formatters", () => {
      const expectedFormatters = [
        "gofmt", "mix", "prettier", "oxfmt", "biome", "zig", "clang",
        "ktlint", "ruff", "rlang", "uvformat", "rubocop", "standardrb",
        "htmlbeautifier", "dart", "ocamlformat", "terraform", "latexindent",
        "gleam", "shfmt", "nixfmt", "rustfmt", "pint", "ormolu",
        "cljfmt", "dfmt"
      ]

      expectedFormatters.forEach(formatterName => {
        expect((Formatter as any)[formatterName]).toBeDefined()
        expect((Formatter as any)[formatterName].name).toBe(formatterName)
        expect(Array.isArray((Formatter as any)[formatterName].extensions)).toBe(true)
        expect(typeof (Formatter as any)[formatterName].enabled).toBe("function")
      })
    })

    it("should have valid commands for all formatters", () => {
      Object.values(Formatter).forEach(formatter => {
        expect(Array.isArray(formatter.command)).toBe(true)
        expect(formatter.command.length).toBeGreaterThan(0)
        expect(formatter.command[formatter.command.length - 1]).toBe("$FILE")
      })
    })

    it("should have valid extensions for all formatters", () => {
      Object.values(Formatter).forEach(formatter => {
        expect(Array.isArray(formatter.extensions)).toBe(true)
        expect(formatter.extensions.length).toBeGreaterThan(0)
        formatter.extensions.forEach(ext => {
          expect(ext.startsWith(".")).toBe(true)
        })
      })
    })
  })
})
