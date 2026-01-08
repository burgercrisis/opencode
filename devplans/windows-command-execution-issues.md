# Windows Command Execution - Issue Analysis & Fix Plan

## Status (January 8, 2026)
- **Test Pass Rate**: 41% → 78% (60 tests, 47 pass, 13 fail)
- **Current Improvement**: Using PowerShellExecutor for -Command routing
- **Root Cause**: Shell wrapper quote parsing - outer quotes become part of command text
- **Remaining Issue**: Commands with outer quotes fail because quotes aren't stripped as delimiters

---

## Test Results Summary

| Issue | Before | After | Notes |
|-------|--------|-------|-------|
| #1 Double-Wrapping | 38% | 75% | Commands without quotes work perfectly |
| #10 Inline Execution | 25% | 80% | Simple commands pass when not quoted |
| #13 Shell Bypass | 50% | 100% | Fixed by PowerShellExecutor |
| #14 Script Blocks | 0% | 80% | Works when not quoted |
| #36 Path Escaping | - | 50% | Forward slashes work, quotes fail |
| #37 Batch Execution | - | 70% | Direct execution works |

**Key Finding**: Commands work perfectly when quotes are omitted. Commands fail when quotes are present around arguments.

---

## Root Cause Analysis

```
powershell -Command "Write-Host 'Test'"  # User intent
→ Shell wrapper receives: powershell -Command "Write-Host 'Test'"
→ Quotes NOT stripped: PowerShell sees quotes as part of command
→ Output: "Write-Host 'Test'" (literal text, not executed)
```

**The shell wrapper doesn't detect and strip outer quote boundaries.**

---

## Fix Strategy: Two-Pronged Approach

### 1. Current Fix (Working - 78% pass rate)
Use PowerShellExecutor for commands with `-Command "..."`:
- Extract command content from quotes
- Write to temp file
- Execute via `-File` parameter
- Works for PowerShell with -Command

### 2. Additional Fix Needed (for remaining 22%)
Fix shell wrapper quote parsing to strip outer quotes:
- Detect if entire command is wrapped in quotes
- Strip the outer quotes before passing to shell
- Preserve inner quoted arguments

---

## Implementation: Shell Wrapper Quote Stripping

### Where to Fix
In bash.ts, when building the command array, detect and strip outer quotes:

```typescript
function stripOuterQuotes(str: string): string {
  const trimmed = str.trim();
  // Check if string is entirely wrapped in matching quotes
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      // Verify quotes are matching (not escaped)
      let escaped = false;
      for (let i = 1; i < trimmed.length - 1; i++) {
        if (trimmed[i] === '\\' && !escaped) {
          escaped = true;
          continue;
        }
        if (trimmed[i] === first && !escaped) {
          // Found unescaped quote inside - not a simple wrap
          return trimmed;
        }
        escaped = false;
      }
      // Simple wrap - strip quotes
      return trimmed.slice(1, -1);
    }
  }
  return str;
}
```

### Apply to Shell Execution

```typescript
// When building cmd array for shell execution
const rawArgs = params.command.split(/\s+/);
const cleanArgs = rawArgs.map(arg => stripOuterQuotes(arg));
// Then join or pass as array
```

---

## Files to Change

| File | Action | Priority |
|------|--------|----------|
| `packages/opencode/src/tool/bash.ts` | Add quote stripping logic | P1 - Needed |
| `packages/opencode/src/tool/bash.ts` | Keep PowerShellExecutor routing | Already done |

---

## Expected Results After Quote Stripping Fix

| Issue | Current | After Fix |
|-------|---------|----------|
| #1 Double-Wrapping | 75% | ~95% |
| #10 Inline Execution | 80% | ~95% |
| #13 Shell Bypass | 100% | 100% |
| #14 Script Blocks | 80% | ~95% |
| #36 Path Escaping | 50% | ~95% |
| #37 Batch Execution | 70% | ~95% |
| **TOTAL** | **78%** | **~95%** |

---

## Rollback

If quote stripping breaks things:
1. Comment out quote stripping logic
2. Keep PowerShellExecutor routing (works for -Command)
3. Revert to pre-quote-stripping behavior

---

## Workaround (Current - Works)

Until shell wrapper is fixed, use unquoted syntax:
```powershell
powershell -Command Write-Host test  # Works
powershell -Command "Write-Host test"  # Fails
```

---

**Last Updated**: January 8, 2026 22:02 UTC - Updated with test results and shell wrapper quote stripping plan
