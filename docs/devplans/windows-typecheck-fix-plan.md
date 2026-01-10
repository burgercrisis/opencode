# Windows Typecheck Compatibility Fix Plan

## Overview

This document outlines a plan to fix typecheck errors introduced by Windows PowerShell/CMD fixes while maintaining cross-platform compatibility with Linux/Mac and ensuring TypeScript type safety.

---

## Cross-Platform Impact Matrix

### Legend

| Symbol | Meaning                                |
| ------ | -------------------------------------- |
| ✅     | No impact / Works correctly            |
| ⚠️     | Requires testing / Potential edge case |
| ❌     | Broken / Needs fix                     |
| N/A    | Not applicable (command not available) |
| —      | No change from current behavior        |

### Command Type Support Matrix

| Command Type        | Windows + Node | Windows + Bun | Linux + Node | Linux + Bun | macOS + Node | macOS + Bun |
| ------------------- | -------------- | ------------- | ------------ | ----------- | ------------ | ----------- |
| **cmd.exe**         | ✅ Native      | ✅ Native     | N/A          | N/A         | N/A          | N/A         |
| **PowerShell**      | ✅ Native      | ✅ Native     | N/A          | N/A         | N/A          | N/A         |
| **Git**             | ✅ Shell wrap  | ✅ Shell wrap | ✅ Native    | ✅ Native   | ✅ Native    | ✅ Native   |
| **Bash**            | ⚠️ Git Bash    | ⚠️ Git Bash   | ✅ Native    | ✅ Native   | ✅ Native    | ✅ Native   |
| **System commands** | ✅ Shell wrap  | ✅ Shell wrap | ✅ Native    | ✅ Native   | ✅ Native    | ✅ Native   |

### Fix Impact by Platform and Runtime

#### Issue 1: Logger Type Missing (powershell-executor.ts)

| Platform | Runtime | Impact       | Details                                                |
| -------- | ------- | ------------ | ------------------------------------------------------ |
| Windows  | Node    | ⚠️ Type fix  | Only affects TypeScript compilation, no runtime change |
| Windows  | Bun     | ⚠️ Type fix  | Only affects TypeScript compilation, no runtime change |
| Linux    | Node    | ✅ No impact | PowerShellExecutor never loaded on Linux               |
| Linux    | Bun     | ✅ No impact | PowerShellExecutor never loaded on Linux               |
| macOS    | Node    | ✅ No impact | PowerShellExecutor never loaded on macOS               |
| macOS    | Bun     | ✅ No impact | PowerShellExecutor never loaded on macOS               |

**Affected Commands**: Only PowerShell commands on Windows are affected by this fix, and only at the type level.

---

#### Issue 2: Spawn Options Mismatch (powershell-executor.ts)

| Platform | Runtime | Impact              | Details                                           |
| -------- | ------- | ------------------- | ------------------------------------------------- |
| Windows  | Node    | ✅ Fixes type error | Uses Bun.spawn directly (compatible with Windows) |
| Windows  | Bun     | ✅ Fixes type error | Uses Bun.spawn directly                           |
| Linux    | Node    | ✅ No impact        | Code path never executed                          |
| Linux    | Bun     | ✅ No impact        | Code path never executed                          |
| macOS    | Node    | ✅ No impact        | Code path never executed                          |
| macOS    | Bun     | ✅ No impact        | Code path never executed                          |

**Affected Commands**: Only PowerShell commands on Windows.

| Command                         | Before Fix    | After Fix | Notes                                |
| ------------------------------- | ------------- | --------- | ------------------------------------ |
| `powershell.exe -Command "..."` | ❌ Type error | ✅ Works  | Fixes spawn type incompatibility     |
| `pwsh -File script.ps1`         | ✅ Works      | ✅ Works  | No change (uses different code path) |
| `powershell.exe -NoProfile ...` | ✅ Works      | ✅ Works  | No change                            |

---

#### Issue 3: Export Mismatches (tool/index.ts)

| Platform | Runtime | Impact             | Details                                        |
| -------- | ------- | ------------------ | ---------------------------------------------- |
| All      | All     | ⚠️ Export path fix | Only affects barrel exports, no runtime change |

**Affected Commands**: None directly. This is a code organization fix.

| Export               | Before        | After           | Impact                               |
| -------------------- | ------------- | --------------- | ------------------------------------ |
| `tempFileManager`    | ❌ Wrong path | ✅ Correct path | Windows PowerShell temp file cleanup |
| `powershellExecutor` | ❌ Wrong path | ✅ Correct path | Windows PowerShell execution         |
| `BashTool`           | ✅ Works      | ✅ Works        | No change                            |
| `detectCommandShell` | ✅ Works      | ✅ Works        | No change                            |
| `parseCommand`       | ✅ Works      | ✅ Works        | No change                            |

---

#### Issue 4: Subprocess.terminate (shell.ts)

| Platform | Runtime | Impact         | Details                              |
| -------- | ------- | -------------- | ------------------------------------ |
| Windows  | Node    | ✅ Fixes error | `proc.kill()` works on all platforms |
| Windows  | Bun     | ✅ Fixes error | `proc.kill()` is Bun's correct API   |
| Linux    | Node    | ✅ No change   | `kill()` works identically           |
| Linux    | Bun     | ✅ No change   | `kill()` works identically           |
| macOS    | Node    | ✅ No change   | `kill()` works identically           |
| macOS    | Bun     | ✅ No change   | `kill()` works identically           |

**Affected Commands**: All commands that use `Shell.killTree()` for timeout/abort handling.

| Command              | Before        | After    | Notes                                     |
| -------------------- | ------------- | -------- | ----------------------------------------- |
| All timeout handling | ⚠️ Type error | ✅ Works | `proc.kill()` replaces `proc.terminate()` |
| All abort handling   | ⚠️ Type error | ✅ Works | `proc.kill()` replaces `proc.terminate()` |

---

#### Issue 5: Missing vitest (test files)

| Platform | Runtime | Impact                 | Details                               |
| -------- | ------- | ---------------------- | ------------------------------------- |
| All      | All     | ⚠️ Test infrastructure | Either install vitest or remove tests |

**Affected Commands**: None (test files only).

---

#### Issue 6: Global Type (lsp/server.ts) - PRE-EXISTING

| Platform | Runtime | Impact          | Details                      |
| -------- | ------- | --------------- | ---------------------------- |
| All      | All     | ⚠️ Pre-existing | Not related to Windows fixes |

**Affected Commands**: None directly. LSP server startup.

---

### Summary Impact by Command Type

#### cmd.exe Commands (Windows Only)

| Fix                | Impact                 | Status                     |
| ------------------ | ---------------------- | -------------------------- |
| Issue 1 (Logger)   | N/A                    | Not applicable             |
| Issue 2 (Spawn)    | N/A                    | Not applicable             |
| Issue 3 (Exports)  | ✅ Export paths fixed  | Improves code organization |
| Issue 4 (killTree) | ✅ `proc.kill()` works | Fixes timeout handling     |
| Issue 5 (vitest)   | N/A                    | Test files                 |
| Issue 6 (Global)   | ⚠️ Pre-existing        | LSP server                 |

**Examples**: `cmd.exe /c dir`, `cmd.exe /c echo hello`

#### PowerShell Commands (Windows Only)

| Fix                | Impact                 | Status                               |
| ------------------ | ---------------------- | ------------------------------------ |
| Issue 1 (Logger)   | ✅ Type fix            | Logging now type-safe                |
| Issue 2 (Spawn)    | ✅ Type fix            | Spawn now type-safe                  |
| Issue 3 (Exports)  | ✅ Export paths fixed  | PowerShellExecutor properly exported |
| Issue 4 (killTree) | ✅ `proc.kill()` works | Timeout handling fixed               |
| Issue 5 (vitest)   | N/A                    | Test files                           |
| Issue 6 (Global)   | ⚠️ Pre-existing        | LSP server                           |

**Examples**: `powershell.exe -Command "..."`, `pwsh -File script.ps1`

#### Git Commands (Cross-Platform)

| Fix                | Impact                 | Status                 |
| ------------------ | ---------------------- | ---------------------- |
| Issue 1 (Logger)   | N/A                    | Not applicable         |
| Issue 2 (Spawn)    | N/A                    | Not applicable         |
| Issue 3 (Exports)  | ✅ No impact           | Git uses shell wrap    |
| Issue 4 (killTree) | ✅ `proc.kill()` works | Timeout handling works |
| Issue 5 (vitest)   | N/A                    | Test files             |
| Issue 6 (Global)   | ⚠️ Pre-existing        | LSP server             |

**Examples**: `git status`, `git commit -m "..."`, `git clone ...`

#### Bash Commands (Linux/Mac + Git Bash on Windows)

| Fix                | Impact                 | Status                     |
| ------------------ | ---------------------- | -------------------------- |
| Issue 1 (Logger)   | N/A                    | Not applicable             |
| Issue 2 (Spawn)    | N/A                    | Not applicable             |
| Issue 3 (Exports)  | ✅ No impact           | BashTool properly exported |
| Issue 4 (killTree) | ✅ `proc.kill()` works | Timeout handling works     |
| Issue 5 (vitest)   | N/A                    | Test files                 |
| Issue 6 (Global)   | ⚠️ Pre-existing        | LSP server                 |

**Examples**: `ls -la`, `echo hello`, `cat file.txt` (Linux/Mac)

---

### Runtime Detection Strategy

The code uses runtime detection to determine which spawn API to use:

```typescript
const isBunRuntime = typeof Bun !== "undefined" && Bun.spawn !== undefined

if (isBunRuntime) {
  // Bun path: Bun.spawn({ cmd: [...] })
} else {
  // Node path: spawn(command, args)
}
```

This ensures:

- ✅ Windows + Bun: Uses Bun.spawn (native)
- ✅ Windows + Node: Falls back to child_process.spawn
- ✅ Linux + Bun: Uses Bun.spawn
- ✅ Linux + Node: Falls back to child_process.spawn
- ✅ macOS + Bun: Uses Bun.spawn
- ✅ macOS + Node: Falls back to child_process.spawn

---

### Testing Matrix

To verify all fixes work correctly, test the following combinations:

#### Must Test (Critical)

| Platform | Runtime | Command Type | Test Case                                  |
| -------- | ------- | ------------ | ------------------------------------------ |
| Windows  | Bun     | PowerShell   | `powershell -Command "Write-Host 'hello'"` |
| Windows  | Bun     | cmd          | `cmd /c echo hello`                        |
| Windows  | Bun     | Git          | `git status`                               |
| Windows  | Node    | PowerShell   | `powershell -Command "Write-Host 'hello'"` |
| Windows  | Node    | cmd          | `cmd /c echo hello`                        |
| Windows  | Node    | Git          | `git status`                               |

#### Should Test (Important)

| Platform | Runtime | Command Type | Test Case    |
| -------- | ------- | ------------ | ------------ |
| Linux    | Bun     | Bash         | `echo hello` |
| Linux    | Bun     | Git          | `git status` |
| Linux    | Node    | Bash         | `echo hello` |
| Linux    | Node    | Git          | `git status` |
| macOS    | Bun     | Bash         | `echo hello` |
| macOS    | Bun     | Git          | `git status` |
| macOS    | Node    | Bash         | `echo hello` |
| macOS    | Node    | Git          | `git status` |

---

### Edge Cases to Consider

1. **PowerShell with special characters**
   - Command: `powershell -Command "Write-Host 'Hello, World!'"`
   - Before: Quote corruption possible
   - After: Temp file execution prevents corruption

2. **Git on Windows with spaces in paths**
   - Command: `git commit -m "Fix issue"`
   - Before: May fail with spaces
   - After: Shell wrapping handles correctly

3. **Timeout handling on all platforms**
   - Command: `sleep 100` (Linux) / `ping -n 100 127.0.0.1` (Windows)
   - Before: Type error may prevent timeout
   - After: `proc.kill()` works on all platforms

4. **Bun vs Node spawn differences**
   - Bun: `{ cmd: string[] }`
   - Node: `{ command: string, args: string[] }`
   - Our fix: Use Bun.spawn directly for PowerShell (Windows-only)

## Typecheck Issues Summary

| Issue                     | File                     | Severity | Complexity | Status       |
| ------------------------- | ------------------------ | -------- | ---------- | ------------ |
| Logger type missing       | `powershell-executor.ts` | Medium   | Easy       | Pending      |
| Spawn options mismatch    | `powershell-executor.ts` | High     | Medium     | Pending      |
| Export mismatches         | `tool/index.ts`          | Medium   | Easy       | Pending      |
| Subprocess.terminate      | `shell.ts`               | Medium   | Easy       | Pending      |
| Missing vitest            | `test/*.test.ts`         | Low      | Easy       | Pending      |
| Global type used as value | `lsp/server.ts`          | Medium   | Medium     | Pre-existing |

---

## Issue 1: Logger Type Missing

**File**: `packages/opencode/src/tool/powershell-executor.ts`  
**Lines**: 59, 147  
**Error**: `Cannot find name 'Logger'`

### Problem

The `PowerShellExecutorOptions` interface and class declare a `logger` property with type `Logger`, but `Logger` is not imported from any module.

### Current Code

```typescript
export interface PowerShellExecutorOptions {
  tempFileManager: TempFileManager
  executable?: string
  defaultTimeout?: number
  executionPolicy?: "Bypass" | "RemoteSigned"
  logger?: Logger // ❌ Logger not defined
}
```

### Solution

Import the `Logger` type from the logging utility. Looking at `bash.ts`, it uses `Log` from `../util/log`:

```typescript
import { Log } from "../util/log"

// Use Log type or define Logger as part of Log
export interface PowerShellExecutorOptions {
  // ... other options
  logger?: Log // ✅ Uses Log from util/log
}
```

### Implementation Steps

1. [ ] Import `Log` from `../util/log` in `powershell-executor.ts`
2. [ ] Change `logger?: Logger` to `logger?: Log` in `PowerShellExecutorOptions` interface
3. [ ] Change `private logger?: Logger` to `private logger?: Log` in `PowerShellExecutor` class
4. [ ] Verify the change doesn't break existing code

### Cross-Platform Impact

- ✅ Linux/Mac: No impact (PowerShellExecutor only loaded on Windows)
- ✅ Windows: No functional change, just type fix

---

## Issue 2: Spawn Options Mismatch

**File**: `packages/opencode/src/tool/powershell-executor.ts`  
**Lines**: 28, 312-316  
**Error**: Type incompatibility between Bun and Node spawn options

### Problem

The code uses Node.js `child_process.spawn` with Bun's `spawn` API types. Bun's `spawn` uses `{ cmd: string[] }` while Node uses `{ command: string, args: string[] }`.

### Current Code

```typescript
async function getSpawn(): Promise<typeof import("bun").spawn> {
  if (isBunRuntime) {
    const bun = await import("bun")
    return bun.spawn
  } else {
    const { spawn } = await import("child_process")
    return spawn // ❌ Returns Node spawn with different signature
  }
}

// Later usage:
const proc = spawn({
  cmd: [this.executable, ...args], // Bun format
  stdout: "pipe",
  stderr: "pipe",
})
```

### Solution

Use conditional typing to handle both runtime spawn APIs correctly:

```typescript
import type { spawn as nodeSpawn } from "child_process"
import type Bun from "bun"

type SpawnFn = typeof nodeSpawn | typeof Bun.spawn

async function getSpawn(): Promise<SpawnFn> {
  if (isBunRuntime) {
    const bun = await import("bun")
    return bun.spawn
  } else {
    const { spawn } = await import("child_process")
    return spawn
  }
}

// Use type-safe spawn call
const spawnFn = await getSpawn()
const proc = spawnFn({
  cmd: [this.executable, ...args],
  stdout: "pipe" as const,
  stderr: "pipe" as const,
})
```

### Alternative Solution (Better)

Use Bun's spawn exclusively since the code is for PowerShell (Windows-only):

```typescript
// In executeFile method:
const proc = Bun.spawn({
  cmd: [this.executable, ...args],
  stdout: options?.captureOutput !== false ? "pipe" : "ignore",
  stderr: options?.captureOutput !== false ? "pipe" : "ignore",
})
```

This is simpler since PowerShellExecutor is Windows-only anyway.

### Implementation Steps

1. [ ] Remove the `getSpawn()` function and Node.js spawn import
2. [ ] Use Bun.spawn directly (since PowerShell is Windows-only)
3. [ ] Update spawn options to match Bun's API exactly
4. [ ] Remove unused `child_process` import

### Cross-Platform Impact

- ✅ Linux/Mac: No impact (PowerShellExecutor never loaded)
- ✅ Windows: No functional change, just type fix

---

## Issue 3: Export Mismatches

**File**: `packages/opencode/src/tool/index.ts`  
**Lines**: 18  
**Error**: Module has no exported member

### Problem

The barrel export tries to export `tempFileManager` and `powershellExecutor` from `./bash`, but these are defined in separate modules:

```typescript
export { BashTool, tempFileManager, powershellExecutor, detectCommandShell, parseCommand } from "./bash"
//                                                                 ^^^^^^^^^^^^^^^^^^^^ Not in bash.ts
//                                                                 ^^^^^^^^^^^^^^^^^^^ From ./powershell-executor
```

### Current Exports in bash.ts

```typescript
export const BashTool
export function detectCommandShell
export function parseCommand
export function disposePowerShellExecutor
// tempFileManager and powershellExecutor are NOT exported from bash.ts
```

### Solution

Fix the barrel exports to point to correct modules:

```typescript
export { BashTool, detectCommandShell, parseCommand } from "./bash"

// tempFileManager and powershellExecutor are Windows-only
export { tempFileManager } from "./temp-file-manager"
export { powershellExecutor } from "./powershell-executor"
```

### Implementation Steps

1. [ ] Remove `tempFileManager` and `powershellExecutor` from bash export
2. [ ] Add separate exports from their correct modules
3. [ ] Verify all exports exist in their source modules

### Cross-Platform Impact

- ✅ All platforms: No functional change, just export path fix

---

## Issue 4: Subprocess.terminate Not Exists

**File**: `packages/opencode/src/shell/shell.ts`  
**Line**: 34  
**Error**: Property 'terminate' does not exist on type 'Subprocess'

### Problem

The code calls `proc.terminate()` but Bun's Subprocess type doesn't have this method. It should use `proc.kill()`.

### Current Code

```typescript
// In Shell.killTree or similar
proc.terminate() // ❌ terminate doesn't exist
```

### Solution

Use `proc.kill()` which is the cross-platform way to terminate processes:

```typescript
proc.kill() // ✅ Works on both Bun and Node
```

Or with a signal:

```typescript
proc.kill("SIGTERM") // More explicit
```

### Implementation Steps

1. [ ] Find all instances of `proc.terminate()`
2. [ ] Replace with `proc.kill()` or `proc.kill('SIGTERM')`
3. [ ] Verify the kill behavior is correct

### Cross-Platform Impact

- ✅ Linux/Mac: `kill()` works identically
- ✅ Windows: `kill()` works correctly for process termination

---

## Issue 5: Missing vitest

**Files**: `test/tool/bash-parse.test.ts`, `test/tool/bash-stream.test.ts`, `test/tool/powershell-executor.test.ts`, `test/tool/temp-file-manager.test.ts`  
**Error**: Cannot find module 'vitest'

### Problem

Test files import `vitest` but it's not installed or not in tsconfig includes.

### Solution

Choose one:

1. Install `vitest` as a dev dependency
2. Remove unused test files
3. Wrap vitest imports in conditional checks

### Recommended Approach

Since these test files may be incomplete or abandoned, we should either:

- Remove them if not being used
- Install vitest properly

### Cross-Platform Impact

- ✅ All platforms: No impact

---

## Issue 6: Global Type Used as Value (Pre-existing)

**File**: `packages/opencode/src/lsp/server.ts`  
**Error**: 'Global' only refers to a type, but is being used as a value

### Note

This is NOT related to Windows fixes - it's a pre-existing issue in the LSP server code. Should be addressed separately.

---

## Implementation Order

### Phase 1: Critical (Blocking)

1. Fix Logger type missing (Issue 1)
2. Fix spawn options mismatch (Issue 2)
3. Fix export mismatches (Issue 3)

### Phase 2: Important (Warnings)

4. Fix Subprocess.terminate (Issue 4)
5. Address missing vitest (Issue 5)

### Phase 3: Separate Task

6. Fix Global type issue in LSP (Issue 6) - Pre-existing, not Windows-related

---

## Testing Strategy

After implementing fixes:

1. Run `bun turbo typecheck` to verify all errors are resolved
2. Test PowerShell execution on Windows:
   - Simple commands
   - Commands with quotes
   - Timeout handling
3. Test bash execution on Linux/Mac to ensure no regression
4. Verify no new linting errors

---

## Notes

- All fixes maintain cross-platform compatibility
- PowerShellExecutor is Windows-only (guarded by `process.platform === 'win32'`)
- Changes to PowerShellExecutor won't affect Linux/Mac builds
- Bun and Node.js spawn APIs are converging but have subtle differences

---

## Related Files

- `packages/opencode/src/tool/powershell-executor.ts`
- `packages/opencode/src/tool/bash.ts`
- `packages/opencode/src/tool/index.ts`
- `packages/opencode/src/shell/shell.ts`
- `packages/opencode/src/util/log.ts`
