# Windows Command Execution Fix - COMPLETE HANDOFF DOCUMENT
## Agent Handoff Package for 100% Pass Rate Achievement

---

## CRITICAL NOTES BEFORE STARTING

### Unit Tests vs Integration Tests

**IMPORTANT**: Unit tests (`bash-windows.test.ts`) only verify **detection logic**, NOT actual execution behavior.

- ✅ Unit tests: 14/14 pass (detection logic works)
- ⚠️ Integration tests: 86/103 pass (83%) - **ACTUAL BUGS REMAIN**

**A fix is NOT verified until BOTH test prompts pass:**
1. `devplans/windows-command-execution-test-prompt.md` - Windows PS/CMD execution
2. `devplans/verified-fixes-test-prompt.md` - Edit tool and general fixes

---

## Executive Summary

**Current Status**: 83% pass rate (86/103 integration tests)  
**Target**: 100% pass rate  
**Issues to Fix**: 7 main issues (6 Windows + 1 Edit tool)

### Issues Breakdown

| # | Issue | Category | Status | Tests |
|---|-------|----------|--------|-------|
| 1 | cmd.exe wrapper corrupts PowerShell | Windows | ❌ BUG | 15 |
| 10 | -File parameter quote doubling | Windows | ❌ BUG | 21 |
| 13 | Shell bypass inconsistency | Windows | ❌ BUG | 13 |
| 14 | Script blocks need & | Windows | ⚠️ | 17 |
| 36 | Path escaping | Windows | ✅ WORKING | 12 |
| 37 | Batch files lose PATH | Windows | ⚠️ | 15 |
| 15 | Multiple match validation | Edit Tool | ❌ BUG | 5+ |

---

## Verification Criteria

### Before Implementing Any Fix

Run both test prompts and record baseline:

```powershell
# Test Prompt 1: Windows Command Execution
# File: devplans/windows-command-execution-test-prompt.md
# Expected: All commands execute, no command echoing

# Test Prompt 2: Verified Fixes Comprehensive
# File: devplans/verified-fixes-test-prompt.md
# Expected: All 10 categories pass
```

### After Implementing Fixes

**VERIFIED = ✅ ALL TESTS PASS** in both test prompts.

---

## Files to Modify

### Primary Files

| File | Issues | Purpose |
|------|--------|---------|
| `packages/opencode/src/tool/bash.ts` | #1, #10, #13, #14, #37 | Windows command execution |
| `packages/opencode/src/tool/edit.ts` | #15 | Multiple match validation |

### Test Files

| File | Purpose |
|------|---------|
| `packages/opencode/test/tool/bash-windows.test.ts` | Unit tests (detection logic) |
| `packages/opencode/test/tool/edit.test.ts` | Edit tool tests |

### Documentation Files (UPDATE AFTER FIXES)

| File | Action |
|------|--------|
| `devplans/windows-command-execution-issues.md` | Update status from 83% to 100% |
| `devplans/verified-fixes-summary.md` | Add #15 with full verification details |

---

## Implementation Steps

### Step 1: Fix cmd.exe Bypass for PowerShell (Issue #1, #13)

**File**: `packages/opencode/src/tool/bash.ts`  
**Function**: `resolveWindowsCommand()`  
**Lines**: 105-117

**Current Code**:
```typescript
function resolveWindowsCommand(command: string, shell: string): { cmd: string[]; useShell: boolean } {
  const shellName = path.basename(shell).toLowerCase()
  const flag = shellName.includes('cmd') ? '/c' : '-c'
  
  if (needsShellExecution(command)) {
    return { cmd: [shell, flag, command], useShell: true }
  }
  
  return { cmd: [command], useShell: false }
}
```

**Fixed Code**:
```typescript
function resolveWindowsCommand(command: string, shell: string): { cmd: string[]; useShell: boolean } {
  const shellType = detectCommandShell(command)
  
  // Native Windows commands bypass shell wrapper
  if (shellType === 'powershell' || shellType === 'pwsh' || shellType === 'cmd') {
    return { cmd: [command], useShell: false }
  }
  
  // For other commands, use shell wrapper
  const flag = shell.toLowerCase().includes('cmd') ? '/c' : '-c'
  return { cmd: [shell, flag, command], useShell: true }
}
```

**Why**: When `cmd /c powershell -Command "..."` is passed through cmd.exe wrapper, PowerShell receives quotes as DATA, not delimiters. Bypassing cmd.exe for native Windows commands fixes this.

---

### Step 2: Add Unified PowerShell Routing (Issue #10, #14)

**File**: `packages/opencode/src/tool/bash.ts`  
**Location**: After `getPowerShellExecutor()` (around line 257)

**New Function**:
```typescript
/**
 * Unified PowerShell command routing (v2.0)
 * Handles -Command, -File, script blocks, and arguments
 */
function routePowerShellCommand(command: string): { 
  cmd: string[]; 
  useExecutor: boolean; 
  direct?: boolean;
  tempCommand?: string;
} {
  // Extract PowerShell executable
  const parts = command.trim().split(/\s+/)
  const executable = parts[0] || 'powershell.exe'
  
  // Check for -Command parameter
  const commandMatch = command.match(/-Command\s+["'](.+?)["']/s);
  if (commandMatch) {
    const commandContent = commandMatch[1];
    
    // Detect bare script block (needs & wrapper)
    if (/^\s*\{/.test(commandContent) && !/^\s*&\s*\{/.test(commandContent)) {
      const wrappedCommand = `& ${commandContent}`;
      return {
        cmd: [executable, '-NoProfile', '-Command', wrappedCommand],
        useExecutor: false,
        direct: true
      };
    }
    
    // Use PowerShellExecutor for complex commands
    return { 
      cmd: [commandContent], 
      useExecutor: true,
      tempCommand: commandContent 
    };
  }
  
  // Check for -File parameter
  const fileMatch = command.match(/-File\s+["'](.+?)["']/s);
  if (fileMatch) {
    const filePath = fileMatch[1];
    return {
      cmd: [executable, '-NoProfile', '-File', filePath],
      useExecutor: false,
      direct: true
    };
  }
  
  // No special parameters - direct execution
  const args = parts.slice(1);
  return {
    cmd: [executable, ...args],
    useExecutor: false,
    direct: true
  };
}
```

---

### Step 3: Fix parseCommand() for Batch Files (Issue #37)

**File**: `packages/opencode/src/tool/bash.ts`  
**Function**: `parseCommand()`  
**Lines**: 148-198

**Changes**:
```typescript
export function parseCommand(command: string): { executable: string; args: string[]; shouldBypassShell: boolean } {
  const trimmed = command.trim()
  const shellType = detectCommandShell(trimmed)

  // CMD commands
  if (shellType === 'cmd') {
    const parts = trimmed.split(/\s+/)
    const executable = parts[0] || 'cmd.exe'
    const args = parts.slice(1)
    
    // Check if this is a batch file
    const isBatchFile = executable.endsWith('.bat') || executable.endsWith('.cmd')
    
    if (isBatchFile && process.platform === "win32") {
      // Route through PowerShell wrapper with argument quoting
      const batchArgs = args.length > 0 
        ? ` ${args.map(arg => /^[a-zA-Z0-9_\-\.]+$/.test(arg) ? arg : `'${arg}'`).join(' ')}`
        : ''
      return {
        executable: 'powershell.exe',
        args: ['-NoProfile', '-Command', `& '${executable}'${batchArgs}`],
        shouldBypassShell: false
      }
    }
    
    return { executable, args, shouldBypassShell: true }
  }

  // PowerShell commands
  if (shellType === 'powershell' || shellType === 'pwsh') {
    return {
      executable: trimmed.split(/\s+/)[0] || 'powershell.exe',
      args: [],
      shouldBypassShell: false
    }
  }

  // Shell built-ins, git, npm
  if (needsShellExecution(trimmed) || 
      trimmed.startsWith('git ') || 
      trimmed.startsWith('git.') || 
      trimmed.startsWith('npm ') || 
      trimmed.startsWith('npm.')) {
    return { executable: command, args: [], shouldBypassShell: false }
  }

  // Simple commands
  return { executable: command, args: [], shouldBypassShell: true }
}
```

---

### Step 4: Simplify execute() Flow

**File**: `packages/opencode/src/tool/bash.ts`  
**Lines**: 361-408

**Complete Replacement**:
```typescript
// Resolve command for Windows compatibility
const parsed = parseCommand(params.command)
const shellType = detectCommandShell(params.command)
let cmd: string[]
let psExecutorUsed = false

// PowerShell routing (Windows only)
if (process.platform === "win32" && (shellType === 'powershell' || shellType === 'pwsh')) {
  const routing = routePowerShellCommand(params.command)
  
  if (routing.useExecutor) {
    // Use PowerShellExecutor for -Command
    const executor = getPowerShellExecutor()
    const result = await executor.execute(routing.tempCommand!)
    return {
      title: params.description,
      metadata: {
        output: result.stdout,
        exit: result.exitCode,
        description: params.description,
      },
      output: result.stdout,
    }
  } else if (routing.direct) {
    cmd = routing.cmd
  }
}

// CMD/batch file routing
if (!cmd && process.platform === "win32") {
  if (parsed.shouldBypassShell) {
    cmd = [parsed.executable, ...parsed.args]
  } else {
    const { cmd: shellCmd } = resolveWindowsCommand(params.command, shell)
    cmd = shellCmd
  }
} else if (!cmd) {
  const { cmd: shellCmd } = resolveWindowsCommand(params.command, shell)
  cmd = shellCmd
}
```

---

### Step 5: Fix Edit Tool Multiple Match (Issue #15)

**File**: `packages/opencode/src/tool/edit.ts`  
**Function**: `replace()`  
**Lines**: 728-740 (add pre-validation)

**Add at the beginning of `replace()` function**:
```typescript
export function replace(content: string, oldString: string, newString: string, replaceAll = false, replaceFirst = false): string {
  if (oldString === newString) {
    throw new Error("oldString and newString must be different")
  }

  // NEW: Pre-validation for multiple matches
  let totalMatchCount = 0
  let searchPos = 0
  while (searchPos < content.length) {
    const index = content.indexOf(oldString, searchPos)
    if (index === -1) break
    totalMatchCount++
    searchPos = index + 1
  }

  // FIXED: Throw error when multiple matches exist without replaceFirst/replaceAll
  if (totalMatchCount > 1 && !replaceAll && !replaceFirst) {
    throw new Error(
      `Found multiple matches (${totalMatchCount}) for oldString. ` +
      `Use replaceFirst=true to replace only the first occurrence, ` +
      `or provide more context in oldString to make the match unique.`
    )
  }

  // ... rest of existing implementation ...
```

---

## Testing Instructions

### Phase 1: Run Unit Tests

```bash
cd packages/opencode
bun test test/tool/bash-windows.test.ts
bun test test/tool/edit.test.ts
```

**Expected**: All unit tests pass (14/14 for bash, edit tests pass)

### Phase 2: Run Integration Tests (Windows Only)

Execute both test prompts on a Windows system:

#### Test Prompt 1: `devplans/windows-command-execution-test-prompt.md`

Run all commands and verify:
- `powershell -Command "Write-Host 'Test'"` outputs `Test` (not the command string)
- `cmd /c echo hello` outputs `hello`
- Script blocks with `& { }` execute correctly

#### Test Prompt 2: `devplans/verified-fixes-test-prompt.md`

Verify all 10 categories pass:
1. Environment Variables (git commands)
2. Stream Reading (no data loss)
3. Abort Signal Handling (no duplicate listeners)
4. Stream Draining (Promise.all works)
5. Shell Bypass (direct execution works)
6. Server Initialization (no race conditions)
7. Edit Validation (empty string rejected)
8. Multiple Match Handling (error on multiple matches)
9. Unicode Character Matching (smart quotes, etc.)
10. Multi-line Empty Lines (patterns with empty lines)

### Phase 3: Record Results

Update `devplans/windows-command-execution-issues.md`:
- Change "Integration Test Pass Rate" from 83% to 100%
- Update each issue status from ❌ to ✅

Update `devplans/verified-fixes-summary.md`:
- Add Issue #15 with full verification details
- Include test results from `verified-fixes-test-prompt.md`

---

## Rollback Plan

If any fix causes regressions:

| Fix | Rollback Action |
|-----|-----------------|
| #1 cmd.exe bypass | Revert `resolveWindowsCommand()` to original |
| #10 -File handling | Remove `-File` case from `routePowerShellCommand()` |
| #14 Script block | Remove auto-wrap logic |
| #37 Batch routing | Revert `parseCommand()` batch detection |
| #15 Edit tool | Remove pre-validation block |

---

## Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| Implementation | 2 hours | All code changes |
| Unit Tests | 10 minutes | Run and verify pass |
| Integration Tests | 30 minutes | Run both test prompts |
| Documentation | 15 minutes | Update status files |
| **Total** | **~4 hours** | |

---

## Success Criteria

**100% PASS RATE** achieved when:

1. ✅ Unit tests: 14/14 pass (`bash-windows.test.ts`)
2. ✅ Integration tests: 103/103 pass (`windows-command-execution-test-prompt.md`)
3. ✅ Edit tool tests: All pass (`verified-fixes-test-prompt.md`)
4. ✅ Documentation updated with final status

---

## Key Test Cases to Verify

### Windows Command Execution

| Command | Expected Output | Status |
|---------|-----------------|--------|
| `powershell -Command "Write-Host 'Test'"` | `Test` | ✅ |
| `powershell -NoProfile -File "C:\path\file.ps1"` | Script output | ✅ |
| `powershell -Command "& { Write-Host 'Block' }"` | `Block` | ✅ |
| `powershell -Command "{ Write-Host 'X' }"` | `X` (auto-&) | ✅ |
| `powershell -Command "& 'C:\path\batch.bat'"` | Batch output | ✅ |

### Edit Tool

| Test | Expected | Status |
|------|----------|--------|
| Multiple matches, no flag | Error message | ✅ |
| Multiple matches, replaceFirst=true | First replaced | ✅ |
| Single match | Replaced | ✅ |
| Unicode patterns | Matched | ✅ |

---

## Handoff Checklist

- [ ] All 7 issues addressed in code
- [ ] Unit tests pass (14/14)
- [ ] Windows integration tests pass (103/103)
- [ ] Edit tool tests pass
- [ ] `devplans/windows-command-execution-issues.md` updated to 100%
- [ ] `devplans/verified-fixes-summary.md` updated with Issue #15

---

## Root Cause Analysis

### Issue #1: cmd.exe Wrapper Corruption

When `cmd /c` wraps PowerShell commands, the command string is passed as DATA to PowerShell, not as CODE to execute.

**Example**:
```
Input: powershell -Command "Write-Host 'Test'"
Passed to cmd.exe: cmd /c powershell -Command "Write-Host 'Test'"
Result: PowerShell outputs the command string instead of executing it
```

**Fix**: Bypass cmd.exe wrapper for native Windows commands (powershell, pwsh, cmd).

### Issue #10: -File Parameter Quote Doubling

The bash wrapper doubles quotes around file paths, creating `'"path"'` which PowerShell rejects.

**Example**:
```
Input: powershell -File "C:\path\file.ps1"
Bash processing: powershell -File ""C:\path\file.ps1""
PowerShell error: Illegal characters in path
```

**Fix**: Extract -File path and execute directly without shell wrapper.

### Issue #37: Batch Files Lose PATH Context

When bash invokes cmd.exe to run batch files, the PATH context is lost and cmd.exe cannot resolve the batch file location.

**Example**:
```
cmd /c "C:\temp\batch.bat"
Error: '"C:\temp\batch.bat"' is not recognized
```

**Fix**: Route batch files through PowerShell wrapper: `powershell -Command "& 'batch.bat'"`

### Issue #15: Multiple Match Validation Missing

The edit tool's `replace()` function lacks pre-validation for multiple matches when `replaceFirst=false`.

**Example**:
```
File: apple banana apple cherry apple
Edit: replace "apple" with "X" (no replaceFirst)
Expected: Error - multiple matches found
Actual: Silently replaces LAST "apple" with "X"
```

**Fix**: Add match-count validation before any replacement.

---

## Document References

### Related Files

| File | Purpose |
|------|---------|
| `packages/opencode/src/tool/bash.ts` | Main file for Windows command execution |
| `packages/opencode/src/tool/powershell-executor.ts` | PowerShell execution via temp files |
| `packages/opencode/src/tool/edit.ts` | Edit tool with replace() function |
| `packages/opencode/test/tool/bash-windows.test.ts` | Unit tests for bash detection |
| `packages/opencode/test/tool/edit.test.ts` | Unit tests for edit tool |
| `devplans/windows-command-execution-issues.md` | Issue analysis and status |
| `devplans/verified-fixes-summary.md` | List of all verified fixes |
| `devplans/windows-command-execution-test-prompt.md` | Windows test commands |
| `devplans/verified-fixes-test-prompt.md` | Comprehensive test suite |

---

## Additional Context from Investigation

### PowerShellExecutor Design (Already Working)

The `PowerShellExecutor` class in `powershell-executor.ts` is well-designed and handles:
- Temp file creation/cleanup
- Retry logic with exponential backoff
- Execution metrics
- Timeout handling
- NoProfile and ExecutionPolicy options

It is used for `-Command` routing and works correctly.

### tree-sitter Parsing Impact

Complex PowerShell commands with special characters (like `&`) might be split incorrectly by tree-sitter parsing. The PowerShellExecutor mitigates this by writing commands to temp files, avoiding tree-sitter issues.

### Script Block Behavior

PowerShell treats `{ }` as a script block DATA TYPE, not executable code. The call operator `&` is required to invoke script blocks. This is expected PowerShell behavior, not a bug. The fix auto-wraps bare script blocks with `&`.

---

## Verification Before Implementation

Before making any changes, run these commands to establish baseline:

```bash
# Run unit tests
cd packages/opencode
bun test test/tool/bash-windows.test.ts

# Check current pass rate
# Document in devplans/windows-command-execution-issues.md
# Current: 14/14 unit tests pass, 86/103 integration tests pass
```

---

## Final Notes

1. **Unit tests verify detection logic only** - They do NOT verify actual command execution
2. **Integration tests verify actual behavior** - These are the tests that matter for 100% pass rate
3. **Update documentation after fixing** - Both `windows-command-execution-issues.md` and `verified-fixes-summary.md` need updates
4. **Test on Windows** - Some tests are platform-specific and require Windows to verify

---

**Document Version**: 3.0  
**Created**: January 8, 2026 23:24 UTC  
**Updated**: January 8, 2026 23:30 UTC  
**Status**: READY FOR IMPLEMENTATION

---

## Quick Reference: Code Locations

| Function | File | Lines |
|----------|------|-------|
| `resolveWindowsCommand()` | bash.ts | 105-117 |
| `routePowerShellCommand()` | bash.ts | NEW (after 257) |
| `parseCommand()` | bash.ts | 148-198 |
| `execute()` flow | bash.ts | 361-408 |
| `replace()` | edit.ts | 728-806 |

---

## End of Handoff Document
