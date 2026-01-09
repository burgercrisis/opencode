# Windows Command Execution Test Prompt

**Purpose**: Comprehensive test for an agent's ability to execute terminal commands on Windows systems. This tests your capability to successfully invoke and manage PowerShell, CMD, and other shell commands.

**Instructions**: For each test, YOU must execute the command using your terminal execution capability, then record:

1. Exit code
2. stdout output
3. stderr output (if any)
4. Whether the command **executed** (produced expected result) or **failed** (error, timeout, or unexpected behavior)

**Do NOT write unit tests**. Simply run each command and observe the results.

---

## Part 1: Basic Shell Execution

Execute these commands and verify you can successfully run them:

### 1.1 Simple PowerShell Commands

| #   | Command                                                 | Expected Result | Your Exit Code | Your stdout | Your stderr | Executed? |
| --- | ------------------------------------------------------- | --------------- | -------------- | ----------- | ----------- | --------- | ----- |
| 1   | `powershell -NoProfile -Command "Write-Host 'Test123'"` | "Test123"       | \_             | \_          | \_          | ✅/❌     |
| 2   | `powershell -Command "Get-Date                          | Out-String"`    | Date output    | \_          | \_          | \_        | ✅/❌ |
| 3   | `powershell -Command "1 + 1"`                           | "2"             | \_             | \_          | \_          | ✅/❌     |
| 4   | `powershell -Command "Write-Host 'Hello World'"`        | "Hello World"   | \_             | \_          | \_          | ✅/❌     |
| 5   | `powershell -Command "Get-Random"`                      | Random number   | \_             | \_          | \_          | ✅/❌     |

### 1.2 Simple CMD Commands

| #   | Command                     | Expected Result   | Your Exit Code | Your stdout | Your stderr | Executed? |
| --- | --------------------------- | ----------------- | -------------- | ----------- | ----------- | --------- |
| 6   | `cmd /c echo HelloWorld`    | "HelloWorld"      | \_             | \_          | \_          | ✅/❌     |
| 7   | `cmd /c dir`                | Directory listing | \_             | \_          | \_          | ✅/❌     |
| 8   | `cmd /c echo %username%`    | Username          | \_             | \_          | \_          | ✅/❌     |
| 9   | `cmd /c echo %userprofile%` | User profile path | \_             | \_          | \_          | ✅/❌     |
| 10  | `cmd /c ver`                | Windows version   | \_             | \_          | \_          | ✅/❌     |

### 1.3 Command Chaining and Piping

| #   | Command                                            | Expected Result              | Your Exit Code | Your stdout | Your stderr | Executed? |
| --- | -------------------------------------------------- | ---------------------------- | -------------- | ----------- | ----------- | --------- | ----- |
| 11  | `powershell -Command "Write-Host a; Write-Host b"` | Both lines                   | \_             | \_          | \_          | ✅/❌     |
| 12  | `powershell -Command "Get-Process                  | Select-Object -First 2"`     | 2 processes    | \_          | \_          | \_        | ✅/❌ |
| 13  | `cmd /c echo one & echo two`                       | Both lines                   | \_             | \_          | \_          | ✅/❌     |
| 14  | `cmd /c echo first && echo second`                 | Both lines                   | \_             | \_          | \_          | ✅/❌     |
| 15  | `powershell -Command "1,2,3,4,5                    | Where-Object { $\_ -gt 2 }"` | 3, 4, 5        | \_          | \_          | \_        | ✅/❌ |

---

## Part 2: PowerShell Script Block Execution

Test your ability to execute PowerShell script blocks:

| #   | Command                                                                     | Expected Result                                     | Your Exit Code | Your stdout | Your stderr | Executed? |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------- | -------------- | ----------- | ----------- | --------- | ----- |
| 16  | `powershell -Command "& { Write-Host 'Inside block' }"`                     | "Inside block"                                      | \_             | \_          | \_          | ✅/❌     |
| 17  | `powershell -Command "if (1 -eq 1) { Write-Host 'True' }"`                  | "True"                                              | \_             | \_          | \_          | ✅/❌     |
| 18  | `powershell -Command "$x = 5; $x * 2"`                                      | "10"                                                | \_             | \_          | \_          | ✅/❌     |
| 19  | `powershell -Command "& { $sum = 0; 1..10                                   | ForEach-Object { $sum += $\_ }; Write-Host $sum }"` | "55"           | \_          | \_          | \_        | ✅/❌ |
| 20  | `powershell -Command "foreach ($i in 1,2,3) { Write-Host $i }"`             | 1, 2, 3                                             | \_             | \_          | \_          | ✅/❌     |
| 21  | `powershell -Command "& { $arr = @('a','b','c'); $arr -join ',' }"`         | "a,b,c"                                             | \_             | \_          | \_          | ✅/❌     |
| 22  | `powershell -Command "function test { Write-Host 'function works' }; test"` | "function works"                                    | \_             | \_          | \_          | ✅/❌     |
| 23  | `powershell -Command "$hash = @{key='value'}; Write-Host $hash.key"`        | "value"                                             | \_             | \_          | \_          | ✅/❌     |

---

## Part 3: Variable and Expression Handling

Test your ability to handle variables and expressions:

| #   | Command                                                      | Expected Result    | Your Exit Code | Your stdout | Your stderr | Executed? |
| --- | ------------------------------------------------------------ | ------------------ | -------------- | ----------- | ----------- | --------- |
| 24  | `powershell -Command "$env:USERNAME"`                        | Your username      | \_             | \_          | \_          | ✅/❌     |
| 25  | `powershell -Command "$env:USERPROFILE"`                     | Profile path       | \_             | \_          | \_          | ✅/❌     |
| 26  | `powershell -Command "$PSVersionTable.PSVersion"`            | PowerShell version | \_             | \_          | \_          | ✅/❌     |
| 27  | `powershell -Command "[Environment]::OSVersion"`             | OS version         | \_             | \_          | \_          | ✅/❌     |
| 28  | `powershell -Command "$((Get-Date).ToString('yyyy-MM-dd'))"` | Today's date       | \_             | \_          | \_          | ✅/❌     |
| 29  | `cmd /c echo %computername%`                                 | Computer name      | \_             | \_          | \_          | ✅/❌     |
| 30  | `cmd /c echo %temp%`                                         | Temp directory     | \_             | \_          | \_          | ✅/❌     |
| 31  | `powershell -Command "$x = 'test'; $x.ToUpper()"`            | "TEST"             | \_             | \_          | \_          | ✅/❌     |

---

## Part 4: Path Handling and File Operations

Test your ability to handle Windows paths and perform file operations:

| #   | Command                                                                  | Expected Result          | Your Exit Code | Your stdout | Your stderr | Executed? |
| --- | ------------------------------------------------------------------------ | ------------------------ | -------------- | ----------- | ----------- | --------- | ----- |
| 32  | `powershell -Command "Write-Host 'C:\\Temp\\test.txt'"`                  | Path string              | \_             | \_          | \_          | ✅/❌     |
| 33  | `powershell -Command "Test-Path 'C:\\Windows'"`                          | "True"                   | \_             | \_          | \_          | ✅/❌     |
| 34  | `powershell -Command "Get-ChildItem 'C:\\Program Files'                  | Select-Object -First 3"` | 3 items        | \_          | \_          | \_        | ✅/❌ |
| 35  | `cmd /c dir %userprofile%`                                               | Profile directory        | \_             | \_          | \_          | ✅/❌     |
| 36  | `powershell -Command "Resolve-Path ~"`                                   | Resolved home            | \_             | \_          | \_          | ✅/❌     |
| 37  | `powershell -Command "(Get-Location).Path"`                              | Current path             | \_             | \_          | \_          | ✅/❌     |
| 38  | `powershell -Command "Split-Path -Path 'C:\\Windows\\System32' -Leaf"`   | "System32"               | \_             | \_          | \_          | ✅/❌     |
| 39  | `powershell -Command "Join-Path -Path 'C:\\Temp' -ChildPath 'test.txt'"` | Full path                | \_             | \_          | \_          | ✅/❌     |
| 40  | `cmd /c cd /d %temp% && echo %cd%`                                       | Changed to temp          | \_             | \_          | \_          | ✅/❌     |

---

## Part 5: Batch File Creation and Execution

Test your ability to create and execute batch files:

| #   | Steps        | Command                                             | Expected Result                               | Your Exit Code | Your stdout | Your stderr | Executed? |
| --- | ------------ | --------------------------------------------------- | --------------------------------------------- | -------------- | ----------- | ----------- | --------- | ----- |
| 41  | Create batch | `cmd /c echo @echo off > test.bat`                  | File created                                  | \_             | \_          | \_          | ✅/❌     |
| 42  | Add content  | `cmd /c echo echo Hello from batch >> test.bat`     | Content added                                 | \_             | \_          | \_          | ✅/❌     |
| 43  | Add more     | `cmd /c echo echo Current time is >> test.bat`      | Content added                                 | \_             | \_          | \_          | ✅/❌     |
| 44  | Execute      | `cmd /c test.bat`                                   | Batch runs                                    | \_             | \_          | \_          | ✅/❌     |
| 45  | Verify       | `cmd /c type test.bat`                              | Shows content                                 | \_             | \_          | \_          | ✅/❌     |
| 46  | Cleanup      | `cmd /c del test.bat`                               | File deleted                                  | \_             | \_          | \_          | ✅/❌     |
| 47  | PS create    | `powershell -Command "'@echo off'                   | Out-File -FilePath test.ps1 -Encoding ASCII"` | PS1 created    | \_          | \_          | \_        | ✅/❌ |
| 48  | PS execute   | `powershell -ExecutionPolicy Bypass -File test.ps1` | PS1 runs                                      | \_             | \_          | \_          | ✅/❌     |

---

## Part 6: Process and Service Management

Test your ability to query processes and services:

| #   | Command                                                    | Expected Result                         | Your Exit Code           | Your stdout   | Your stderr | Executed? |
| --- | ---------------------------------------------------------- | --------------------------------------- | ------------------------ | ------------- | ----------- | --------- | ----- | ----- |
| 49  | `powershell -Command "Get-Process                          | Select-Object -First 3"`                | 3 processes              | \_            | \_          | \_        | ✅/❌ |
| 50  | `powershell -Command "Get-Process                          | Where-Object {$\_.Name -eq 'explorer'}  | Select-Object -First 1"` | Explorer proc | \_          | \_        | \_    | ✅/❌ |
| 51  | `powershell -Command "Get-Service                          | Where-Object {$\_.Status -eq 'Running'} | Select-Object -First 3"` | 3 services    | \_          | \_        | \_    | ✅/❌ |
| 52  | `powershell -Command "Get-Service                          | Select-Object -First 3"`                | 3 services               | \_            | \_          | \_        | ✅/❌ |
| 53  | `powershell -Command "(Get-Process -Id $PID).ProcessName"` | Your process                            | \_                       | \_            | \_          | ✅/❌     |
| 54  | `powershell -Command "Get-ComputerInfo                     | Select-Object -First 1"`                | Computer info            | \_            | \_          | \_        | ✅/❌ |
| 55  | `cmd /c tasklist /fo csv /nh`                              | Process list CSV                        | \_                       | \_            | \_          | ✅/❌     |
| 56  | `cmd /c sc query type= service state= all                  | find /c "SERVICE_NAME"`                 | Service count            | \_            | \_          | \_        | ✅/❌ |

---

## Part 7: Network Commands

Test your ability to execute network-related commands:

| #   | Command                                                                                                  | Expected Result    | Your Exit Code  | Your stdout | Your stderr | Executed? |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------ | --------------- | ----------- | ----------- | --------- | ----- |
| 57  | `powershell -Command "Test-Connection -ComputerName localhost -Count 1"`                                 | Ping response      | \_              | \_          | \_          | ✅/❌     |
| 58  | `cmd /c ping -n 1 127.0.0.1`                                                                             | Ping reply         | \_              | \_          | \_          | ✅/❌     |
| 59  | `powershell -Command "(Invoke-WebRequest -Uri 'https://www.microsoft.com' -UseBasicParsing).StatusCode"` | 200                | \_              | \_          | \_          | ✅/❌     |
| 60  | `powershell -Command "[Net.Dns]::GetHostName()"`                                                         | Hostname           | \_              | \_          | \_          | ✅/❌     |
| 61  | `cmd /c ipconfig /all                                                                                    | findstr /c:"IPv4"` | IPv4 addresses  | \_          | \_          | \_        | ✅/❌ |
| 62  | `powershell -Command "Test-NetConnection -ComputerName www.google.com -InformationLevel Quiet"`          | True/False         | \_              | \_          | \_          | ✅/❌     |
| 63  | `cmd /c netstat -an                                                                                      | find /c "LISTEN"`  | Listening ports | \_          | \_          | \_        | ✅/❌ |

---

## Part 8: System Information

Test your ability to retrieve system information:

| #   | Command                                                        | Expected Result                                     | Your Exit Code | Your stdout | Your stderr | Executed? |
| --- | -------------------------------------------------------------- | --------------------------------------------------- | -------------- | ----------- | ----------- | --------- | ----- |
| 64  | `powershell -Command "Get-CimInstance Win32_OperatingSystem    | Select-Object -Property Caption"`                   | OS name        | \_          | \_          | \_        | ✅/❌ |
| 65  | `powershell -Command "Get-CimInstance Win32_ComputerSystem     | Select-Object -Property Model"`                     | Model          | \_          | \_          | \_        | ✅/❌ |
| 66  | `powershell -Command "(Get-CimInstance Win32_Processor).Name"` | CPU name                                            | \_             | \_          | \_          | ✅/❌     |
| 67  | `powershell -Command "(Get-CimInstance Win32_PhysicalMemory    | Measure-Object -Property Capacity -Sum).Sum / 1GB"` | RAM GB         | \_          | \_          | \_        | ✅/❌ |
| 68  | `powershell -Command "Get-Disk                                 | Select-Object -First 1"`                            | Disk info      | \_          | \_          | \_        | ✅/❌ |
| 69  | `cmd /c systeminfo                                             | find /c "OS"`                                       | OS info        | \_          | \_          | \_        | ✅/❌ |
| 70  | `powershell -Command "(Get-UICulture).Name"`                   | Culture                                             | \_             | \_          | \_          | ✅/❌     |
| 71  | `powershell -Command "[Environment]::Is64BitOperatingSystem"`  | True/False                                          | \_             | \_          | \_          | ✅/❌     |

---

## Part 9: Error Handling and Exit Codes

Test your ability to handle errors and interpret exit codes:

| #   | Command                                                                                | Expected Result | Your Exit Code | Your stdout | Your stderr | Executed? |
| --- | -------------------------------------------------------------------------------------- | --------------- | -------------- | ----------- | ----------- | --------- | --- | ----- |
| 72  | `powershell -Command "Write-Error 'Test error'"`                                       | Error output    | \_             | \_          | \_          | ✅/❌     |
| 73  | `cmd /c dir nonexistent 2>&1`                                                          | Error message   | \_             | \_          | \_          | ✅/❌     |
| 74  | `powershell -Command "throw 'Intentional error'"`                                      | Exception       | \_             | \_          | \_          | ✅/❌     |
| 75  | `cmd /c exit 42`                                                                       | Exit 42         | \_             | \_          | \_          | ✅/❌     |
| 76  | `powershell -Command "$ErrorActionPreference = 'Stop'; Get-Content nonexisistent.txt"` | Error           | \_             | \_          | \_          | ✅/❌     |
| 77  | `cmd /c (exit 1) && echo success                                                       |                 | echo failed`   | "failed"    | \_          | \_        | \_  | ✅/❌ |
| 78  | `powershell -Command "try { 1/0 } catch { Write-Host 'Caught' }"`                      | "Caught"        | \_             | \_          | \_          | ✅/❌     |
| 79  | `cmd /c mkdir "%temp%\test_dir_$$" && echo success`                                    | Success         | \_             | \_          | \_          | ✅/❌     |

---

## Part 10: Complex PowerShell Expressions

Test your ability to execute complex PowerShell expressions:

| #   | Command                                                                                                              | Expected Result                | Your Exit Code          | Your stdout    | Your stderr | Executed? |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------- | -------------- | ----------- | --------- | ----- | ----- |
| 80  | `powershell -Command "1..10                                                                                          | Measure-Object -Sum"`          | Sum 55                  | \_             | \_          | \_        | ✅/❌ |
| 81  | `powershell -Command "@('a','b','c')                                                                                 | ForEach-Object { $_ + $_ }"`   | aa, bb, cc              | \_             | \_          | \_        | ✅/❌ |
| 82  | `powershell -Command "Get-ChildItem -Path 'C:\\Windows' -Filter \*.exe -Recurse                                      | Select-Object -First 3"`       | 3 EXEs                  | \_             | \_          | \_        | ✅/❌ |
| 83  | `powershell -Command "$hash = @{'a'=1;'b'=2;'c'=3}; $hash.GetEnumerator()                                            | Sort-Object Value"`            | Sorted                  | \_             | \_          | \_        | ✅/❌ |
| 84  | `powershell -Command "[regex]::Matches('abcabcabc', 'a+')                                                            | ForEach-Object {$\_.Value}"`   | a, a, a                 | \_             | \_          | \_        | ✅/❌ |
| 85  | `powershell -Command "$arr = 1..100; ($arr                                                                           | Where-Object { $\_ % 7 -eq 0 } | Measure-Object).Count"` | Divisible by 7 | \_          | \_        | \_    | ✅/❌ |
| 86  | `powershell -Command "Get-Content $env:windir\\system32\\drivers\\etc\\hosts                                         | Select-Object -First 5"`       | Hosts file              | \_             | \_          | \_        | ✅/❌ |
| 87  | `powershell -Command "$obj = New-Object PSObject -Property @{Name='Test';Value=42}; $obj"`                           | Object                         | \_                      | \_             | \_          | ✅/❌     |
| 88  | `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Test')"` | Message box                    | \_                      | \_             | \_          | ✅/❌     |
| 89  | `powershell -Command "$bytes = [Text.Encoding]::UTF8.GetBytes('Hello'); [Convert]::ToBase64String($bytes)"`          | Base64                         | \_                      | \_             | \_          | ✅/❌     |
| 90  | `powershell -Command "[DateTime]::Now.AddDays(-7).ToString('yyyy-MM-dd')"`                                           | 7 days ago                     | \_                      | \_             | \_          | ✅/❌     |

---

## Part 11: Long-Running Command Handling

Test your ability to manage long-running commands:

| #   | Command                                                                                                | Timeout                                 | Expected Result | Your Exit Code | Your stdout | Your stderr | Executed? |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- | --------------- | -------------- | ----------- | ----------- | --------- | ----- |
| 91  | `powershell -Command "Start-Sleep -Seconds 1; Write-Host 'Done'"`                                      | 5s                                      | "Done"          | \_             | \_          | \_          | ✅/❌     |
| 92  | `cmd /c ping -n 3 127.0.0.1`                                                                           | 10s                                     | Ping output     | \_             | \_          | \_          | ✅/❌     |
| 93  | `powershell -Command "for ($i = 0; $i -lt 10; $i++) { Write-Host $i; Start-Sleep -Milliseconds 100 }"` | 5s                                      | 0-9             | \_             | \_          | \_          | ✅/❌     |
| 94  | `powershell -Command "$null = 1..1000                                                                  | ForEach-Object { }; Write-Host 'Done'"` | 10s             | "Done"         | \_          | \_          | \_        | ✅/❌ |
| 95  | `cmd /c for /l %i in (1,1,100) do @echo %i`                                                            | 10s                                     | 1-100           | \_             | \_          | \_          | ✅/❌     |

---

## Part 12: Output Format Verification

Test your ability to capture different output formats:

| #   | Command                                                        | Expected Format                  | Your stdout Preview       | Format Correct? |
| --- | -------------------------------------------------------------- | -------------------------------- | ------------------------- | --------------- | ----- | ----- |
| 96  | `powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"` | Date string                      | \_                        | ✅/❌           |
| 97  | `powershell -Command "Get-Process                              | ConvertTo-Csv -NoTypeInformation | Select-Object -First 3"`  | CSV format      | \_    | ✅/❌ |
| 98  | `powershell -Command "Get-Process                              | Select-Object Name,Id            | ConvertTo-Json -Depth 1"` | JSON format     | \_    | ✅/❌ |
| 99  | `powershell -Command "Get-Process                              | Format-Table -AutoSize           | Out-String -Width 100"`   | Table format    | \_    | ✅/❌ |
| 100 | `powershell -Command "Get-Date                                 | Format-List"`                    | List format               | \_              | ✅/❌ |

---

## Part 13: Environment and Configuration

Test your ability to access environment and configuration:

| #   | Command                                                                   | Expected Result  | Your Exit Code | Your stdout | Executed? |
| --- | ------------------------------------------------------------------------- | ---------------- | -------------- | ----------- | --------- |
| 101 | `powershell -Command "Get-ChildItem Env:"`                                | Environment vars | \_             | \_          | ✅/❌     |
| 102 | `powershell -Command "$env:PATH"`                                         | PATH variable    | \_             | \_          | ✅/❌     |
| 103 | `powershell -Command "[Environment]::GetEnvironmentVariables('Machine')"` | Machine env      | \_             | \_          | ✅/❌     |
| 104 | `powershell -Command "Get-PSReadLineOption"`                              | PSReadLine opts  | \_             | \_          | ✅/❌     |
| 105 | `powershell -Command "$PSDefaultParameterValues"`                         | Default params   | \_             | \_          | ✅/❌     |
| 106 | `powershell -Command "Get-ExecutionPolicy"`                               | Execution policy | \_             | \_          | ✅/❌     |

---

## Part 14: Unicode and Special Characters

Test your ability to handle Unicode and special characters:

| #   | Command                                                     | Expected Result | Your Exit Code | Your stdout | Executed? |
| --- | ----------------------------------------------------------- | --------------- | -------------- | ----------- | --------- |
| 107 | `powershell -Command "Write-Host 'Hello 世界'"`             | Mixed text      | \_             | \_          | ✅/❌     |
| 108 | `powershell -Command "Write-Host 'Emoji: 😀 🔥 🚀'"`        | Emoji           | \_             | \_          | ✅/❌     |
| 109 | `powershell -Command "Write-Host 'Smart quotes: \"test\"'"` | Smart quotes    | \_             | \_          | ✅/❌     |
| 110 | `powershell -Command "Write-Host 'Special: — – …'"`         | Special chars   | \_             | \_          | ✅/❌     |
| 111 | `powershell -Command "[char]0x1F600 + [char]0x1F604"`       | Emoji chars     | \_             | \_          | ✅/❌     |
| 112 | `powershell -Command "Write-Host 'Cyrillic: Привет'"`       | Cyrillic        | \_             | \_          | ✅/❌     |
| 113 | `powershell -Command "Write-Host 'Arabic: مرحبا'"`          | Arabic RTL      | \_             | \_          | ✅/❌     |
| 114 | `powershell -Command "Write-Host 'Tabs: a\tb\tc'"`          | Tab characters  | \_             | \_          | ✅/❌     |

---

## Part 15: Command Discovery and Help

Test your ability to access help and discover commands:

| #   | Command                                                                                 | Expected Result | Your Exit Code | Your stdout | Executed? |
| --- | --------------------------------------------------------------------------------------- | --------------- | -------------- | ----------- | --------- | ----- |
| 115 | `powershell -Command "Get-Command Write-Host                                            | Format-List"`   | Command info   | \_          | \_        | ✅/❌ |
| 116 | `powershell -Command "Get-History"`                                                     | Command history | \_             | \_          | ✅/❌     |
| 117 | `powershell -Command "Get-Alias"`                                                       | Aliases list    | \_             | \_          | ✅/❌     |
| 118 | `powershell -Command "Update-Help -ErrorAction SilentlyContinue; Get-Help Get-Process"` | Help output     | \_             | \_          | ✅/❌     |
| 119 | `powershell -Command "Get-Module"`                                                      | Loaded modules  | \_             | \_          | ✅/❌     |
| 120 | `powershell -Command "Get-PSSnapin"`                                                    | PS snapins      | \_             | \_          | ✅/❌     |

---

## Part 16: Job and Background Execution

Test your ability to manage background jobs:

| #   | Command                                                                                                                              | Expected Result | Your Exit Code | Your stdout | Executed? |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | -------------- | ----------- | --------- | --- | ----- |
| 121 | `powershell -Command "$job = Start-Job -ScriptBlock { Start-Sleep -Seconds 1; Write-Host 'Job done' }; Receive-Job -Job $job -Wait"` | "Job done"      | \_             | \_          | ✅/❌     |
| 122 | `powershell -Command "Get-Job"`                                                                                                      | Job listing     | \_             | \_          | ✅/❌     |
| 123 | `powershell -Command "Start-Job -ScriptBlock { Get-Process }                                                                         | Wait-Job        | Receive-Job"`  | Processes   | \_        | \_  | ✅/❌ |
| 124 | `powershell -Command "$job = Start-Job -ScriptBlock { 1..10 }; $job                                                                  | Wait-Job        | Receive-Job"`  | Numbers     | \_        | \_  | ✅/❌ |

---

## Part 17: Module and Package Management

Test your ability to work with modules:

| #   | Command                                                                                                                  | Expected Result          | Your Exit Code | Your stdout | Executed? |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------ | -------------- | ----------- | --------- | ----- |
| 125 | `powershell -Command "Get-Module -ListAvailable                                                                          | Select-Object -First 5"` | 5 modules      | \_          | \_        | ✅/❌ |
| 126 | `powershell -Command "Find-Module -Name _Package_ -ErrorAction SilentlyContinue                                          | Select-Object -First 3"` | Search results | \_          | \_        | ✅/❌ |
| 127 | `powershell -Command "Import-Module Microsoft.PowerShell.Management; Get-Command -Module Microsoft.PowerShell.Management | Select-Object -First 3"` | Commands       | \_          | \_        | ✅/❌ |

---

## Part 18: Cross-Platform Considerations

Test handling of Windows-specific scenarios:

| #   | Command                                                             | Expected Result   | Your Exit Code | Your stdout | Executed? |
| --- | ------------------------------------------------------------------- | ----------------- | -------------- | ----------- | --------- |
| 128 | `powershell -Command "(Get-Item 'C:\\Windows').FullName"`           | Full Windows path | \_             | \_          | ✅/❌     |
| 129 | `powershell -Command "$PSHome"`                                     | PS home path      | \_             | \_          | ✅/❌     |
| 130 | `powershell -Command "(Get-PSProvider FileSystem).Home"`            | FileSystem home   | \_             | \_          | ✅/❌     |
| 131 | `powershell -Command "[System.IO.Path]::AltDirectorySeparatorChar"` | "/"               | \_             | \_          | ✅/❌     |
| 132 | `powershell -Command "[System.IO.Path]::DirectorySeparatorChar"`    | "\"               | \_             | \_          | ✅/❌     |
| 133 | `powershell -Command "[System.Environment]::NewLine"`               | "\r\n"            | \_             | \_          | ✅/❌     |

---

## Part 19: Performance and Timing

Test your ability to handle timed operations:

| #   | Command                                                                                                        | Expected Result            | Time Taken    | Your Exit Code | Executed? |
| --- | -------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------- | -------------- | --------- | ----- |
| 134 | `powershell -Command "Measure-Command { 1..1000                                                                | ForEach-Object { $\_ } }"` | Timing output | \_             | \_        | ✅/❌ |
| 135 | `powershell -Command "$sw = [Diagnostics.Stopwatch]::StartNew(); 1..100; $sw.Stop(); $sw.ElapsedMilliseconds"` | Milliseconds               | \_            | \_             | ✅/❌     |
| 136 | `cmd /c echo %time% && ping -n 2 127.0.0.1 >nul && echo %time%`                                                | Before/after               | \_            | \_             | ✅/❌     |

---

## Part 20: Combinations and Complex Scenarios

Test complex command combinations:

| #   | Command                                                                                   | Expected Result                                                | Your Exit Code              | Your stdout              | Executed?    |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------- | ------------------------ | ------------ | --- | ----- | ----- |
| 137 | `powershell -Command "$procs = Get-Process; $procs                                        | Where-Object { $\_.CPU -gt 0 }                                 | Sort-Object CPU -Descending | Select-Object -First 3"` | Top 3 by CPU | \_  | \_    | ✅/❌ |
| 138 | `powershell -Command "$files = Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $\_.Length -gt 1MB }                            | Select-Object -First 3"`    | Large files              | \_           | \_  | ✅/❌ |
| 139 | `powershell -Command "$env:PATH.Split(';')                                                | Where-Object { Test-Path $\_ }                                 | Select-Object -First 5"`    | Valid PATH dirs          | \_           | \_  | ✅/❌ |
| 140 | `powershell -Command "Get-ChildItem -Path 'C:\\Windows\\System32' -Filter \*.dll          | Where-Object { $\_.LastWriteTime -gt (Get-Date).AddDays(-30) } | Select-Object -First 3"`    | Recent DLLs              | \_           | \_  | ✅/❌ |

---

## Summary Template

| Category               | Total Tests | Passed | Failed | Success Rate |
| ---------------------- | ----------- | ------ | ------ | ------------ |
| Basic Shell Execution  | 15          | \_     | \_     | \_           |
| Script Block Execution | 8           | \_     | \_     | \_           |
| Variable/Expressions   | 8           | \_     | \_     | \_           |
| Path Handling          | 9           | \_     | \_     | \_           |
| Batch Files            | 8           | \_     | \_     | \_           |
| Process/Service Mgmt   | 8           | \_     | \_     | \_           |
| Network Commands       | 7           | \_     | \_     | \_           |
| System Information     | 8           | \_     | \_     | \_           |
| Error Handling         | 8           | \_     | \_     | \_           |
| Complex Expressions    | 11          | \_     | \_     | \_           |
| Long-Running           | 5           | \_     | \_     | \_           |
| Output Format          | 5           | \_     | \_     | \_           |
| Environment            | 6           | \_     | \_     | \_           |
| Unicode                | 8           | \_     | \_     | \_           |
| Command Discovery      | 6           | \_     | \_     | \_           |
| Background Jobs        | 4           | \_     | \_     | \_           |
| Module Management      | 3           | \_     | \_     | \_           |
| Cross-Platform         | 6           | \_     | \_     | \_           |
| Performance            | 3           | \_     | \_     | \_           |
| Complex Combinations   | 4           | \_     | \_     | \_           |
| **TOTAL**              | **140**     | **\_** | **\_** | **\_**       |

---

## Pass Criteria

For your command execution capability to be considered fully functional:

- ✅ **All 140 tests execute successfully**
- ✅ **Exit codes are correctly captured**
- ✅ **stdout and stderr are properly captured**
- ✅ **No commands hang or timeout unexpectedly**
- ✅ **PowerShell and CMD both work correctly**
- ✅ **Complex expressions evaluate properly**
- ✅ **Error conditions are handled gracefully**
- ✅ **Unicode and special characters display correctly**
- ✅ **Long-running commands can be managed**
- ✅ **Background jobs can be executed and monitored**

---

## Quick Verification (Minimum 10 Tests)

If limited time, verify these critical capabilities:

1. ✅ `powershell -Command "Write-Host 'Test'"`
2. ✅ `cmd /c echo Hello`
3. ✅ `powershell -Command "$env:USERNAME"`
4. ✅ `powershell -Command "Get-Date"`
5. ✅ `powershell -Command "$x = 5; $x * 2"`
6. ✅ `powershell -Command "Get-Process | Select-Object -First 1"`
7. ✅ `cmd /c dir`
8. ✅ `powershell -Command "Test-Path 'C:\\Windows'"`
9. ✅ `powershell -Command "1 + 1"`
10. ✅ `powershell -Command "Write-Error 'test'"` (verify error capture)

If all 10 pass → Command execution is WORKING ✅

---

## Notes

Record any unexpected behavior, errors, or issues for debugging:
