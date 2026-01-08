# Windows Command Execution - Detailed Restoration Plan

## Current State Analysis

### What's Broken
1. **WASM Import Error** (line 46): `calloc must be callable`
2. **PowerShell routing** is broken/incomplete
3. **Shell execution disabled** until fixed

### Original Working Code (Reference)

The original bash.ts had:
- Line 44-54: WASM import using `web-tree-sitter/tree-sitter-bash.wasm`
- Stream reading with proper Promise.all handling
- Single abort handler

## Detailed Restoration Steps

### Step 1: Fix WASM Import (Line 46)

**Current (Broken):**
```typescript
const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = resolveWasm(bashWasm)
  await Parser.init({
    locateFile() {
      return bashPath
    },
  })
  const bashLanguage = await Language.load(bashPath)
  const p = new Parser()
  p.setLanguage(bashLanguage)
  return p
})
```

**Restore To:**
```typescript
const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const bashLanguage = await Language.load(treePath)
  const p = new Parser()
  p.setLanguage(bashLanguage)
  return p
})
```

**Key Changes:**
- `bashWasm` → `treeWasm`
- `bashPath` → `treePath`
- Import path: `tree-sitter-bash/...` → `web-tree-sitter/...`

### Step 2: Verify Stream Reading Race Condition Fix (Issue #3)

**Required Code (Lines 388-437):**
```typescript
// Stream reader approach for cross-platform compatibility
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
    // Stream reading ended (abort or natural completion)
  }
}

// ... timeout and abort setup ...

// Start reading streams
const stdoutPromise = readOutput(stdoutReader)
const stderrPromise = readOutput(stderrReader)

// Wait for process exit
await proc.exited

// Guarantee streams drain before returning (Issue #17 fix)
// This prevents data loss when proc.exited resolves before streams finish
await Promise.all([stdoutPromise, stderrPromise]).catch(() => {})
```

**Critical:** The `await Promise.all([stdoutPromise, stderrPromise])` must be present.

### Step 3: Verify Abort Listener Fix (Issue #4)

**Required Code (Lines 411-421):**
```typescript
// Handle abort before starting
if (ctx.abort.aborted) {
  aborted = true
  await kill()
}

const abortHandler = () => {
  aborted = true
  void kill()
}

ctx.abort.addEventListener("abort", abortHandler, { once: true })
```

**Critical:** Only ONE abort listener with `{ once: true }`.

### Step 4: Minimal PowerShell Fix

**Approach:** Use temp file for PowerShell commands on Windows

**Required Code:**

1. **Add imports at top:**
```typescript
import { TempFileManager } from "./temp-file-manager"
import { tmpdir } from "os"
```

2. **Add temp file manager instance:**
```typescript
// Temp file manager for PowerShell script execution
export const tempFileManager = new TempFileManager({ poolDir: tmpdir() })
```

3. **Add PowerShell detection:**
```typescript
function isPowerShellCommand(command: string): boolean {
  const lower = command.toLowerCase()
  return lower.includes("powershell") || lower.includes("pwsh")
}
```

4. **Add PowerShell routing in executeCommand (after command parsing):**
```typescript
// Issue #10 fix: PowerShell on Windows needs temp file approach
if (process.platform === "win32" && isPowerShellCommand(params.command)) {
  // Extract command arguments (skip 'powershell.exe' or 'powershell')
  const parsed = parseCommand(params.command)
  const commandString = parsed.args.join(" ")
  
  // Create temp file and execute
  const tempFile = await tempFileManager.create(commandString)
  try {
    const psProc = spawn("powershell", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", tempFile
    ], {
      cwd,
      env: buildGitEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    })
    
    // Read output
    const stdout = await new Response(psProc.stdout).text()
    const stderr = await new Response(psProc.stderr).text()
    const exitCode = await psProc.exited
    
    return {
      title: params.description,
      metadata: {
        output: stdout,
        exit: exitCode,
        description: params.description,
      },
      output: stdout,
    }
  } finally {
    await tempFileManager.cleanup(tempFile)
  }
}
```

### Step 5: Cleanup Process Exit

**Add at end of file:**
```typescript
// Cleanup temp files on process exit
if (typeof process !== "undefined") {
  process.on("exit", async () => {
    await tempFileManager.cleanupAll()
    tempFileManager.dispose()
  })
}
```

## File Changes Summary

### packages/opencode/src/tool/bash.ts

| Section | Change |
|---------|--------|
| Line 1-20 | Keep existing imports |
| Line 19-21 | Add TempFileManager import, tmpdir |
| Line 28-29 | Add tempFileManager instance |
| Line 44-54 | Fix WASM import (treeWasm, treePath, web-tree-sitter import) |
| Lines 185-188 | Add isPowerShellCommand function |
| Lines 388-437 | Ensure Promise.all for streams |
| Lines 411-421 | Ensure single abort handler |
| After line 293 | Add PowerShell routing block |
| End of file | Add process.exit cleanup handler |

### packages/opencode/src/tool/index.ts

```typescript
// Add exports if needed
export { TempFileManager } from "./temp-file-manager"
```

## What to Keep vs Remove

### Keep (Don't Delete)
- `temp-file-manager.ts` - Temp file management utility
- `powershell-executor.ts` - Standalone executor (may not need full integration)
- `detectCommandShell()` function
- `parseCommand()` function
- `resolveWindowsCommand()` function
- All stream reading code
- All abort handling code

### Remove (If Present)
- `powershellExecutor` instance
- `powershellExecutorReady` flag
- Complex PowerShell routing block (lines 303-333 in current broken version)
- Any duplicate helper functions

## Testing Checklist

### Critical Tests
1. [ ] `tauri dev` runs without WASM errors
2. [ ] `echo "hello"` works
3. [ ] `git status` works
4. [ ] Stream reading captures 100% of output
5. [ ] Abort handler works correctly

### PowerShell Tests
1. [ ] `powershell Write-Host "Test"` outputs "Test"
2. [ ] `powershell Get-Date` outputs current date
3. [ ] Multi-line PowerShell commands work
4. [ ] PowerShell with pipes works

### Edge Case Tests
1. [ ] Large output is captured completely
2. [ ] Commands with special characters work
3. [ ] Timeout handling works
4. [ ] Abort during execution works

## Rollback Plan

If PowerShell fix causes issues:

1. Comment out the PowerShell routing block
2. bash.ts will fall back to original behavior
3. Users can use `cmd /c` for Windows commands
4. Feature flag can be added later for gradual rollout

## References

- Issue #3: Stream reading - `Promise.all([stdoutPromise, stderrPromise])`
- Issue #4: Abort listeners - Single handler with `{ once: true }`
- Issue #10: PowerShell inline - Use `-File` with temp files
- Root cause: PowerShell `-Command` treats quoted strings as data

## Timeline

1. **Step 1-3**: Fix WASM and verify existing fixes - 5 minutes
2. **Step 4**: Add minimal PowerShell routing - 10 minutes
3. **Step 5**: Add cleanup handlers - 5 minutes
4. **Testing**: Full test suite - 10 minutes

**Total estimated time: 30 minutes**
