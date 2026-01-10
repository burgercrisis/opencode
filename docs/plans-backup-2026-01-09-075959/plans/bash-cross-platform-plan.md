# Cross-Platform Compatibility Plan for bash.ts

> Created: 2026-01-09
> Status: Planning Phase
> Owner: Roo (this agent)
> Related: [powershell-additional-fixes.md](../docs/devplans/powershell-additional-fixes.md)

## Overview

Make `packages/opencode/src/tool/bash.ts` compatible with both Bun and Node.js runtimes by following the pattern established in `packages/opencode/src/shell/shell.ts`.

## Issues to Fix

| #   | Issue                                          | Line     | Severity | Priority | Status  |
| --- | ---------------------------------------------- | -------- | -------- | -------- | ------- |
| 1   | Type cast to private property                  | 286      | Low      | Low      | Pending |
| 2   | Duplicate shutdown handlers                    | 305-306  | Low      | Low      | Pending |
| 3   | CRITICAL: Bun.spawn crashes on Node.js         | 520      | Critical | High     | Pending |
| 4   | CRITICAL: Bun stream API fails on Node.js      | 553-567  | Critical | High     | Pending |
| 5   | CRITICAL: proc.exited differs between runtimes | 598      | Critical | High     | Pending |
| 6   | Signal handling on Unix                        | 573, 299 | Medium   | High     | Pending |
| 7   | Spawn failure handling                         | 520      | Low      | Medium   | Pending |
| 8   | Child process orphaning                        | 524      | Low      | Medium   | Pending |
| 9   | Timeout race condition                         | 588-598  | Medium   | Low      | Pending |
| 10  | Platform-specific exit codes                   | 634      | Low      | Low      | Pending |

**Priority Order:** Items 3-5 (CRITICAL) > Item 6 (Functionality) > Items 7-8 (Code Quality) > Items 9-10 (Edge Cases)

## Phases

### Phase 1: Import and Runtime Detection

- [ ] Add `child_process` import: `spawn, type ChildProcess`
- [ ] Add `isBunRuntime` constant at top of file

### Phase 2: Conditional Process Spawning

- [ ] Replace `Bun.spawn()` at line 520 with if/else branching
- [ ] Bun path: `Bun.spawn(cmd, {...})`
- [ ] Node.js path: `spawn(cmd[0], cmd.slice(1), {...})`
- [ ] Wrap in try/catch for spawn failure handling (Issue 7)
- [ ] Ensure `detached: true` for child process orphaning prevention (Issue 8)

### Phase 3: Conditional Stream Handling

- [ ] Replace stream reader at lines 553-567 with if/else branching
- [ ] Bun path: `getReader()` with async `read()` loop
- [ ] Node.js path: `on('data')` event handlers

### Phase 4: Conditional Exit Handling

- [ ] Replace `await proc.exited` at line 598 with if/else branching
- [ ] Bun path: `await proc.exited`
- [ ] Node.js path: Promise wrapper around `proc.on('exit')`
- [ ] Normalize exit codes (negative Unix codes → positive) (Issue 10)

### Phase 5: Signal Handling and Process Lifecycle

- [ ] Ensure Shell.killTree uses SIGTERM on Unix (Issue 6)
- [ ] Remove duplicate shutdown handler (keep only `beforeExit`) (Issue 2)
- [ ] Add public getter for `tempFileManager` (Issue 1)

### Phase 6: Timeout Edge Cases

- [ ] Check if process already exited before reporting timeout (Issue 9)

### Phase 7: Testing

- [ ] Test on Bun runtime (current behavior)
- [ ] Test on Node.js runtime (verify cross-platform works)
- [ ] Verify Windows behavior unchanged
- [ ] Verify Linux/macOS behavior works
- [ ] Test timeout edge cases

## Exit Handling Detail

Bun's `proc.exited` is a Promise that resolves when the process exits. Node.js uses `proc.on('exit', callback)` or `proc.on('close', callback)`.

**Bun pattern:**

```typescript
await proc.exited
```

**Node.js pattern:**

```typescript
await new Promise<void>((resolve) => {
  proc.on("exit", () => resolve())
  proc.on("error", () => resolve())
})
```

**Exit code normalization:**

```typescript
let exitCode = proc.exitCode ?? proc.code
if (exitCode < 0) {
  exitCode = 128 + Math.abs(exitCode) // Convert to positive representation
}
```

## Signal Handling Detail

On Unix, use SIGTERM for graceful shutdown before SIGKILL:

```typescript
const kill = () => {
  if (process.platform === "win32") {
    proc.kill() // Windows: SIGKILL
  } else {
    proc.kill("SIGTERM") // Unix: graceful
    // Optionally follow up with SIGKILL after timeout
  }
}
```

**Note**: `Shell.killTree` in shell.ts already handles this correctly (lines 87-98), so we should use it consistently.

## Timeout Race Condition Fix

Prevent false timeout reports if process exits at the same time as timeout:

```typescript
let timedOut = false
let exited = false

const timeoutId = setTimeout(() => {
  if (!exited) {  // Only timeout if process still running
    timedOut = true
    void kill()
  }
}, timeout + 100)

await proc.exited
exited = true

// Only report timeout if it actually caused termination
if (timedOut && !exited) {
  resultMetadata.push(...)
}
```

## Files Modified

- `packages/opencode/src/tool/bash.ts` - Main implementation

## Reference

- Pattern: [`packages/opencode/src/shell/shell.ts`](packages/opencode/src/shell/shell.ts) (lines 11-98)
- Related issues: [`docs/devplans/powershell-additional-fixes.md`](../docs/devplans/powershell-additional-fixes.md)
