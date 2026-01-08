# Windows Command Execution Test Prompt

**Purpose**: Test Windows PowerShell and CMD command execution behavior

**Instructions**: Run each command below on a Windows system and record:
1. Exit code
2. stdout output
3. stderr output (if any)
4. Whether the command **executed** (did what was expected) or **echoed** (returned the command string as output)

---

## Test Commands

Run these commands and record results:

### Test Group 1: Basic PowerShell Execution
```
powershell -NoProfile -Command "Write-Host 'Test123'"
powershell -Command "Get-Date | Out-String"
powershell -Command "1 + 1"
```

### Test Group 2: CMD Execution (should work)
```
cmd /c echo HelloWorld
cmd /c dir
cmd /c echo %username%
```

### Test Group 3: Script Block Execution
```
powershell -Command "& { Write-Host 'Inside block' }"
powershell -Command "if (1 -eq 1) { Write-Host 'True' }"
powershell -Command "$x = 5; $x * 2"
```

### Test Group 4: Path Handling with Backslashes
```
powershell -Command "Write-Host 'C:\\Temp\\test.txt'"
powershell -Command "Test-Path 'C:\\Windows'"
powershell -Command "Get-ChildItem 'C:\\Program Files' | Out-Host"
```

### Test Group 5: Batch File Test
Create a simple batch file and execute it:
```
cmd /c echo @echo off > test.bat
cmd /c echo echo Hello from batch >> test.bat
cmd /c test.bat
```

### Test Group 6: Complex PowerShell Commands
```
powershell -Command "Get-Process | Select-Object -First 3 | Out-Host"
powershell -Command "Get-Service | Where-Object {$_.Status -eq 'Running'} | Out-Host"
powershell -Command "$env:USERNAME"
```

---

## Results Template

| Command | Exit Code | stdout | stderr | Executed? |
|---------|-----------|--------|--------|-----------|
| `powershell -Command "Write-Host 'Test123'"` | ? | ? | ? | ✅/❌ |
| `powershell -Command "Get-Date | Out-String"` | ? | ? | ? | ✅/❌ |
| `cmd /c echo HelloWorld` | ? | ? | ? | ✅/❌ |
| `cmd /c dir` | ? | ? | ? | ✅/❌ |
| `powershell -Command "& { Write-Host 'Inside' }"` | ? | ? | ? | ✅/❌ |
| `powershell -Command "if (1-eq 1) { Write-Host 'True' }"` | ? | ? | ? | ✅/❌ |
| `powershell -Command "Write-Host 'C:\\Temp\\test.txt'"` | ? | ? | ? | ✅/❌ |
| `powershell -Command "Test-Path 'C:\\Windows'"` | ? | ? | ? | ✅/❌ |
| `cmd /c test.bat` | ? | ? | ? | ✅/❌ |
| `powershell -Command "1 + 1"` | ? | ? | ? | ✅/❌ |

---

## Interpretation Guide

**Expected Behavior**:
- `powershell -Command "..."` should **execute** the command and return the result
- `cmd /c ...` should **execute** the command and return the result
- Exit code should be 0 for successful commands

**Problem Signs** (indicating bugs exist):
- Command outputs the command string itself (e.g., `Write-Host 'Test123'` instead of `Test123`)
- Exit code 0 but output is the command string
- Script blocks output as literal text

**Pass Criteria**:
- ✅ All PowerShell commands execute and produce expected output
- ✅ No commands echo their input strings
- ✅ All exit codes are correct (0 for success)

---

## Quick Test (Minimum Viable)

If limited time, test these 3 commands:
1. `powershell -NoProfile -Command "Write-Host 'Hello'"`
2. `cmd /c echo World`
3. `powershell -Command "$x = 2; $x * 3"`

Record whether each command **executed** (produced expected output) or **echoed** (returned the command string).
