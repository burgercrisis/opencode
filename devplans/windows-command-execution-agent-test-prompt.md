# Windows Command Execution Test Agent Prompt

## Your Task

You are a testing agent. Your goal is to run commands on your system and identify Windows PowerShell/CMD execution issues.

## Instructions

1. Run each command in Test Cases below on your Windows system
2. Record the exit code and output for each command
3. Determine if the command **executed** (produced expected result) or **failed** (echoed command or errored)
4. Report your findings using the Results Template

---

## Test Cases

Run these commands exactly as written and record results:

### Group A: Basic PowerShell -Command Tests
```
powershell -NoProfile -Command "Write-Host 'TestA1'"
powershell -NoProfile -Command "Get-Date | Out-String"
powershell -NoProfile -Command "1 + 1"
```

### Group B: Unquoted Command Tests (Workaround)
```
powershell -NoProfile -Command Write-Host TestB1
powershell -NoProfile -Command Get-Date | Out-String
powershell -NoProfile -Command $x=1; Write-Host $x
```

### Group C: Script Block Tests
```
powershell -NoProfile -Command "& { Write-Host 'Block1' }"
powershell -NoProfile -Command "if (1 -eq 1) { Write-Host 'True' }"
powershell -NoProfile -Command "$env:USERNAME"
```

### Group D: CMD Tests (Baseline - Should Work)
```
cmd /c echo HelloWorld
cmd /c dir
cmd /c echo %username%
```

### Group E: -File Parameter Tests (Workaround)
```
# Create test file first
echo 'Write-Host "FileTest"' > C:\temp\test-script.ps1

# Then execute
powershell -NoProfile -File "C:\temp\test-script.ps1"
```

---

## Results Template

Copy and fill this table:

| Command | Exit Code | stdout | Executed? | Notes |
|---------|-----------|--------|-----------|-------|
| `powershell -Command "Write-Host 'TestA1'"` | ? | ? | ✅/❌ | |
| `powershell -Command Get-Host TestB1` | ? | ? | ✅/❌ | |
| `powershell -Command "& { Write-Host 'Block1' }"` | ? | ? | ✅/❌ | |
| `cmd /c echo HelloWorld` | ? | ? | ✅/❌ | |
| `powershell -File "C:\temp\test-script.ps1"` | ? | ? | ✅/❌ | |

---

## Interpretation Guide

**PASS (✅)** = Command executed correctly and produced expected output

**FAIL (❌)** = One of these occurred:
- Command echoed the command string as output instead of executing
- Error occurred
- Wrong output produced

**Example of FAIL**:
- Command: `powershell -Command "Write-Host 'Test'"`
- stdout: `Write-Host 'Test'` (echoed, not executed)
- Exit code: `0` (looks successful but didn't run)

**Example of PASS**:
- Command: `powershell -Command Write-Host Test`
- stdout: `Test` (actual output)
- Exit code: `0`

---

## Pass Rate Calculation

Count your results:
- Total tests: ___
- Passed: ___
- Failed: ___
- **Pass Rate**: ___%

---

## Issue Identification

Based on your results, identify which issues exist:

| Issue | Symptom | Found? |
|-------|---------|--------|
| #10 PowerShell inline execution | `-Command "..."` echoes instead of executing | Yes/No |
| #14 Script blocks | `& { ... }` treated as literal text | Yes/No |
| #36 Path escaping | `-File` paths with backslashes fail | Yes/No |
| #37 Batch files | `cmd /c .bat` files fail | Yes/No |

---

## Root Cause Analysis

If you find that **quoted** PowerShell commands fail but **unquoted** commands work, the root cause is:

> PowerShell -Command treats quoted strings as data to output, not code to execute

**Evidence to look for**:
- `powershell -Command "Write-Host 'Test'"` outputs `Write-Host 'Test'` → FAIL
- `powershell -Command Write-Host Test` outputs `Test` → PASS

---

## Report Format

When finished, report:

1. **Pass Rate**: ___%
2. **Issues Found**: List any issues identified above
3. **Root Cause**: If PowerShell inline execution fails, describe the quoting issue
4. **Recommendations**: Suggest workarounds (unquoted commands, -File parameter)

---

## Example Report

```
PASS RATE: 41%

ISSUES FOUND:
- #10 PowerShell inline execution: YES (quoted commands echo)
- #14 Script blocks: YES (blocks treated as literals)
- #36 Path escaping: NO (-File works correctly)
- #37 Batch files: NO (CMD works correctly)

ROOT CAUSE:
PowerShell -Command with quoted strings echoes them instead of executing.
Workaround: Use unquoted commands or -File parameter.

RECOMMENDATIONS:
1. Use unquoted commands: powershell -Command Write-Host Test
2. Use -File parameter for complex scripts
3. Write script blocks to .ps1 files and execute with -File
```
