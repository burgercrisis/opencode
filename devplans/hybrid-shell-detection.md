# Development Plan: Hybrid Shell Detection for OpenCode

**Branch:** burge
**Target File:** devplan/hybrid-shell-detection.md
**Status:** Planning Phase (READ-ONLY)

## Overview

Implement a robust cross-platform shell detection and execution system that eliminates Git Bash forking issues on Windows and provides flexible shell options across all platforms.

### Current Problem

- Git Bash on Windows causes forking failures (EBUSY: resource busy or locked)
- Commands like `mkdir -p` fail when executed via cmd.exe
- Git Bash processes get orphaned on Windows
- Inconsistent shell behavior across platforms

### Solution

Hybrid Shell Detection with intelligent fallback options and explicit shell configuration.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Shell Detection Layer                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │ Platform │  │ Config   │  │ Env Vars │                      │
│  │ Detector │  │ Parser   │  │ (SHELL)  │                      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                      │
│       │              │              │                          │
│       ▼              ▼              ▼                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Shell Selector (priority-based selection)     ││
│  └─────┬──────────────────────────────────┬───────────────────┘│
│        │                                  │                    │
│  ┌─────▼─────┐  ┌──────────┐  ┌───────────▼──────┐            │
│  │ Windows   │  │ macOS    │  │ Linux            │            │
│  │ Shell Pool│  │ Shell    │  │ Shell Pool       │            │
│  └───────────┘  └──────────┘  └──────────────────┘            │
└────────────────────────────────────────────────────────────────┘
```

## Phase 1: Core Shell Detection Infrastructure

### 1.1 Create Shell Configuration Types

**File:** `packages/opencode/src/shell/shell-config.ts`

```typescript
export interface ShellConfig {
  path: string
  args: string[]
  name: string
  platform: "win32" | "darwin" | "linux" | "freebsd" | "openbsd" | "sunos" | "aix"
  detection: () => boolean | Promise<boolean>
}

export interface ShellSelectorOptions {
  preferredShell?: "auto" | "powershell" | "cmd" | "bash" | "zsh" | "sh"
  useShellPool?: boolean
  maxPoolSize?: number
  enableGitBash?: boolean // Explicit flag, not auto-detected
}
```

### 1.2 Create Platform-Specific Shell Definitions

**File:** `packages/opencode/src/shell/shells/platform-shells.ts`

```typescript
import { ShellConfig } from "./shell-config"

export const WINDOWS_SHELLS: Record<string, ShellConfig> = {
  pwsh: {
    path: "pwsh.exe",
    args: [],
    name: "PowerShell Core",
    platform: "win32",
    detection: async () => {
      try {
        const { Bun } = await import("bun")
        return Bun.which("pwsh") !== null
      } catch {
        return false
      }
    },
  },
  powershell: {
    path: "powershell.exe",
    args: [],
    name: "PowerShell",
    platform: "win32",
    detection: async () => {
      try {
        const { Bun } = await import("bun")
        return Bun.which("powershell.exe") !== null
      } catch {
        return false
      }
    },
  },
  cmd: {
    path: "cmd.exe",
    args: ["/c"], // Required for cmd.exe command execution
    name: "Command Prompt",
    platform: "win32",
    detection: async () => true, // Always available on Windows
  },
}

export const UNIX_SHELLS: Record<string, ShellConfig> = {
  bash: {
    path: "/bin/bash",
    args: [],
    name: "Bash",
    platform: "linux" | "darwin",
    detection: async () => {
      try {
        const { Bun } = await import("bun")
        return Bun.which("/bin/bash") !== null
      } catch {
        return false
      }
    },
  },
  zsh: {
    path: "/bin/zsh",
    args: [],
    name: "Z Shell",
    platform: "darwin",
    detection: async () => {
      try {
        const { Bun } = await import("bun")
        return Bun.which("/bin/zsh") !== null
      } catch {
        return false
      }
    },
  },
  sh: {
    path: "/bin/sh",
    args: [],
    name: "POSIX Shell",
    platform: "linux" | "freebsd" | "openbsd" | "sunos" | "aix",
    detection: async () => true, // Always available on Unix
  },
}
```

### 1.3 Create Hybrid Shell Detector

**File:** `packages/opencode/src/shell/shell-detector.ts`

```typescript
import { ShellConfig, ShellSelectorOptions } from "./shell-config"
import { WINDOWS_SHELLS } from "./shells/platform-shells"
import { UNIX_SHELLS } from "./shells/unix-shells"
import { Flag } from "@/flag/flag"

export class HybridShellDetector {
  private cache: Map<string, ShellConfig> = new Map()

  constructor(private options: ShellSelectorOptions) {}

  async detect(): Promise<ShellConfig> {
    const platform = process.platform

    // 1. Check explicit user preference
    if (this.options.preferredShell && this.options.preferredShell !== "auto") {
      return this.getShellByName(this.options.preferredShell, platform)
    }

    // 2. Check SHELL environment variable
    const envShell = process.env.SHELL?.trim()
    if (envShell) {
      const normalized = this.normalizeShellName(envShell)
      return this.getShellByName(normalized, platform)
    }

    // 3. Platform-specific detection with priority ordering
    const platformShells = this.getPlatformShells(platform)

    for (const [name, config] of Object.entries(platformShells)) {
      // Check cache first
      if (this.cache.has(name)) {
        const cached = this.cache.get(name)!
        if (await cached.detection()) {
          return cached
        }
      }

      // Run detection
      if (await config.detection()) {
        this.cache.set(name, config)
        return config
      }
    }

    // 4. Fallback to platform default
    return this.getDefaultShell(platform)
  }

  private normalizeShellName(shellPath: string): string {
    const baseName = shellPath.split("/").pop()?.split("\\").pop()
    if (!baseName) return "bash"

    // Map common shell names to our config keys
    const mapping: Record<string, string> = {
      bash: "bash",
      zsh: "zsh",
      sh: "sh",
      pwsh: "powershell",
      "powershell.exe": "powershell",
      "cmd.exe": "cmd",
    }

    return mapping[baseName] || "bash"
  }

  private getShellByName(name: string, platform: string): ShellConfig {
    const shells = platform === "win32" ? WINDOWS_SHELLS : UNIX_SHELLS
    const config = shells[name]
    if (!config) {
      throw new Error(`Shell "${name}" not available for platform ${platform}`)
    }
    return config
  }

  private getPlatformShells(platform: string): Record<string, ShellConfig> {
    switch (platform) {
      case "win32":
        return WINDOWS_SHELLS
      case "darwin":
        return UNIX_SHELLS
      case "linux":
      case "freebsd":
      case "openbsd":
      case "sunos":
      case "aix":
        return UNIX_SHELLS
      default:
        return UNIX_SHELLS // Fallback
    }
  }

  private getDefaultShell(platform: string): ShellConfig {
    switch (platform) {
      case "win32":
        // Prefer PowerShell Core, then PowerShell, then cmd
        return WINDOWS_SHELLS.pwsh
      case "darwin":
        return UNIX_SHELLS.zsh // macOS default
      default:
        return UNIX_SHELLS.bash // Linux/Unix default
    }
  }

  clearCache(): void {
    this.cache.clear()
  }
}
```

## Phase 2: Shell Pool Implementation (Optional Enhancement)

### 2.1 Create Shell Pool Manager

**File:** `packages/opencode/src/shell/shell-pool.ts`

```typescript
import { ShellConfig } from "./shell-config"
import { ShellDetector } from "./shell-detector"
import { Shell } from "./shell"

interface PooledShell {
  config: ShellConfig
  process: import("child_process").ChildProcess
  active: boolean
  lastUsed: number
}

export class ShellPool {
  private pool: Map<string, PooledShell> = new Map()
  private maxPoolSize: number
  private detector: ShellDetector
  private cleanupInterval: NodeJS.Timeout

  constructor(detector: ShellDetector, maxSize: number = 5) {
    this.detector = detector
    this.maxPoolSize = maxSize
    this.startCleanupTask()
  }

  async getShell(): Promise<PooledShell> {
    const config = await this.detector.detect()
    const key = `${config.platform}:${config.name}`

    // Check for existing shell in pool
    const existing = this.pool.get(key)
    if (existing && !existing.active) {
      existing.active = true
      existing.lastUsed = Date.now()
      return existing
    }

    // Create new shell if pool not full
    if (this.pool.size >= this.maxPoolSize) {
      this.evictOldestShell()
    }

    // Spawn new shell process
    const proc = this.spawnShellProcess(config)
    const pooled: PooledShell = {
      config,
      process: proc,
      active: true,
      lastUsed: Date.now(),
    }

    this.pool.set(key, pooled)
    return pooled
  }

  async releaseShell(platform: string, name: string): Promise<void> {
    const key = `${platform}:${name}`
    const pooled = this.pool.get(key)

    if (pooled) {
      pooled.active = false
    }
  }

  private spawnShellProcess(config: ShellConfig): import("child_process").ChildProcess {
    const { spawn } = await import("child_process")

    return spawn(config.path, config.args, {
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
      windowsHide: true,
    })
  }

  private evictOldestShell(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, shell] of this.pool.entries()) {
      if (!shell.active && shell.lastUsed < oldestTime) {
        oldestTime = shell.lastUsed
        oldestKey = key
      }
    }

    if (oldestKey) {
      const shell = this.pool.get(oldestKey)!
      await Shell.killTree(shell.process)
      this.pool.delete(oldestKey)
    }
  }

  private startCleanupTask(): void {
    // Cleanup idle shells every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      const idleTimeout = 5 * 60 * 1000 // 5 minutes

      for (const [key, shell] of this.pool.entries()) {
        if (!shell.active && now - shell.lastUsed > idleTimeout) {
          Shell.killTree(shell.process)
          this.pool.delete(key)
        }
      }
    }, 60 * 1000)
  }

  async cleanup(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    for (const shell of this.pool.values()) {
      await Shell.killTree(shell.process)
    }

    this.pool.clear()
  }
}
```

## Phase 3: Integration with Bash Tool

### 3.1 Refactor bash.ts to use Hybrid Detection

**File:** `packages/opencode/src/tool/bash.ts`

**Changes needed:**

**Import new shell modules:**

```typescript
import { HybridShellDetector } from "@/shell/shell-detector"
import { ShellSelectorOptions } from "@/shell/shell-config"
import { ShellPool } from "@/shell/shell-pool"
import { Flag } from "@/flag/flag"
```

**Create detector instance:**

```typescript
const detector = new HybridShellDetector({
  preferredShell: Flag.OPENCODE_PREFERRED_SHELL || "auto",
  useShellPool: Flag.OPENCODE_USE_SHELL_POOL || false,
  maxPoolSize: Flag.OPENCODE_SHELL_POOL_SIZE || 5,
  enableGitBash: Flag.OPENCODE_ENABLE_GIT_BASH === "true",
})
```

**Replace Shell.acceptable() call:**

```typescript
// OLD:
const shell = Shell.acceptable()

// NEW:
const shellConfig = await detector.detect()
const shell = shellConfig.path
```

**Update spawn call:**

```typescript
// OLD:
const proc = spawn(params.command, {
  shell: shell,
  cwd,
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
  detached: process.platform !== "win32",
})

// NEW:
const proc = spawn(params.command, {
  shell: shell, // Explicit shell path from detector
  shellArgs: shellConfig.args, // Platform-specific args (e.g., ['/c'] for cmd)
  cwd,
  env: { ...process.env },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // Always detached for better process management
  windowsHide: true,
})
```

**Add command translation for shell compatibility:**

```typescript
// Translate common bash commands to shell-specific syntax
private translateCommand(command: string, shell: ShellConfig): string {
  // Windows cmd.exe needs commands prefixed with /c
  if (shell.name === 'Command Prompt') {
    return command;
  }

  // PowerShell and bash use commands directly
  return command;
}
```

### 3.2 Update Kill Logic

In `execute()` function:

```typescript
// OLD:
const kill = () => Shell.killTree(proc, { exited: () => exited })

// NEW:
const kill = async () => {
  // Use platform-appropriate kill method
  if (process.platform === "win32") {
    // For Windows shells, use taskkill or TerminateProcess
    await killWindowsProcess(proc.pid!)
  } else {
    await Shell.killTree(proc, { exited: () => exited })
  }
}

async function killWindowsProcess(pid: number): Promise<void> {
  const { execSync } = await import("child_process")
  try {
    // Try graceful termination first
    execSync(`taskkill /PID ${pid} /T`, { stdio: "ignore" })
    await Bun.sleep(1000)

    // Force kill if still running
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" })
    } catch {
      // Process may have already exited
    }
  } catch (error) {
    console.error("Failed to kill Windows process:", error)
  }
}
```

## Phase 4: Configuration & Flags

### 4.1 Add New Configuration Flags

**File:** `packages/opencode/src/flag/flag.ts`

Add to existing flags:

```typescript
export const Flag = {
  // ... existing flags ...

  // Shell Configuration
  OPENCODE_PREFERRED_SHELL: getEnvVar("OPENCODE_PREFERRED_SHELL"),
  OPENCODE_USE_SHELL_POOL: getEnvVar("OPENCODE_USE_SHELL_POOL") === "true",
  OPENCODE_SHELL_POOL_SIZE: parseInt(getEnvVar("OPENCODE_SHELL_POOL_SIZE") || "5"),
  OPENCODE_ENABLE_GIT_BASH: getEnvVar("OPENCODE_ENABLE_GIT_BASH") === "true",
  OPENCODE_DISABLE_GIT_BASH: getEnvVar("OPENCODE_DISABLE_GIT_BASH") === "true",
}
```

### 4.2 Add User Configuration

**File:** `.opencode.json` schema update

```typescript
interface TerminalConfig {
  shell?: {
    preferredShell?: "auto" | "powershell" | "cmd" | "bash" | "zsh" | "sh"
    useShellPool?: boolean
    maxPoolSize?: number
    enableGitBash?: boolean
  }
}

interface Config {
  // ... existing config ...
  terminal?: TerminalConfig
}
```

## Phase 5: Testing Strategy

### 5.1 Unit Tests

**File:** `packages/opencode/test/shell-detection.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { HybridShellDetector } from "../src/shell/shell-detector"
import { ShellConfig } from "../src/shell/shell-config"

describe("HybridShellDetector", () => {
  describe("Windows Detection", () => {
    it("should detect PowerShell Core when available", async () => {
      const detector = new HybridShellDetector({ preferredShell: "auto" })
      // Mock Bun.which to return pwsh
      const shell = await detector.detect()
      expect(shell.name).toBe("PowerShell Core")
    })

    it("should fallback to PowerShell when pwsh unavailable", async () => {
      const detector = new HybridShellDetector({ preferredShell: "auto" })
      const shell = await detector.detect()
      expect(shell.name).toBe("PowerShell")
    })

    it("should respect explicit cmd preference", async () => {
      const detector = new HybridShellDetector({ preferredShell: "cmd" })
      const shell = await detector.detect()
      expect(shell.name).toBe("Command Prompt")
      expect(shell.args).toEqual(["/c"])
    })
  })

  describe("Unix Detection", () => {
    it("should detect bash on Linux", async () => {
      // Mock platform to linux
      const detector = new HybridShellDetector({ preferredShell: "auto" })
      const shell = await detector.detect()
      expect(shell.name).toBe("Bash")
      expect(shell.path).toBe("/bin/bash")
    })

    it("should detect zsh on macOS", async () => {
      // Mock platform to darwin
      const detector = new HybridShellDetector({ preferredShell: "auto" })
      const shell = await detector.detect()
      expect(shell.name).toBe("Z Shell")
      expect(shell.path).toBe("/bin/zsh")
    })

    it("should respect SHELL environment variable", async () => {
      process.env.SHELL = "/usr/bin/zsh"
      const detector = new HybridShellDetector({ preferredShell: "auto" })
      const shell = await detector.detect()
      expect(shell.name).toBe("Z Shell")
    })
  })

  describe("Caching", () => {
    it("should cache detected shells", async () => {
      const detector = new HybridShellDetector({ preferredShell: "auto" })
      await detector.detect()
      await detector.detect() // Second call
      // Should use cache
    })

    it("should clear cache on clearCache()", async () => {
      const detector = new HybridShellDetector({ preferredShell: "auto" })
      await detector.detect()
      detector.clearCache()
      const initialDetection = await detector.detect()
      detector.clearCache()
      const newDetection = await detector.detect()
      // Should run detection again
    })
  })
})
```

### 5.2 Integration Tests

**File:** `test/integration/shell-execution.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { BashTool } from "../packages/opencode/src/tool/bash"

describe("Shell Execution Integration", () => {
  it("should execute commands on Windows with PowerShell", async () => {
    // Set platform to win32, mock PowerShell availability
    const bashTool = new BashTool()
    const result = await bashTool.execute(
      {
        command: "Get-ChildItem -Path .",
        description: "List files",
      },
      mockContext,
    )

    expect(result.output).toContain("Name")
    expect(result.metadata.exit).toBe(0)
  })

  it("should execute commands on macOS with zsh", async () => {
    // Set platform to darwin
    const bashTool = new BashTool()
    const result = await bashTool.execute(
      {
        command: "ls -la",
        description: "List files",
      },
      mockContext,
    )

    expect(result.output).toContain("total")
    expect(result.metadata.exit).toBe(0)
  })

  it("should handle mkdir -p correctly on all platforms", async () => {
    const bashTool = new BashTool()
    const result = await bashTool.execute(
      {
        command: "mkdir -p test/dir/path",
        description: "Create directory",
      },
      mockContext,
    )

    expect(result.metadata.exit).toBe(0)
    // Verify directory was created
  })

  it("should not create orphaned processes", async () => {
    const bashTool = new BashTool()
    const result = await bashTool.execute(
      {
        command: "sleep 1",
        description: "Wait command",
        timeout: 500,
      },
      mockContext,
    )

    // Verify process was properly cleaned up
    expect(result.metadata.timedOut).toBe(true)
  })
})
```

### 5.3 Cross-Platform Testing

**Platforms to test:**

- Windows 10/11: PowerShell Core, PowerShell 5.1, cmd.exe
- macOS (Intel & Apple Silicon): zsh, bash
- Linux (Ubuntu, Debian, Fedora): bash, zsh, sh
- WSL (Windows Subsystem for Linux): bash, zsh

**Test commands:**

- File operations: `mkdir -p`, `cp`, `mv`, `rm`
- List operations: `ls`, `dir`
- Search operations: `find`, `grep`
- Build tools: `npm`, `pnpm`, `yarn`, `cargo`, `go`
- Git operations: `git status`, `git log`, `git diff`

## Phase 6: Migration & Backward Compatibility

### 6.1 Migration Path

**Step 1:** Add new shell infrastructure (Phase 1-2)

- Create new files alongside existing `shell.ts`
- Add unit tests for new modules
- Ensure no breaking changes to existing code

**Step 2:** Integrate with bash tool (Phase 3)

- Replace `Shell.acceptable()` with detector
- Update spawn calls
- Test all existing bash tool functionality

**Step 3:** Add configuration (Phase 4)

- Add flags
- Update config schema
- Document new options

**Step 4:** Cleanup (Phase 5+)

- Remove Git Bash detection code
- Simplify `Shell.acceptable()` if deprecated
- Update documentation

### 6.2 Backward Compatibility

**Preserve existing behaviors:**

- Default to auto detection (mimics current behavior)
- Support `OPENCODE_SHELL` environment variable (if already used)
- Keep `Shell.killTree()` for Unix platforms
- Maintain same timeout and output behavior

**Configuration migration:**

```json
// Old config (no effect, won't break):
{
  "OPENCODE_GIT_BASH_PATH": "/path/to/git/bash.exe"
}

// New config (recommended):
{
  "terminal": {
    "preferredShell": "powershell"
  }
}
```

## Phase 7: Edge Cases & Error Handling

### 7.1 Shell Not Available

```typescript
async function handleShellNotAvailable(shellName: string, platform: string): Promise<ShellConfig> {
  // Try all fallbacks
  const fallbacks = getFallbackShells(platform)

  for (const shell of fallbacks) {
    if (await shell.detection()) {
      return shell
    }
  }

  throw new Error(`No suitable shell found on ${platform}. Tried: ${fallbacks.map((s) => s.name).join(", ")}`)
}
```

### 7.2 Process Timeout & Cleanup

```typescript
const executeWithCleanup = async (command: string, shell: ShellConfig) => {
  const proc = spawn(command, { shell: shell.path })

  // Set up cleanup on timeout
  const timeout = setTimeout(async () => {
    await killShellProcess(proc.pid)
    throw new Error(`Command timed out after ${DEFAULT_TIMEOUT}ms`)
  }, DEFAULT_TIMEOUT)

  try {
    const output = await captureOutput(proc)
    clearTimeout(timeout)
    return output
  } catch (error) {
    clearTimeout(timeout)
    await killShellProcess(proc.pid)
    throw error
  }
}
```

### 7.3 Permission Denied Scenarios

```typescript
// When shell can't be spawned (permission issues)
try {
  const proc = spawn(command, { shell: shell.path })
} catch (error) {
  if (error.code === "EACCES" || error.code === "EPERM") {
    throw new Error(
      `Permission denied spawning shell: ${shell.path}. ` +
        `Try running OpenCode with elevated privileges or check file permissions.`,
    )
  }
  throw error
}
```

## File Structure

```
packages/opencode/src/shell/
├── shell-config.ts           # Type definitions
├── shell-detector.ts         # Hybrid detection logic
├── shell-pool.ts            # Optional shell pooling
├── shells/
│   ├── index.ts              # Export all shells
│   ├── platform-shells.ts     # Windows shell configs
│   └── unix-shells.ts        # Unix/macOS shell configs
└── utils/
    ├── kill.ts                # Platform-specific kill logic
    └── translate.ts           # Command translation if needed

packages/opencode/test/shell/
├── shell-detector.test.ts     # Unit tests for detector
├── shell-pool.test.ts        # Unit tests for pooling
└── integration.test.ts        # Integration tests
```

## Implementation Checklist

### Core Infrastructure

- [ ] Create shell-config.ts with type definitions
- [ ] Create platform shell definitions (platform-shells.ts, unix-shells.ts)
- [ ] Implement HybridShellDetector class
- [ ] Add shell caching mechanism
- [ ] Implement fallback chain logic

### Integration

- [ ] Update bash.ts imports
- [ ] Replace Shell.acceptable() with detector
- [ ] Update spawn() calls with shell config
- [ ] Update kill logic for Windows
- [ ] Test all existing bash tool functionality

### Configuration

- [ ] Add shell flags to flag.ts
- [ ] Update config schema
- [ ] Add documentation for new options

### Testing

- [ ] Write unit tests for detector
- [ ] Write integration tests for Windows
- [ ] Write integration tests for macOS
- [ ] Write integration tests for Linux
- [ ] Add cross-platform test cases

### Cleanup

- [ ] Remove Git Bash detection code
- [ ] Deprecate OPENCODE_GIT_BASH_PATH flag
- [ ] Update README with shell configuration
- [ ] Add migration guide to docs

## Success Criteria

- **No Git Bash Dependency:** Windows execution uses native shells
- **Explicit Shell Control:** Users can specify preferred shell via config
- **Backward Compatible:** Existing behavior preserved with auto mode
- **No Orphaned Processes:** All spawned processes properly tracked and cleaned up
- **Cross-Platform:** Works consistently on Windows, macOS, and Linux
- **Well-Tested:** Comprehensive test coverage across platforms
- **Documented:** User-facing documentation for shell configuration

## Risks & Mitigations

| Risk                               | Impact | Mitigation                                         |
| ---------------------------------- | ------ | -------------------------------------------------- |
| Breaking existing workflows        | High   | Default to auto, preserve SHELL env var            |
| PowerShell availability on Windows | Medium | Fallback to cmd.exe, user can still force Git Bash |
| Performance overhead of pooling    | Low    | Pooling is optional (default off)                  |
| Increased complexity               | Medium | Clear separation of concerns, extensive testing    |

## Next Steps After Implementation

1. **Monitor:** Track shell usage metrics in production
2. **Gather Feedback:** Collect user reports on shell behavior
3. **Iterate:** Refine shell priority based on real usage
4. **Document:** Create shell configuration guide for users
5. **Consider MCP:** If successful, explore shell MCP server for external tool

---

**Estimated Effort:** 5-7 days (including testing and documentation)
**Priority:** High (resolves critical Windows forking issues)
**Dependencies:** None (pure implementation, no new packages)
