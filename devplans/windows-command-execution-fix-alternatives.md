# Windows Command Execution - Alternative Fixes Analysis

## Executive Summary

After analyzing multiple fix options, **using `-File` with temp scripts** is the most reliable solution.

---

## Fix Options Compared

### Option 1: Remove -Command Flag

```bash
# Current (broken):
powershell -Command "Write-Host 'Test'"

# Alternative:
powershell Write-Host 'Test'
```

| Aspect | Rating |
|--------|--------|
| Reliability | ⭐⭐⭐ Medium |
| Complexity | Low |
| Performance | High |
| Maintenance | Easy |

**Problem**: May not work for commands with embedded quotes.

---

### Option 2: -EncodedCommand (Base64)

```bash
# Base64 of "Write-Host 'Test'" (UTF-16LE)
powershell -EncodedCommand VwByAGkAdABlAC0ASABvAHMAdAAgACcAVABlAHcAcwBcACcA
```

| Aspect | Rating |
|--------|--------|
| Reliability | ⭐⭐⭐⭐ High |
| Complexity | Medium (encoding) |
| Performance | Medium |
| Maintenance | Hard |

**Problems**:
- PowerShell requires UTF-16LE Base64 (not standard UTF-8)
- Harder to debug
- Adds encoding/decoding overhead

---

### Option 3: -File with Temp Script (RECOMMENDED)

```powershell
# Write command to temp file
echo "Write-Host 'Test'; Get-Date" > temp-abc.ps1

# Execute with -File
powershell -File temp-abc.ps1
```

| Aspect | Rating |
|--------|--------|
| Reliability | ⭐⭐⭐⭐⭐ Highest |
| Complexity | Medium |
| Performance | Medium |
| Maintenance | Easy |

**Advantages**:
- ✅ `-File` parameter is designed for scripts
- ✅ No quote wrapping issues
- ✅ Script blocks work correctly
- ✅ Complex multi-statement commands work
- ✅ Well-tested PowerShell feature
- ✅ Easy to implement and debug

---

### Option 4: Strip Extra Quotes

```typescript
function fixPowerShellCommand(cmd: string): string {
  return cmd.replace(
    /powershell(?:\.exe)?\s+-Command\s+""([^"]+)""/,
    'powershell -Command "$1"'
  );
}
```

| Aspect | Rating |
|--------|--------|
| Reliability | ⭐⭐ Low |
| Complexity | High |
| Performance | High |
| Maintenance | Hard |

**Problems**:
- Fragile - quote patterns vary
- Hard to cover all edge cases
- May break valid commands

---

## Final Recommendation

### Use Option 3: -File with Temp Scripts

This provides the best balance of reliability, maintainability, and correctness.

### Implementation Summary

| Component | Change |
|-----------|--------|
| TempFileManager | Create/delete .ps1 files |
| bash.ts | Route PowerShell -Command to temp files |
| Cleanup | Delete temp files after execution |

### Expected Results

| Issue | Before | After |
|-------|--------|-------|
| #10 Inline Execution | 25% | ~95% |
| #14 Script Blocks | 0% | ~95% |
| #1 Double-Wrapping | 38% | ~95% |
| #13 Shell Bypass | 50% | ~95% |

---

## Why This Works

PowerShell `-Command` has known quoting issues when passed through shell layers. The `-File` parameter:

1. Takes a file path (not a command string)
2. Reads and executes the file content
3. Completely bypasses the `-Command` quoting problem
4. Is the recommended PowerShell approach for scripts

### Reference
- [Microsoft: PowerShell -File vs -Command](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_command_syntax)
- `-File` is preferred for running scripts
- `-Command` is intended for inline expressions
