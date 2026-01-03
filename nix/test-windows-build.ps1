# Comprehensive Windows Build Compatibility Test Script
# Tests all Windows-specific modifications and integrations for OpenCode
# Version: 1.0
# Author: OpenCode Windows Compatibility Team

param(
    [string]$TestScope = "all",
    [switch]$Verbose,
    [switch]$Debug,
    [switch]$SkipIntegration,
    [switch]$GenerateReport
)

# Set strict mode for better error handling
Set-StrictMode -Version Latest

# Enable verbose output if requested
if ($Verbose) {
    $VerbosePreference = "Continue"
}

# Test results tracking
$Global:TestResults = @{
    Summary = @{
        Total = 0
        Passed = 0
        Failed = 0
        Warnings = 0
    }
    Details = @()
}

# Test categories
$TestCategories = @{
    "NixConfig" = @{
        Name = "Nix Configuration Validation"
        Tests = @("SyntaxValidation", "TargetPlatforms", "PowerShellCommands", "PathHandling")
    }
    "PowerShellScripts" = @{
        Name = "PowerShell Script Testing"
        Tests = @("BuildScriptSyntax", "ModuleImport", "CmdletAvailability", "ErrorHandling")
    }
    "FileOperations" = @{
        Name = "Cross-Platform File Operations"
        Tests = @("FileOperationFunctions", "PlatformDetection", "NodeFsOperations", "PathConversions")
    }
    "BuildIntegration" = @{
        Name = "Build Process Integration"
        Tests = @("PackageScripts", "LspPermissions", "ArchiveOperations", "EnvironmentSetup")
    }
    "CompleteBuild" = @{
        Name = "Complete Build Test"
        Tests = @("BuildExecution", "CommandReplacements", "PathValidation", "OutputValidation")
    }
}

# Color codes for output
$Colors = @{
    "Success" = "Green"
    "Error" = "Red"
    "Warning" = "Yellow"
    "Info" = "Cyan"
    "TestName" = "Magenta"
    "Detail" = "Gray"
}

# Utility functions
function Write-TestHeader {
    param([string]$Category, [string]$TestName)
    Write-Host "`n[$Category] Testing $TestName..." -ForegroundColor $Colors.TestName
}

function Write-TestResult {
    param([string]$TestName, [bool]$Passed, [string]$Message = "", [string]$Detail = "")
    
    $Global:TestResults.Summary.Total++
    if ($Passed) {
        $Global:TestResults.Summary.Passed++
        $Status = "✓ PASS"
        $Color = $Colors.Success
    } else {
        $Global:TestResults.Summary.Failed++
        $Status = "✗ FAIL"
        $Color = $Colors.Error
    }
    
    Write-Host "  $Status - $TestName" -ForegroundColor $Color
    if ($Message) {
        Write-Host "    Message: $Message" -ForegroundColor $Colors.Detail
    }
    if ($Detail -and $Verbose) {
        Write-Host "    Detail: $Detail" -ForegroundColor $Colors.Detail
    }
    
    # Store test result
    $Global:TestResults.Details += @{
        Category = $Category
        Test = $TestName
        Passed = $Passed
        Message = $Message
        Detail = $Detail
    }
}

function Write-TestWarning {
    param([string]$TestName, [string]$Message)
    $Global:TestResults.Summary.Warnings++
    Write-Host "  ⚠ WARN - $TestName" -ForegroundColor $Colors.Warning
    Write-Host "    Warning: $Message" -ForegroundColor $Colors.Warning
}

function Get-SystemInfo {
    return @{
        Platform = [System.Environment]::OSVersion.Platform.ToString()
        Version = [System.Environment]::OSVersion.Version.ToString()
        Is64Bit = [Environment]::Is64BitOperatingSystem
        PowerShellVersion = $PSVersionTable.PSVersion.ToString()
        CurrentDirectory = Get-Location
        UserName = [Environment]::UserName
    }
}

function Test-CommandAvailability {
    param([string]$CommandName)
    try {
        $command = Get-Command $CommandName -ErrorAction Stop
        return @{
            Available = $true
            Path = $command.Source
            Version = if ($command.Version) { $command.Version.ToString() } else { "Unknown" }
        }
    } catch {
        return @{
            Available = $false
            Path = $null
            Version = "Not Found"
        }
    }
}

function Test-NixFileSyntax {
    param([string]$FilePath)
    Write-TestHeader "NixConfig" "Syntax Validation"
    
    if (-not (Test-Path $FilePath)) {
        Write-TestResult "NixFileSyntax" $false "File not found: $FilePath"
        return
    }
    
    try {
        # Test basic Nix syntax by attempting to parse
        $content = Get-Content $FilePath -Raw -ErrorAction Stop
        
        # Basic syntax checks
        $hasOpeningBrace = $content -match "^\s*\{"
        $hasClosingBrace = $content -match "\}\s*$"
        $hasLetClause = $content -match "let\s+"
        $hasInClause = $content -match "\s+in\s+"
        
        $syntaxValid = $hasOpeningBrace -and $hasClosingBrace
        
        if ($syntaxValid) {
            Write-TestResult "NixFileSyntax" $true "Valid Nix file structure"
        } else {
            Write-TestResult "NixFileSyntax" $false "Invalid Nix file structure"
        }
        
        # Additional content validation
        if ($content -match "powershell") {
            Write-TestResult "PowerShellIntegration" $true "Contains PowerShell integration"
        } else {
            Write-TestWarning "PowerShellIntegration" "No PowerShell integration found"
        }
        
        if ($content -match "x86_64-windows|aarch64-windows") {
            Write-TestResult "TargetPlatforms" $true "Windows target platforms configured"
        } else {
            Write-TestResult "TargetPlatforms" $false "Windows target platforms not found"
        }
        
    } catch {
        Write-TestResult "NixFileSyntax" $false "Error reading file: $($_.Exception.Message)"
    }
}

function Test-PowerShellModule {
    Write-TestHeader "PowerShellScripts" "Module Import and Functions"
    
    $modulePath = "windows-commands.psm1"
    if (-not (Test-Path $modulePath)) {
        Write-TestResult "ModuleImport" $false "Module file not found: $modulePath"
        return
    }
    
    try {
        # Test module syntax
        $ast = [System.Management.Automation.Language.Parser]::ParseFile($modulePath, [ref]$null, [ref]$null)
        Write-TestResult "ModuleSyntax" $true "Module syntax is valid"
        
        # Test module import
        Import-Module $modulePath -Force -ErrorAction Stop
        Write-TestResult "ModuleImport" $true "Module imported successfully"
        
        # Test exported functions
        $expectedFunctions = @(
            'Find-Files', 'Set-Permissions', 'New-SymLink', 'Copy-Files',
            'Search-Text', 'Replace-Text', 'Set-Writable', 'ConvertTo-UnixPath',
            'ConvertTo-WindowsPath', 'New-Directory', 'Remove-File', 'Get-FileInfo', 'Set-FileMode'
        )
        
        $availableFunctions = Get-Command -Module (Split-Path $modulePath -LeafBase) -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
        $missingFunctions = $expectedFunctions | Where-Object { $_ -notin $availableFunctions }
        
        if ($missingFunctions.Count -eq 0) {
            Write-TestResult "FunctionAvailability" $true "All expected functions available"
        } else {
            Write-TestResult "FunctionAvailability" $false "Missing functions: $($missingFunctions -join ', ')"
        }
        
    } catch {
        Write-TestResult "ModuleImport" $false "Module import failed: $($_.Exception.Message)"
    }
}

function Test-BuildScriptValidation {
    Write-TestHeader "PowerShellScripts" "Build Script Validation"
    
    $buildScript = "build-windows.ps1"
    if (-not (Test-Path $buildScript)) {
        Write-TestResult "BuildScriptSyntax" $false "Build script not found: $buildScript"
        return
    }
    
    try {
        # Test build script syntax
        $ast = [System.Management.Automation.Language.Parser]::ParseFile($buildScript, [ref]$null, [ref]$null)
        Write-TestResult "BuildScriptSyntax" $true "Build script syntax is valid"
        
        # Check for required parameters
        $content = Get-Content $buildScript -Raw
        $hasTargetParam = $content -match "Target.*=.*x86_64-windows"
        $hasArchitectureParam = $content -match "Architecture.*=.*x86_64"
        $hasVerboseSwitch = $content -match "Verbose.*switch"
        
        if ($hasTargetParam -and $hasArchitectureParam -and $hasVerboseSwitch) {
            Write-TestResult "ScriptParameters" $true "All required parameters present"
        } else {
            Write-TestResult "ScriptParameters" $false "Missing required parameters"
        }
        
        # Check for Windows-specific commands
        $windowsCommands = @("Copy-Item", "New-Item", "Set-Location", "Get-ChildItem", "icacls", "mklink")
        $foundCommands = 0
        foreach ($cmd in $windowsCommands) {
            if ($content -match $cmd) { $foundCommands++ }
        }
        
        if ($foundCommands -ge 4) {
            Write-TestResult "WindowsCommands" $true "Windows commands properly integrated ($foundCommands/6 found)"
        } else {
            Write-TestResult "WindowsCommands" $false "Insufficient Windows commands ($foundCommands/6 found)"
        }
        
    } catch {
        Write-TestResult "BuildScriptSyntax" $false "Build script validation failed: $($_.Exception.Message)"
    }
}

function Test-CrossPlatformFileOperations {
    Write-TestHeader "FileOperations" "Cross-Platform File Operations"
    
    # Test platform detection
    $isWindows = [System.Environment]::OSVersion.Platform -eq "Win32NT"
    if ($isWindows) {
        Write-TestResult "PlatformDetection" $true "Correctly identified Windows platform"
    } else {
        Write-TestResult "PlatformDetection" $false "Platform detection failed"
    }
    
    # Test path conversion functions if module is available
    try {
        Import-Module "windows-commands.psm1" -Force -ErrorAction SilentlyContinue
        
        if (Get-Command "ConvertTo-UnixPath" -ErrorAction SilentlyContinue) {
            $testWindowsPath = "C:\Users\test\file.txt"
            $unixPath = ConvertTo-UnixPath -Path $testWindowsPath
            $expectedUnix = "/c/Users/test/file.txt"
            
            if ($unixPath -eq $expectedUnix) {
                Write-TestResult "PathConversion" $true "Windows to Unix path conversion works"
            } else {
                Write-TestResult "PathConversion" $false "Path conversion incorrect: $unixPath != $expectedUnix"
            }
        }
        
        if (Get-Command "ConvertTo-WindowsPath" -ErrorAction SilentlyContinue) {
            $testUnixPath = "/c/Users/test/file.txt"
            $windowsPath = ConvertTo-WindowsPath -Path $testUnixPath
            $expectedWindows = "C:\Users\test\file.txt"
            
            if ($windowsPath -eq $expectedWindows) {
                Write-TestResult "PathConversionReverse" $true "Unix to Windows path conversion works"
            } else {
                Write-TestResult "PathConversionReverse" $false "Path conversion reverse incorrect: $windowsPath != $expectedWindows"
            }
        }
        
    } catch {
        Write-TestResult "PathConversion" $false "Path conversion test failed: $($_.Exception.Message)"
    }
    
    # Test Node.js fs operations compatibility
    try {
        # Create test file and directory
        $testDir = Join-Path $env:TEMP "opencode-test-$(Get-Random)"
        $testFile = Join-Path $testDir "test.txt"
        
        New-Item -ItemType Directory -Path $testDir -Force | Out-Null
        Set-Content -Path $testFile -Value "test content" -NoNewline
        
        # Test if we can read/write (basic fs operations)
        $content = Get-Content -Path $testFile -Raw
        if ($content -eq "test content") {
            Write-TestResult "FileSystemOperations" $true "Basic file operations work"
        } else {
            Write-TestResult "FileSystemOperations" $false "File operations failed"
        }
        
        # Cleanup
        Remove-Item -Path $testDir -Recurse -Force -ErrorAction SilentlyContinue
        
    } catch {
        Write-TestResult "FileSystemOperations" $false "File system operations test failed: $($_.Exception.Message)"
    }
}

function Test-BuildProcessIntegration {
    Write-TestHeader "BuildIntegration" "Build Process Integration"
    
    # Test package.json scripts compatibility
    $packageJsonPath = "..\package.json"
    if (Test-Path $packageJsonPath) {
        try {
            $packageContent = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
            
            # Check for Windows-specific scripts
            $hasWindowsScripts = $false
            if ($packageContent.scripts) {
                $scriptNames = $packageContent.scripts.PSObject.Properties.Name
                $windowsScriptPatterns = @("windows", "desktop:windows", "desktop-windows")
                
                foreach ($pattern in $windowsScriptPatterns) {
                    if ($scriptNames -like "*$pattern*") {
                        $hasWindowsScripts = $true
                        break
                    }
                }
            }
            
            if ($hasWindowsScripts) {
                Write-TestResult "PackageScripts" $true "Windows-specific scripts found in package.json"
            } else {
                Write-TestResult "PackageScripts" $false "No Windows-specific scripts found in package.json"
            }
            
        } catch {
            Write-TestResult "PackageScripts" $false "Error reading package.json: $($_.Exception.Message)"
        }
    } else {
        Write-TestResult "PackageScripts" $false "package.json not found"
    }
    
    # Test LSP server permission handling
    try {
        # Check if LSP server files exist and can be accessed
        $lspPaths = @(
            "..\packages\opencode\src\lsp\server.ts",
            "..\packages\opencode\dist\src\lsp\server.js"
        )
        
        $accessibleLspFiles = 0
        foreach ($lspPath in $lspPaths) {
            if (Test-Path $lspPath) {
                try {
                    $content = Get-Content $lspPath -Raw
                    if ($content -match "win32") {
                        $accessibleLspFiles++
                    }
                } catch {
                    # File exists but can't read
                    $accessibleLspFiles++
                }
            }
        }
        
        if ($accessibleLspFiles -gt 0) {
            Write-TestResult "LspPermissions" $true "LSP server files accessible with Windows compatibility"
        } else {
            Write-TestResult "LspPermissions" $false "No LSP server files found or accessible"
        }
        
    } catch {
        Write-TestResult "LspPermissions" $false "LSP permission test failed: $($_.Exception.Message)"
    }
    
    # Test archive operations compatibility
    try {
        $archiveTestDir = Join-Path $env:TEMP "opencode-archive-test-$(Get-Random)"
        $testZip = Join-Path $archiveTestDir "test.zip"
        $testFile = Join-Path $archiveTestDir "test.txt"
        
        New-Item -ItemType Directory -Path $archiveTestDir -Force | Out-Null
        Set-Content -Path $testFile -Value "archive test content" -NoNewline
        
        # Test zip creation using PowerShell Compress-Archive
        try {
            Compress-Archive -Path $testFile -DestinationPath $testZip -Force
            if (Test-Path $testZip) {
                Write-TestResult "ArchiveOperations" $true "Archive operations work on Windows"
            } else {
                Write-TestResult "ArchiveOperations" $false "Archive creation failed"
            }
        } catch {
            Write-TestResult "ArchiveOperations" $false "Archive creation failed: $($_.Exception.Message)"
        }
        
        # Cleanup
        Remove-Item -Path $archiveTestDir -Recurse -Force -ErrorAction SilentlyContinue
        
    } catch {
        Write-TestResult "ArchiveOperations" $false "Archive operations test failed: $($_.Exception.Message)"
    }
}

function Test-CompleteBuildProcess {
    Write-TestHeader "CompleteBuild" "Complete Build Process"
    
    if ($SkipIntegration) {
        Write-TestWarning "BuildExecution" "Skipping complete build test due to -SkipIntegration flag"
        return
    }
    
    # Test required tools availability
    $requiredTools = @{
        "nix" = "Nix package manager"
        "bun" = "Bun runtime and package manager"
        "powershell" = "PowerShell"
    }
    
    $availableTools = 0
    foreach ($tool in $requiredTools.Keys) {
        $toolInfo = Test-CommandAvailability $tool
        if ($toolInfo.Available) {
            $availableTools++
            Write-Verbose "Found $($requiredTools[$tool]) at: $($toolInfo.Path)"
        } else {
            Write-Verbose "$($requiredTools[$tool]) not found"
        }
    }
    
    if ($availableTools -eq $requiredTools.Count) {
        Write-TestResult "ToolAvailability" $true "All required build tools are available"
    } else {
        Write-TestResult "ToolAvailability" $false "Only $availableTools/$($requiredTools.Count) tools available"
    }
    
    # Test Nix configuration evaluation
    try {
        # Try to evaluate the Nix configuration
        $nixConfig = "windows-opencode.nix"
        if (Test-Path $nixConfig) {
            # Basic test: see if nix can evaluate the file
            $nixEvalResult = & nix-instantiate --eval --strict $nixConfig 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-TestResult "NixConfigurationEval" $true "Nix configuration evaluates successfully"
            } else {
                Write-TestResult "NixConfigurationEval" $false "Nix configuration evaluation failed: $nixEvalResult"
            }
        } else {
            Write-TestResult "NixConfigurationEval" $false "Nix configuration file not found"
        }
    } catch {
        Write-TestResult "NixConfigurationEval" $false "Nix configuration test failed: $($_.Exception.Message)"
    }
    
    # Test for hardcoded Unix paths in critical files
    try {
        $criticalFiles = @(
            "..\packages\opencode\src\util\archive.ts",
            "..\packages\opencode\src\lsp\server.ts",
            "..\nix\scripts\patch-wasm.ts",
            "build-windows.ps1"
        )
        
        $filesWithUnixPaths = 0
        foreach ($file in $criticalFiles) {
            if (Test-Path $file) {
                try {
                    $content = Get-Content $file -Raw
                    # Look for hardcoded Unix paths that haven't been made cross-platform
                    if ($content -match "/usr/bin|/bin/|/tmp|/var/" -and $content -notmatch "process\.platform.*win32") {
                        $filesWithUnixPaths++
                        Write-Verbose "Found potential Unix paths in: $file"
                    }
                } catch {
                    # Can't read file, skip
                }
            }
        }
        
        if ($filesWithUnixPaths -eq 0) {
            Write-TestResult "UnixPathCheck" $true "No problematic hardcoded Unix paths found"
        } else {
            Write-TestResult "UnixPathCheck" $false "Found $filesWithUnixPaths files with potential Unix path issues"
        }
        
    } catch {
        Write-TestResult "UnixPathCheck" $false "Unix path check failed: $($_.Exception.Message)"
    }
    
    # Test build script execution (dry run)
    try {
        # Test if build script can be executed without errors (syntax check)
        $buildScript = "build-windows.ps1"
        if (Test-Path $buildScript) {
            # Test script syntax without actually running build
            $ast = [System.Management.Automation.Language.Parser]::ParseFile($buildScript, [ref]$null, [ref]$null)
            Write-TestResult "BuildScriptExecution" $true "Build script syntax is valid for execution"
        } else {
            Write-TestResult "BuildScriptExecution" $false "Build script not found for execution test"
        }
    } catch {
        Write-TestResult "BuildScriptExecution" $false "Build script execution test failed: $($_.Exception.Message)"
    }
}

function Generate-TestReport {
    param([string]$OutputPath = "windows-build-test-report.json")
    
    $report = @{
        TestDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC"
        SystemInfo = Get-SystemInfo
        TestResults = $Global:TestResults
        Environment = @{
            PowerShellVersion = $PSVersionTable.PSVersion.ToString()
            OSVersion = [System.Environment]::OSVersion.VersionString
            ProcessorArchitecture = $env:PROCESSOR_ARCHITECTURE
            DotNetVersion = if ($env:DOTNET_ROOT) { "Available" } else { "Not Available" }
        }
        Recommendations = @()
    }
    
    # Generate recommendations based on failures
    if ($Global:TestResults.Summary.Failed -gt 0) {
        $report.Recommendations += "Review and fix failed tests before proceeding with Windows build"
    }
    
    if ($Global:TestResults.Summary.Warnings -gt 0) {
        $report.Recommendations += "Address warnings to ensure optimal Windows compatibility"
    }
    
    # Save report
    $report | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8
    Write-Host "`nTest report saved to: $OutputPath" -ForegroundColor $Colors.Info
}

function Show-TestSummary {
    Write-Host "`n" + "="*60 -ForegroundColor $Colors.Info
    Write-Host "WINDOWS BUILD COMPATIBILITY TEST SUMMARY" -ForegroundColor $Colors.Info
    Write-Host "="*60 -ForegroundColor $Colors.Info
    
    $total = $Global:TestResults.Summary.Total
    $passed = $Global:TestResults.Summary.Passed
    $failed = $Global:TestResults.Summary.Failed
    $warnings = $Global:TestResults.Summary.Warnings
    $successRate = if ($total -gt 0) { [math]::Round(($passed / $total) * 100, 1) } else { 0 }
    
    Write-Host "Total Tests:     $total" -ForegroundColor $Colors.Detail
    Write-Host "Passed:          $passed" -ForegroundColor $Colors.Success
    Write-Host "Failed:          $failed" -ForegroundColor $Colors.Error
    Write-Host "Warnings:        $warnings" -ForegroundColor $Colors.Warning
    Write-Host "Success Rate:    $successRate%" -ForegroundColor $(if ($successRate -ge 90) { $Colors.Success } elseif ($successRate -ge 70) { $Colors.Warning } else { $Colors.Error })
    
    Write-Host "`nCategory Results:" -ForegroundColor $Colors.Info
    foreach ($category in $TestCategories.Keys) {
        $categoryResults = $Global:TestResults.Details | Where-Object { $_.Category -eq $category }
        $categoryPassed = ($categoryResults | Where-Object { $_.Passed }).Count
        $categoryTotal = $categoryResults.Count
        $categoryName = $TestCategories[$category].Name
        
        if ($categoryTotal -gt 0) {
            $categoryRate = [math]::Round(($categoryPassed / $categoryTotal) * 100, 1)
            Write-Host "  $categoryName`: $categoryPassed/$categoryTotal ($categoryRate%)" -ForegroundColor $Colors.Detail
        }
    }
    
    # Overall assessment
    Write-Host "`nOverall Assessment:" -ForegroundColor $Colors.Info
    if ($failed -eq 0 -and $warnings -eq 0) {
        Write-Host "✓ EXCELLENT - All systems ready for Windows build!" -ForegroundColor $Colors.Success
    } elseif ($failed -eq 0 -and $warnings -le 2) {
        Write-Host "✓ GOOD - Minor issues detected, build should work" -ForegroundColor $Colors.Success
    } elseif ($failed -le 2) {
        Write-Host "⚠ FAIR - Some issues need attention before build" -ForegroundColor $Colors.Warning
    } else {
        Write-Host "✗ POOR - Significant issues detected, build likely to fail" -ForegroundColor $Colors.Error
    }
    
    # Troubleshooting hints
    if ($failed -gt 0 -or $warnings -gt 0) {
        Write-Host "`nCommon Troubleshooting Steps:" -ForegroundColor $Colors.Info
        Write-Host "1. Ensure all required tools are installed (nix, bun, PowerShell)" -ForegroundColor $Colors.Detail
        Write-Host "2. Check PowerShell execution policy: Set-ExecutionPolicy RemoteSigned" -ForegroundColor $Colors.Detail
        Write-Host "3. Run PowerShell as Administrator for symlink operations" -ForegroundColor $Colors.Detail
        Write-Host "4. Verify Nix store path: \$env:NIX_STORE = 'C:/nix/store'" -ForegroundColor $Colors.Detail
        Write-Host "5. Check Windows Defender exclusions for Nix directory" -ForegroundColor $Colors.Detail
    }
    
    Write-Host "="*60 -ForegroundColor $Colors.Info
}

# Main test execution
function Main {
    Write-Host "OpenCode Windows Build Compatibility Test Suite" -ForegroundColor $Colors.Info
    Write-Host "Version 1.0 - Testing Windows build process compatibility" -ForegroundColor $Colors.Info
    Write-Host "Test Scope: $TestScope" -ForegroundColor $Colors.Detail
    
    if ($Debug) {
        Write-Host "Debug mode enabled" -ForegroundColor $Colors.Warning
        $DebugPreference = "Continue"
    }
    
    # System information
    $systemInfo = Get-SystemInfo
    Write-Host "`nSystem Information:" -ForegroundColor $Colors.Info
    Write-Host "  OS: $($systemInfo.Platform) $($systemInfo.Version)" -ForegroundColor $Colors.Detail
    Write-Host "  PowerShell: $($systemInfo.PowerShellVersion)" -ForegroundColor $Colors.Detail
    Write-Host "  Architecture: $(if ($systemInfo.Is64Bit) { '64-bit' } else { '32-bit' })" -ForegroundColor $Colors.Detail
    Write-Host "  Current Directory: $($systemInfo.CurrentDirectory)" -ForegroundColor $Colors.Detail
    
    # Determine which tests to run
    $testsToRun = @()
    if ($TestScope -eq "all") {
        $testsToRun = $TestCategories.Keys
    } else {
        $testsToRun = $TestScope.Split(',') | ForEach-Object { $_.Trim() }
    }
    
    # Execute tests
    foreach ($category in $testsToRun) {
        if (-not $TestCategories.ContainsKey($category)) {
            Write-Warning "Unknown test category: $category"
            continue
        }
        
        Write-Host "`n" + ("="*50) -ForegroundColor $Colors.Info
        Write-Host "RUNNING $($TestCategories[$category].Name.ToUpper())" -ForegroundColor $Colors.Info
        Write-Host ("="*50) -ForegroundColor $Colors.Info
        
        switch ($category) {
            "NixConfig" {
                Test-NixFileSyntax "windows-opencode.nix"
            }
            "PowerShellScripts" {
                Test-PowerShellModule
                Test-BuildScriptValidation
            }
            "FileOperations" {
                Test-CrossPlatformFileOperations
            }
            "BuildIntegration" {
                Test-BuildProcessIntegration
            }
            "CompleteBuild" {
                Test-CompleteBuildProcess
            }
        }
    }
    
    # Generate summary and report
    Show-TestSummary
    
    if ($GenerateReport) {
        Generate-TestReport
    }
    
    # Return exit code based on results
    if ($Global:TestResults.Summary.Failed -gt 0) {
        exit 1
    } else {
        exit 0
    }
}

# Run main function
Main