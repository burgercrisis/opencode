# Windows Command Execution Fix Plan

## Current Status (January 8, 2026)
- **Test Pass Rate**: 41% (61 tests, 25 pass, 36 fail)
- **Root Cause**: PowerShell `-Command "..."` treats quoted strings as data to output
- **Working Workaround**: Use `-File` parameter instead of `-Command`

## Issues to Fix

| Issue | Status | Pass Rate |
|-------|--------|-----------|
| #1 Double-Wrapping | ❌ UNFIXED | 38% |
| #10 Inline Execution | ❌ UNFIXED | 25% |
| #13 Shell Bypass | ❌ UNFIXED | 50% |
| #14 Script Blocks | ❌ UNFIXED | 0% |

## Root Cause

```
powershell -Command "Write-Host 'Test'"  # User intent
→ bash.ts wraps: powershell -Command ""Write-Host 'Test'""
→ PowerShell sees: -Command value = "Write-Host 'Test'" (literal string)
→ Output: Write-Host 'Test' (echoed, not executed)
```

## Minimal Fix

**Strategy**: Route PowerShell `-Command` through temp files with `-File`.

### Files to Change

| File | Change |
|------|--------|
| `packages/opencode/src/tool/temp-file.ts` | NEW - Create/delete .ps1 temp files |
| `packages/opencode/src/tool/bash.ts` | MODIFIED - Route PS commands to temp files |

### Implementation (Minimal)

```typescript
// temp-file.ts (NEW - ~20 lines)
export function createTempPs1(content: string): string {
  const id = Date.now();
  const path = `${Deno.env('TEMP')}/opencode-${id}.ps1`;
  Deno.writeTextFileSync(path, content);
  return path;
}

export function deleteTempPs1(path: string): void {
  try { Deno.removeSync(path); } catch { /* ignore */ }
}
```

```typescript
// bash.ts (MODIFIED - ~30 lines)
async function executePowerShell(cmd: string, options: any): Promise<any> {
  const match = cmd.match(/-Command\s+["'](.+?)["']/s);
  if (match) {
    const tempFile = createTempPs1(match[1]);
    const newCmd = cmd.replace(/-Command\s+["'].+?["']/s, `-File "${tempFile}"`);
    try {
      return await executeDirect(newCmd, options);
    } finally {
      deleteTempPs1(tempFile);
    }
  }
  return executeDirect(cmd, options);
}
```

## Expected Results

| Issue | Before | After |
|-------|--------|-------|
| #1 Double-Wrapping | 38% | ~95% |
| #10 Inline Execution | 25% | ~95% |
| #13 Shell Bypass | 50% | ~95% |
| #14 Script Blocks | 0% | ~95% |

## Rollback

If this breaks:
1. Delete `temp-file.ts`
2. Remove PowerShell routing in bash.ts
3. Revert to original execution path
