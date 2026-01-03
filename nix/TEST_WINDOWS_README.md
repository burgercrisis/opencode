# Windows Build Compatibility Test Suite

This directory contains a comprehensive test suite for validating Windows compatibility of the OpenCode build process.

## Test Script: `test-windows-build.ps1`

A comprehensive PowerShell script that validates all Windows-specific modifications and integrations for OpenCode.

### Features

- **Comprehensive Coverage**: Tests all 5 major areas of Windows compatibility
- **Detailed Reporting**: Provides detailed test results with success/failure status
- **Cross-Platform Validation**: Ensures Unix commands are properly replaced with Windows equivalents
- **Integration Testing**: Validates that all components work together correctly
- **Troubleshooting Guidance**: Provides specific guidance for common Windows issues

### Test Categories

#### 1. Nix Configuration Validation
- Validates `windows-opencode.nix` syntax
- Verifies Windows target platforms (x86_64-windows, aarch64-windows)
- Checks PowerShell command integration
- Validates path handling for Windows

#### 2. PowerShell Script Testing
- Tests `build-windows.ps1` script syntax and execution
- Validates `windows-commands.psm1` module imports
- Ensures all PowerShell cmdlets are available on Windows
- Checks error handling and parameter validation

#### 3. Cross-Platform File Operations
- Tests new cross-platform file operation functions
- Validates platform detection (`process.platform === 'win32'`)
- Ensures Node.js fs operations work on both Windows and Unix
- Tests path conversion utilities

#### 4. Build Process Integration
- Validates package.json scripts work with Windows commands
- Tests LSP server permission handling on Windows
- Checks archive/zip operations function correctly
- Validates environment setup

#### 5. Complete Build Test
- Tests the full build process using Windows tools
- Validates all Unix commands have been replaced
- Ensures no hardcoded Unix paths remain in critical files
- Provides comprehensive build readiness assessment

## Usage

### Basic Usage

```powershell
# Run all tests
.\nix\test-windows-build.ps1

# Run with verbose output
.\nix\test-windows-build.ps1 -Verbose

# Run specific test categories
.\nix\test-windows-build.ps1 -TestScope "NixConfig,PowerShellScripts"

# Skip integration tests (faster execution)
.\nix\test-windows-build.ps1 -SkipIntegration

# Generate detailed JSON report
.\nix\test-windows-build.ps1 -GenerateReport

# Combine options
.\nix\test-windows-build.ps1 -TestScope "NixConfig,PowerShellScripts" -Verbose -GenerateReport
```

### Command Line Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `TestScope` | String | Comma-separated list of test categories to run | "all" |
| `Verbose` | Switch | Enable verbose output | false |
| `Debug` | Switch | Enable debug mode | false |
| `SkipIntegration` | Switch | Skip integration tests | false |
| `GenerateReport` | Switch | Generate JSON report file | false |

### Test Categories

- `NixConfig`: Nix configuration validation
- `PowerShellScripts`: PowerShell script testing
- `FileOperations`: Cross-platform file operations
- `BuildIntegration`: Build process integration
- `CompleteBuild`: Complete build test

## Test Results

### Output Format

The test script provides color-coded output:

- **✓ PASS**: Test passed successfully (Green)
- **✗ FAIL**: Test failed (Red) 
- **⚠ WARN**: Warning issued (Yellow)
- **Info**: Informational messages (Cyan)

### Example Output

```
[NixConfig] Testing Syntax Validation...
  ✓ PASS - NixFileSyntax
  ✓ PASS - PowerShellIntegration
  ✓ PASS - TargetPlatforms

[PowerShellScripts] Testing Module Import and Functions...
  ✓ PASS - ModuleSyntax
  ✓ PASS - ModuleImport
  ✓ PASS - FunctionAvailability

...

============================================================
WINDOWS BUILD COMPATIBILITY TEST SUMMARY
============================================================
Total Tests:     23
Passed:          21
Failed:          1
Warnings:        1
Success Rate:    91.3%

Overall Assessment:
✓ GOOD - Minor issues detected, build should work
============================================================
```

### JSON Report

When using `-GenerateReport`, a detailed JSON report is saved to `windows-build-test-report.json` containing:

- Complete test results with timestamps
- System information and environment details
- Failure analysis and recommendations
- Test execution statistics

## Troubleshooting

### Common Issues and Solutions

#### 1. PowerShell Execution Policy
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### 2. Missing Required Tools
Ensure these tools are installed and in PATH:
- **Nix**: Nix package manager for Windows
- **Bun**: JavaScript runtime and package manager
- **PowerShell**: PowerShell 5.1 or later

#### 3. Permission Issues
Run PowerShell as Administrator for:
- Symlink creation operations
- Setting file permissions
- Accessing protected directories

#### 4. Module Import Failures
```powershell
# If windows-commands.psm1 fails to import
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
Import-Module .\nix\windows-commands.psm1 -Force
```

#### 5. Nix Store Path Issues
```powershell
$env:NIX_STORE = "C:/nix/store"
```

### Test-Specific Troubleshooting

#### Nix Configuration Tests
- Ensure Nix is properly installed on Windows
- Check that Nix can access the Windows store path
- Verify PowerShell integration in Nix expressions

#### PowerShell Script Tests
- Check PowerShell execution policy
- Ensure all required PowerShell modules are available
- Verify script syntax with PowerShell ISE

#### File Operation Tests
- Run as Administrator if permission denied errors occur
- Check Windows Defender exclusions for test directory
- Ensure sufficient disk space for test operations

#### Build Integration Tests
- Verify Node.js and npm are available
- Check package.json scripts syntax
- Ensure all build dependencies are installed

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Windows Build Compatibility Test

on: [push, pull_request]

jobs:
  windows-compatibility:
    runs-on: windows-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup PowerShell
      run: |
        Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
        
    - name: Install Nix
      run: |
        # Install Nix on Windows
        # (Add actual Nix installation steps)
        
    - name: Install Bun
      run: |
        # Install Bun for Windows
        
    - name: Run Windows Compatibility Tests
      run: |
        .\nix\test-windows-build.ps1 -Verbose -GenerateReport
        
    - name: Upload Test Report
      uses: actions/upload-artifact@v3
      with:
        name: windows-build-test-report
        path: windows-build-test-report.json
```

### Local Development Workflow

```powershell
# Before making Windows-specific changes
.\nix\test-windows-build.ps1

# After implementing changes
.\nix\test-windows-build.ps1 -Verbose

# Before committing changes
.\nix\test-windows-build.ps1 -TestScope "NixConfig,PowerShellScripts,BuildIntegration"
```

## Performance Considerations

- **Full Test Suite**: ~2-5 minutes depending on system
- **Quick Tests**: ~30 seconds (NixConfig + PowerShellScripts only)
- **Integration Tests**: May take longer due to file system operations
- **JSON Report Generation**: Minimal overhead

## Extending the Test Suite

To add new tests:

1. Identify the appropriate test category
2. Add test function following the naming convention: `Test-CategoryName`
3. Use `Write-TestHeader`, `Write-TestResult`, and `Write-TestWarning` functions
4. Update the `$TestCategories` hash table
5. Test the new functionality

### Example Test Function

```powershell
function Test-NewFeature {
    Write-TestHeader "FileOperations" "New Feature Validation"
    
    try {
        # Test implementation
        $result = Test-Something
        
        if ($result) {
            Write-TestResult "NewFeature" $true "Feature works correctly"
        } else {
            Write-TestResult "NewFeature" $false "Feature failed"
        }
    } catch {
        Write-TestResult "NewFeature" $false "Test error: $($_.Exception.Message)"
    }
}
```

## Maintenance

### Regular Updates
- Update test scripts when new Windows features are added
- Review and update path handling for new file locations
- Add tests for new build process components

### Monitoring
- Track test success rates over time
- Monitor for new Windows-specific issues
- Update troubleshooting guidance based on user feedback

## Support

For issues with the test suite:

1. Check the troubleshooting section above
2. Run with `-Verbose` and `-Debug` flags
3. Generate a JSON report for detailed analysis
4. Check system requirements and dependencies

The test suite is designed to be comprehensive yet practical, providing actionable feedback for ensuring Windows build compatibility.