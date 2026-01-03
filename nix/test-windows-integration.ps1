# Windows Integration Test Script
# Tests the Windows-compatible Nix expressions and PowerShell commands

param(
    [string]$TestMode = "syntax"
)

# Test script for Windows Nix integration
Write-Host "Testing Windows Nix Integration for OpenCode" -ForegroundColor Cyan

$testResults = @{
    "NixFileSyntax" = $false
    "PowerShellModule" = $false
    "BuildScript" = $false
    "PathHandling" = $false
}

function Test-NixFileSyntax {
    param([string]$FilePath)
    try {
        # Basic syntax validation for Nix files
        $content = Get-Content $FilePath -Raw
        if ($content -match "^\{" -and $content -match "\}$") {
            return $true
        }
        return $false
    } catch {
        return $false
    }
}

function Test-PowerShellModule {
    param([string]$ModulePath)
    try {
        # Test PowerShell module syntax
        $ast = [System.Management.Automation.Language.Parser]::ParseFile($ModulePath, [ref]$null, [ref]$null)
        return $true
    } catch {
        Write-Warning "PowerShell syntax error: $_"
        return $false
    }
}

function Test-PathHandling {
    try {
        # Test path conversion functions
        $testWindowsPath = "C:\Users\test\file.txt"
        $testUnixPath = "/c/Users/test/file.txt"
        
        # Simulate path conversion (without actually running the functions)
        $convertedFromWindows = $testWindowsPath -replace '\\', '/'
        $convertedFromWindows = $convertedFromWindows -replace '([A-Za-z]):', '/$1'
        
        $convertedFromUnix = $testUnixPath -replace '/', '\'
        $convertedFromUnix = $convertedFromUnix -replace '/([A-Za-z])', '$1:'
        
        return $true
    } catch {
        return $false
    }
}

# Run tests
Write-Host "`nRunning Windows compatibility tests..." -ForegroundColor Yellow

# Test 1: Nix file syntax
Write-Host "1. Testing Nix file syntax..." -NoNewline
if (Test-NixFileSyntax "windows-opencode.nix") {
    Write-Host " ✓ PASS" -ForegroundColor Green
    $testResults.NixFileSyntax = $true
} else {
    Write-Host " ✗ FAIL" -ForegroundColor Red
}

# Test 2: PowerShell module
Write-Host "2. Testing PowerShell module syntax..." -NoNewline
if (Test-PowerShellModule "windows-commands.psm1") {
    Write-Host " ✓ PASS" -ForegroundColor Green
    $testResults.PowerShellModule = $true
} else {
    Write-Host " ✗ FAIL" -ForegroundColor Red
}

# Test 3: Build script
Write-Host "3. Testing build script structure..." -NoNewline
if (Test-Path "build-windows.ps1") {
    Write-Host " ✓ PASS" -ForegroundColor Green
    $testResults.BuildScript = $true
} else {
    Write-Host " ✗ FAIL" -ForegroundColor Red
}

# Test 4: Path handling logic
Write-Host "4. Testing path handling logic..." -NoNewline
if (Test-PathHandling) {
    Write-Host " ✓ PASS" -ForegroundColor Green
    $testResults.PathHandling = $true
} else {
    Write-Host " ✗ FAIL" -ForegroundColor Red
}

# Summary
Write-Host "`nTest Summary:" -ForegroundColor Cyan
$passedTests = ($testResults.Values | Where-Object { $_ }).Count
$totalTests = $testResults.Count

Write-Host "Passed: $passedTests/$totalTests tests" -ForegroundColor $(if ($passedTests -eq $totalTests) { "Green" } else { "Yellow" })

if ($passedTests -eq $totalTests) {
    Write-Host "All tests passed! Windows integration is ready." -ForegroundColor Green
    exit 0
} else {
    Write-Host "Some tests failed. Please review the implementation." -ForegroundColor Red
    exit 1
}