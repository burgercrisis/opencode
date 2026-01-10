import { describe, expect, test } from "bun:test"
import { SignalHandlerFactory } from "../../src/tool/cross-platform-signal-handler"
import { PathHandlerFactory } from "../../src/tool/cross-platform-path"
import { EnvironmentHandlerFactory } from "../../src/tool/environment-handler"
import { HereDocumentHandlerFactory } from "../../src/tool/here-document-translator"

describe("cross-platform infrastructure", () => {
  describe("SignalHandler", () => {
    test("creates appropriate handler for platform", () => {
      const handler = SignalHandlerFactory.create()
      expect(handler).toBeDefined()
      expect(typeof handler.sendInterrupt).toBe("function")
      expect(typeof handler.sendTerminate).toBe("function")
      expect(typeof handler.sendKill).toBe("function")
    })
  })

  describe("PathHandler", () => {
    const handler = PathHandlerFactory.create()

    test("creates appropriate handler for platform", () => {
      expect(handler).toBeDefined()
      expect(typeof handler.toPlatform).toBe("function")
      expect(typeof handler.expandUser).toBe("function")
      expect(typeof handler.normalize).toBe("function")
    })

    test("expands user home directory", () => {
      const input = "~/test/file.txt"
      const expanded = handler.expandUser(input)
      expect(expanded).not.toBe(input) // Should be different after expansion
      // Should contain actual home directory path, not the variable name
      const homeEnv = process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME
      if (homeEnv) {
        const homePath = homeEnv.replace(/\\/g, "/") // Normalize backslashes to forward slashes
        expect(expanded).toContain(homePath)
      } else {
        // If no home env, skip the check
        expect(expanded).not.toBe(input)
      }
    })

    test("normalizes paths", () => {
      const input = "~/test/../file.txt"
      const normalized = handler.normalize(input)
      expect(normalized).not.toContain("..") // Should resolve parent directory references
    })
  })

  describe("EnvironmentHandler", () => {
    const handler = EnvironmentHandlerFactory.create()

    test("creates appropriate handler for platform", () => {
      expect(handler).toBeDefined()
      expect(typeof handler.set).toBe("function")
      expect(typeof handler.get).toBe("function")
      expect(typeof handler.unset).toBe("function")
      expect(typeof handler.convertSyntax).toBe("function")
      expect(typeof handler.getAll).toBe("function")
    })

    test("converts environment variable syntax", () => {
      const input = "echo $HOME and $USER"
      const converted = handler.convertSyntax(input)

      if (process.platform === "win32") {
        expect(converted).toContain("$env:HOME")
        expect(converted).toContain("$env:USER")
      } else {
        // Unix should remain unchanged for valid syntax
        expect(converted).toBe(input)
      }
    })

    test("can get all environment variables", async () => {
      const envVars = await handler.getAll()
      expect(envVars).toBeDefined()
      expect(typeof envVars).toBe("object")
      expect(Object.keys(envVars).length).toBeGreaterThan(0)
    })
  })

  describe("HereDocumentHandler", () => {
    const handler = HereDocumentHandlerFactory.create()

    test("creates appropriate handler for platform", () => {
      expect(handler).toBeDefined()
      expect(typeof handler.translate).toBe("function")
      expect(typeof handler.hasHereDocuments).toBe("function")
    })

    test("detects here documents", () => {
      const withHereDoc = `cat << EOF
Hello World
EOF`

      const withoutHereDoc = "echo hello world"

      expect(handler.hasHereDocuments(withHereDoc)).toBe(true)
      expect(handler.hasHereDocuments(withoutHereDoc)).toBe(false)
    })

    test("translates here documents", async () => {
      const input = `cat << EOF
Hello World
This is a test
EOF`

      const translated = await handler.translate(input)

      if (process.platform === "win32") {
        expect(translated).not.toBe(input) // Should be different on Windows
        expect(translated).toContain("Get-Content") // Should use PowerShell Get-Content
      } else {
        expect(translated).toBe(input) // Should remain unchanged on Unix
      }
    })

    test("handles complex here documents", async () => {
      const input = `cat << EOF
    Indented content
    with multiple lines
    and $VARIABLES
EOF`

      const translated = await handler.translate(input)

      if (process.platform === "win32") {
        expect(translated).not.toBe(input)
      } else {
        expect(translated).toBe(input)
      }
    })
  })

  describe("integration", () => {
    test("all handlers work together", () => {
      const signalHandler = SignalHandlerFactory.create()
      const pathHandler = PathHandlerFactory.create()
      const envHandler = EnvironmentHandlerFactory.create()
      const hereDocHandler = HereDocumentHandlerFactory.create()

      expect(signalHandler).toBeDefined()
      expect(pathHandler).toBeDefined()
      expect(envHandler).toBeDefined()
      expect(hereDocHandler).toBeDefined()
    })

    test("path and environment handlers work with complex commands", () => {
      const pathHandler = PathHandlerFactory.create()
      const envHandler = EnvironmentHandlerFactory.create()

      const complexCommand = `cd ~/projects && echo $HOME and $PATH`
      const withPaths = pathHandler.expandUser(complexCommand)
      const withEnv = envHandler.convertSyntax(withPaths)

      expect(withPaths).not.toBe(complexCommand)
      expect(withEnv).not.toBe(complexCommand)
    })
  })
})
