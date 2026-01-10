# PowerShell Executor: Additional Robustness Improvements

> Created: 2026-01-09
> Status: Planning Phase
> Owner: OpenCode Team (powershell-executor.ts) + Roo (bash.ts)

## Executive Summary

This document outlines a plan to fix issues found in the PowerShell executor and bash.ts implementations. All issues are in code we created (commit `05addd6ee`), not pre-existing.

**Work Allocation:**

- **powershell-executor.ts**: Other agent
- **bash.ts**: Roo (this agent)

---

## Issues Summary

| #   | Issue                                     | File                      | Line     | Severity | Priority | Owner | Fix                             |
| --- | ----------------------------------------- | ------------------------- | -------- | -------- | -------- | ----- | ------------------------------- |
| 1   | Type cast to private property             | bash.ts                   | 286      | Low      | Low      | Roo   | Add public getter               |
| 2   | No stdin piping                           | powershell-executor.ts    | 288-292  | Medium   | Medium   | Other | Add stdin pipe option           |
| 3   | Duplicate shutdown handlers               | bash.ts                   | 305-306  | Low      | Low      | Roo   | Remove redundant handler        |
| 4   | dispose() not awaited                     | temp-file-manager.test.ts | 27       | Low      | Low      | Other | Ensure tests await              |
| 5   | CRITICAL: Bun import crashes on Node.js   | powershell-executor.ts    | 11       | Critical | High     | Other | Conditional import + spawn      |
| 6   | CRITICAL: Bun.spawn crashes on Node.js    | bash.ts                   | 520      | Critical | High     | Roo   | Conditional spawning            |
| 7   | CRITICAL: Bun stream API fails on Node.js | bash.ts                   | 553-567  | Critical | High     | Roo   | Node.js stream events           |
| 8   | **Signal handling on Unix**               | bash.ts                   | 573, 299 | Medium   | High     | Roo   | Use SIGTERM on Unix             |
| 9   | **Spawn failure handling**                | bash.ts                   | 520      | Low      | Medium   | Roo   | Wrap spawn in try/catch         |
| 10  | **Child process orphaning**               | bash.ts                   | 524      | Low      | Medium   | Roo   | Consistent killTree pattern     |
| 11  | **Timeout race condition**                | bash.ts                   | 588-598  | Medium   | Low      | Roo   | Check timedOut before reporting |
| 12  | **Encoding handling**                     | powershell-executor.ts    | 288-292  | Low      | Low      | Other | Specify encoding explicitly     |
| 13  | **Platform exit codes**                   | bash.ts                   | 634      | Low      | Low      | Roo   | Handle negative exit codes      |

**Priority Order:** Items 6-8 (CRITICAL) > Items 8-10 (Functionality) > Items 1-4, 11-13 (Code Quality/Edge Cases)

---

## Issues Owned by Roo (bash.ts)

### Issue 1: Type Cast to Private Property (Low)

**File**: `packages/opencode/src/tool/bash.ts`
**Line**: 286

```typescript
// CURRENT (fragile)
const tempFileManager = (psExecutor as any).tempFileManager
```

**Fix**: Add public getter to PowerShellExecutor:

```typescript
// In PowerShellExecutor class:
getTempFileManager(): TempFileManager {
  return this.tempFileManager
}
```

**Usage**:

```typescript
const tempFileManager = psExecutor?.getTempFileManager()
```

---

### Issue 3: Duplicate Shutdown Handlers (Low)

**File**: `packages/opencode/src/tool/bash.ts`
**Lines**: 305-306

```typescript
// CURRENT - duplicate handlers
process.on("beforeExit", cleanup)
process.on("exit", cleanup) // Redundant - beforeExit runs before exit
```

**Fix**: Remove redundant handler:

```typescript
// Keep only one
process.on("beforeExit", cleanup)
// process.on('exit', cleanup)  // Removed
```

---

### Issue 6: CRITICAL - Bun.spawn Crashes on Node.js (Critical)

**File**: `packages/opencode/src/tool/bash.ts`
**Line**: 520

```typescript
// CURRENT - Bun-only, will crash on Node.js
const proc = Bun.spawn(cmd, {
  cwd,
  env: buildGitEnv(),
  stdio: ["ignore", "pipe", "pipe"],
  detached: process.platform !== "win32",
}) as any
```

**Problem**: `Bun.spawn` is undefined on Node.js, causing immediate crash.

**Fix**: Use conditional spawning like `shell.ts` pattern:

```typescript
import { spawn, type ChildProcess } from "child_process"

const isBunRuntime = typeof Bun !== "undefined" && Bun.spawn !== undefined

// Later in execute():
let proc: ChildProcess | any
if (isBunRuntime) {
  proc = Bun.spawn(cmd, {
    cwd,
    env: buildGitEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  })
} else {
  proc = spawn(cmd[0], cmd.slice(1), {
    cwd,
    env: buildGitEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  })
}
```

**Reference**: [`packages/opencode/src/shell/shell.ts:21-82`](packages/opencode/src/shell/shell.ts) shows correct pattern.

---

### Issue 7: CRITICAL - Bun Stream API Fails on Node.js (Critical)

**File**: `packages/opencode/src/tool/bash.ts`
**Lines**: 553-567

```typescript
// CURRENT - Bun-only API
const stdoutReader = proc.stdout?.getReader()
const stderrReader = proc.stderr?.getReader()

const readOutput = async (reader: ReadableStreamDefaultReader | undefined): Promise<void> => {
  if (!reader) return
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      append(value)
    }
  } catch {
    // Stream reading ended
  }
}
```

**Problem**: `getReader()` and `ReadableStreamDefaultReader` are Bun-specific. Node.js uses event-based streams.

**Fix**: Use conditional stream handling:

```typescript
let stdoutData = ""
let stderrData = ""

if (isBunRuntime) {
  // Bun path: use getReader()
  const stdoutReader = proc.stdout?.getReader()
  const stderrReader = proc.stderr?.getReader()
  const stdoutPromise = readOutput(stdoutReader)
  const stderrPromise = readOutput(stderrReader)
  await Promise.all([stdoutPromise, stderrPromise])
} else {
  // Node.js path: use event handlers
  await new Promise<void>((resolve) => {
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdoutData += chunk.toString()
      append(chunk)
    })
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString()
      append(chunk)
    })
    proc.on("error", () => resolve())
    proc.on("close", () => resolve())
  })
}
```

---

### Issue 8: Signal Handling on Unix (Medium)

**File**: `packages/opencode/src/tool/bash.ts`
**Lines**: 573 (kill function), 299 (Shell.killTree usage)

**Current code**: Uses `proc.kill()` on all platforms

**Problem**: On Unix, `kill()` sends SIGKILL by default which doesn't allow graceful shutdown.

**Fix**: Use platform-specific signals:

```typescript
const killProcess = (proc: any) => {
  if (process.platform === "win32") {
    proc.kill() // Windows: SIGKILL
  } else {
    proc.kill("SIGTERM") // Unix: graceful termination
    // Optionally follow up with SIGKILL after timeout
  }
}

// Or use Shell.killTree which already handles this (verify implementation)
const kill = () => Shell.killTree(proc as any, { exited: () => exited })
```

**Note**: `Shell.killTree` in shell.ts already uses SIGTERM on Unix (lines 87-98), so we should use it consistently.

---

### Issue 9: Spawn Failure Handling (Low)

**File**: `packages/opencode/src/tool/bash.ts`
**Line**: 520

**Current code**: No handling if `spawn()` itself fails

**Problem**: If spawn fails (e.g., executable not found), error is unhandled.

**Fix**: Wrap spawn in try/catch:

```typescript
let proc: ChildProcess | any
try {
  if (isBunRuntime) {
    proc = Bun.spawn(cmd, {...})
  } else {
    proc = spawn(cmd[0], cmd.slice(1), {...})
  }
} catch (spawnError) {
  throw new Error(`Failed to execute command: ${spawnError instanceof Error ? spawnError.message : spawnError}`)
}
```

---

### Issue 10: Child Process Orphaning (Low)

**File**: `packages/opencode/src/tool/bash.ts`
**Line**: 524

**Current code**: Uses `detached: process.platform !== "win32"`

**Problem**: Need to ensure child processes are properly cleaned up if parent dies.

**Fix**: Use `detached: true` consistently and ensure killTree pattern is used:

```typescript
const proc = spawn(cmd[0], cmd.slice(1), {
  cwd,
  env: buildGitEnv(),
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // Allow child to outlive parent
})

// Ensure killTree is called on abort/timeout
const kill = () => Shell.killTree(proc as any, { exited: () => exited })
```

**Note**: On Windows, `detached: true` may not work the same way. Check `shell.ts` for the correct pattern.

---

### Issue 11: Timeout Race Condition (Medium)

**File**: `packages/opencode/src/tool/bash.ts`
**Lines**: 588-598

**Current code**:

```typescript
const timeoutId = setTimeout(() => {
  timedOut = true
  void kill()
}, timeout + 100)

await proc.exited

// Later:
if (timedOut) {
  resultMetadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`)
}
```

**Problem**: What if process exits exactly when setTimeout fires? Could report false timeout.

**Fix**: Check if process already exited before reporting timeout:

```typescript
const timeoutId = setTimeout(() => {
  if (!exited) {
    // Only timeout if process still running
    timedOut = true
    void kill()
  }
}, timeout + 100)

// After proc.exited:
if (timedOut && !exited) {
  resultMetadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`)
}
```

---

### Issue 13: Platform-Specific Exit Codes (Low)

**File**: `packages/opencode/src/tool/bash.ts`
**Line**: 634

**Current code**:

```typescript
exit: proc.exitCode
```

**Problem**: PowerShell and cmd have different exit code conventions. Negative exit codes on Unix indicate signal termination.

**Fix**: Normalize exit codes:

```typescript
let exitCode = proc.exitCode ?? proc.code
// Normalize: negative codes on Unix indicate signal (e.g., -15 for SIGTERM)
if (exitCode < 0) {
  exitCode = 128 + Math.abs(exitCode) // Convert to positive representation
}
```

---

## Issues Owned by Other Agent (powershell-executor.ts)

### Issue 2: No stdin Piping (Medium)

**File**: `packages/opencode/src/tool/powershell-executor.ts`
**Lines**: 288-292

```typescript
// CURRENT - no stdin
const proc = spawn({
  cmd: [this.executable, ...args],
  stdout: options?.captureOutput !== false ? "pipe" : "ignore",
  stderr: options?.captureOutput !== false ? "pipe" : "ignore",
  // Missing: stdin option
})
```

**Problem**: Interactive PowerShell commands that prompt for user input will hang.

**Fix**: Add stdin pipe:

```typescript
const proc = spawn({
  cmd: [this.executable, ...args],
  stdout: options?.captureOutput !== false ? "pipe" : "ignore",
  stderr: options?.captureOutput !== false ? "pipe" : "ignore",
  stdin: options?.interactive ? "pipe" : "ignore",
})
```

---

### Issue 4: dispose() Not Awaited (Low)

**File**: `packages/opencode/src/tool/temp-file-manager.test.ts`
**Line**: 27

**Problem**: `dispose()` is async but tests may not await it.

**Fix**: Ensure tests await dispose():

```typescript
// In tests:
await manager.dispose()
```

---

### Issue 5: CRITICAL - Bun Import Crashes on Node.js (Critical)

**File**: `packages/opencode/src/tool/powershell-executor.ts`
**Line**: 11

```typescript
// CURRENT - Bun-only, will crash on Node.js
import { spawn } from "bun"
```

**Problem**: This import will fail immediately on Node.js because 'bun' is not a valid module.

**Fix**: Use conditional import pattern:

```typescript
let spawn: typeof import("bun").spawn
let isBunRuntime = false

if (typeof Bun !== "undefined" && Bun.spawn !== undefined) {
  isBunRuntime = true
  const bun = await import("bun")
  spawn = bun.spawn
} else {
  const node = await import("child_process")
  spawn = node.spawn
}

// Later in executeFile():
const proc = spawn({
  cmd: [this.executable, ...args],
  stdout: options?.captureOutput !== false ? "pipe" : "ignore",
  stderr: options?.captureOutput !== false ? "pipe" : "ignore",
})
```

**Note**: This is related to Issue 6 in bash.ts - both need the same pattern.

---

### Issue 12: Encoding Handling (Low)

**File**: `packages/opencode/src/tool/powershell-executor.ts`
**Lines**: 288-292

**Problem**: PowerShell output encoding varies by Windows version/region. Non-ASCII characters may be corrupted.

**Fix**: Specify encoding explicitly:

```typescript
const proc = spawn({
  cmd: [this.executable, ...args],
  stdout: options?.captureOutput !== false ? "pipe" : "ignore",
  stderr: options?.captureOutput !== false ? "pipe" : "ignore",
  encoding: "utf8", // Explicit UTF-8 encoding
})
```

---

## Testing Matrix

| File                   | Runtime | Test Case          | Expected             |
| ---------------------- | ------- | ------------------ | -------------------- |
| bash.ts                | Bun     | `echo test`        | ✅ Works             |
| bash.ts                | Bun     | Windows commands   | ✅ Works             |
| bash.ts                | Node.js | `echo test`        | ✅ Works (after fix) |
| bash.ts                | Node.js | Windows commands   | ✅ Works (after fix) |
| bash.ts                | Unix    | Signal handling    | ✅ Graceful shutdown |
| bash.ts                | Unix    | Timeout edge cases | ✅ No false reports  |
| powershell-executor.ts | Bun     | Execute script     | ✅ Works             |
| powershell-executor.ts | Node.js | Execute script     | ✅ Works (after fix) |
| powershell-executor.ts | Windows | Encoding           | ✅ UTF-8 output      |

---

## Files Modified

- `packages/opencode/src/tool/bash.ts` (Owner: Roo)
- `packages/opencode/src/tool/powershell-executor.ts` (Owner: Other agent)
- `packages/opencode/src/tool/temp-file-manager.test.ts` (Owner: Other agent)

## References

- Pattern: [`packages/opencode/src/shell/shell.ts`](packages/opencode/src/shell/shell.ts) (lines 11-98)
- Original commit: `b2341c2d9a4b34d96181003deedee3daafa16d94`
- Related plan: [`plans/bash-cross-platform-plan.md`](plans/bash-cross-platform-plan.md)
