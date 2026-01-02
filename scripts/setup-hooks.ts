#!/usr/bin/env bun

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { execSync } from "node:child_process"

async function setupGitHooks() {
    try {
        // Check if we're in a git repository
        try {
            execSync("git rev-parse --git-dir", { stdio: "ignore" })
        } catch {
            console.log("Not in a git repository, skipping hooks setup")
            return
        }

        const gitDir = execSync("git rev-parse --git-dir", { encoding: "utf8" }).trim()
        const hooksDir = join(gitDir, "hooks")

        // Ensure hooks directory exists
        await mkdir(hooksDir, { recursive: true })

        // Create cross-platform pre-push hook
        const prePushHook = `#!/usr/bin/env bun
import { execSync } from "node:child_process"

// Ensure dependencies are installed before typecheck
try {
  execSync("bun --version", { stdio: "ignore" })
  execSync("bun install", { stdio: "pipe", stderr: "pipe" })
} catch {
  // Bun not available or install failed, continue anyway
}

try {
  execSync("bun run typecheck", { stdio: "inherit" })
  process.exit(0)
} catch (error) {
  console.error("Typecheck failed:", error.message)
  process.exit(1)
}
`

        const prePushPath = join(hooksDir, "pre-push")
        await writeFile(prePushPath, prePushHook, { mode: 0o755 })

        console.log("✅ Cross-platform pre-push hook installed")
    } catch (error) {
        console.error("Failed to setup git hooks:", error)
        process.exit(1)
    }
}

// Run if called directly
if (import.meta.main) {
    setupGitHooks()
}
