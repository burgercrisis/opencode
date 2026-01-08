# Shell Bypass Test Prompt

## Purpose
Test shell bypass functionality on Windows to verify commands execute correctly in both CMD and PowerShell shells.

## Universal Prompt

```
You are a testing agent. Your task is to verify shell command execution on Windows.

## Test Procedure

Execute the following test commands and report results for each:

### CMD Shell Tests
1. `cmd /c echo HelloWorld`
   - Expected: Exit code 0, stdout "HelloWorld"
   
2. `cmd /c dir`
   - Expected: Exit code 0, stdout contains directory listing

### PowerShell Tests
3. `powershell -NoProfile -Command "Write-Host 'Test123'"`
   - Expected: Exit code 0, stdout "Test123"
   
4. `powershell -NoProfile -Command "Get-Date | Out-String"`
   - Expected: Exit code 0, stdout contains date output
   
5. `powershell -Command "echo test123"`
   - Expected: Exit code 0, stdout "test123"

## Report Format

For each command, report:
- Command
- Exit Code (0=pass, non-zero=fail)
- stdout (actual output)
- Result: PASS or FAIL

## Success Criteria
- All CMD tests: PASS
- All PowerShell tests: PASS
```

## Analysis of Current Test Results

| Test | Shell | Exit Code | stdout | Result |
|------|-------|-----------|--------|--------|
| cmd /c echo HelloWorld | CMD | 0 | HelloWorld | ✅ PASS |
| cmd /c dir | CMD | 0 | Directory listing | ✅ PASS |
| powershell -NoProfile -Command "Write-Host 'Test123'" | PS | 0 | Write-Host 'Test123' | ❌ FAIL |
| powershell -NoProfile -Command "Get-Date | Out-String" | PS | 0 | Get-Date \| Out-String | ❌ FAIL |
| powershell -Command "echo test123" | PS | 0 | echo test123 | ❌ FAIL |

## Conclusion

**Issue #1: Shell Bypass - PARTIALLY FIXED**

- ✅ CMD shell bypass: WORKING (commands execute correctly)
- ❌ PowerShell shell bypass: BROKEN (commands echo instead of execute)

The PowerShell commands return exit code 0 but stdout contains the raw command string rather than the expected output. This indicates the shell is not properly executing PowerShell commands - it's only parsing and echoing them back.

## Design Constraints Met

- ✅ No file/path references (universal)
- ✅ No function names (universal)
- ✅ No unit tests (agent IS the tester)
- ✅ No repository context (works standalone)
- ✅ Simple commands (tell agent what to run)
- ✅ Universal (works for any agent)
