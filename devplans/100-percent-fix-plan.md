# Windows Desktop GUI - 100% Test Pass Rate Plan

## Current Status
- **Verified Fixes**: 10 issues (from verified-fixes-summary.md)
- **Goal**: 100% pass rate for all tests

---

## Critical Bug Found

### Issue: PowerShell parseCommand returns wrong bypass value

**Location**: [`packages/opencode/src/tool/bash.ts:146-157`](packages/opencode/src/tool/bash.ts#L146-L157)

**Problem**:
```typescript
// Current code returns shouldBypassShell: true
if (shellType === 'powershell' || shellType === 'pwsh') {
  return {
    executable,
    args,
    shouldBypassShell: true  // ❌ WRONG
  }
}
```

**Test expects** ([`bash-windows.test.ts:39`](packages/opencode/test/tool/bash-windows.test.ts#L39)):
```typescript
expect(result.shouldBypassShell).toBe(false)  // ✅ CORRECT
```

---

## Root Cause Analysis

The code and tests are out of sync. The test was updated to expect `false` (meaning use shell wrapper), but the code still returns `true` (bypass shell). This causes the test to fail.

**Why `shouldBypassShell: false` is correct**:
1. PowerShell commands need shell wrapper for proper argument parsing
2. Bypassing shell causes quote corruption issues
3. Shell wrapper handles special characters correctly

---

## Fix Required

### Fix 1: Correct parseCommand return value

**File**: `packages/opencode/src/tool/bash.ts`

**Change lines 146-157**:
```typescript
if (shellType === 'powershell' || shellType === 'pwsh') {
  const parts = trimmed.split(/\s+/)
  const executable = shellType === 'pwsh' ? 'pwsh' : 'powershell.exe'
  const args = parts.slice(1)

  return {
    executable,
    args,
    shouldBypassShell: false  // ✅ FIXED: Use shell wrapper
  }
}
```

### Fix 2: Update PowerShellExecutor routing

The current routing logic at lines 346-366 routes PowerShell commands through PowerShellExecutor when `-Command "..."` is detected. This is correct, but we need to ensure:

1. PowerShellExecutor handles all edge cases
2. Fallback execution uses shell wrapper when PowerShellExecutor isn't used

### Fix 3: Verify Stream Handling

The code already has proper stream handling (lines 418-468):
- ✅ Stream reader approach
- ✅ Promise.all for stdout/stderr
- ✅ Proper abort handling

---

## Additional Edge Cases to Handle

### Edge Case 1: PowerShell with flags before -Command
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "Write-Host Test"
```

**Current handling**: Should work via PowerShellExecutor
**Fix needed**: Verify flag parsing works correctly

### Edge Case 2: PowerShell without -Command
```powershell
powershell -NoProfile "Get-Process | Out-Host"
```

**Current handling**: Routes through normal execution (line 368-371)
**Fix needed**: Ensure shell wrapper is used (shouldBypassShell: false)

### Edge Case 3: Nested shells
```powershell
powershell -Command "cmd /c echo Hello"
```

**Current handling**: PowerShellExecutor routes this through temp file
**Fix needed**: Verify temp file approach handles nested commands

---

## Test Coverage

### Current tests in bash-windows.test.ts

| Test | Status | Notes |
|------|--------|-------|
| shell detection | ✅ | detectCommandShell works |
| command parsing | ❌ | parseCommand returns wrong value |
| basic echo | ✅ | Should pass |
| PowerShell detection | ✅ | Should pass |
| cmd.exe detection | ✅ | Should pass |
| git commands | ✅ | Uses shell wrapper |
| quote handling | ✅ | Should pass |

### Tests needing verification

1. **parseCommand uses shell wrapper for PowerShell** (line 37-42)
   - Currently fails due to wrong return value
   
2. **parseCommand uses shell wrapper for pwsh** (line 44-49)
   - Same issue

---

## Implementation Steps

### Step 1: Fix parseCommand return value
```typescript
// Line 155: change true to false
shouldBypassShell: false
```

### Step 2: Verify PowerShellExecutor handles all cases
- Ensure -Command with quotes works
- Ensure flags are preserved
- Ensure nested commands work

### Step 3: Run test suite
```powershell
cd packages/opencode
bun test test/tool/bash-windows.test.ts
```

### Step 4: Verify 100% pass rate
- All tests should pass
- Document any remaining edge cases

---

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `packages/opencode/src/tool/bash.ts` | Fix parseCommand return value (line 155) | P0 - Critical |
| `packages/opencode/test/tool/bash-windows.test.ts` | Verify tests pass | P1 |

---

## Expected Results

After fix:
- ✅ shell detection tests pass
- ✅ command parsing tests pass  
- ✅ all Windows execution tests pass
- ✅ **100% pass rate achieved**

---

## Verification Commands

```powershell
# Run Windows-specific tests
cd packages/opencode
bun test test/tool/bash-windows.test.ts

# Run all bash tests
bun test test/tool/bash.test.ts

# Run full test suite
bun test
```

---

## Risk Assessment

**Risk**: Low
**Reason**: Single line change that aligns code with test expectations
**Testing**: Comprehensive test coverage exists

---

**Last Updated**: 2026-01-08 23:03 UTC
**Status**: Ready for implementation
