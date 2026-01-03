# PowerShell Build Wrapper for OpenCode Windows Build
# This script handles Windows-specific environment setup and build process

param(
    [string]$Target = "x86_64-windows",
    [string]$Architecture = "x86_64",
    [switch]$Verbose,
    [switch]$Debug
)

# Set strict mode for better error handling
Set-StrictMode -Version Latest

# Enable verbose output if requested
if ($Verbose) {
    $VerbosePreference = "Continue"
}

# Windows-specific environment setup
$env:NIX_TARGET_PLATFORM = $Target
$env:BUN_INSTALL_CACHE_DIR = "$env:TEMP\opencode-bun-cache"
$env:HOME = $env:TEMP

# Create cache directories
$null = New-Item -ItemType Directory -Force -Path $env:BUN_INSTALL_CACHE_DIR
$null = New-Item -ItemType Directory -Force -Path "$env:TEMP\opencode-home"

# Set PowerShell-specific environment variables
$env:POWERSHELL_TELEMETRY_OPTOUT = "1"
$env:DOTNET_CLI_TELEMETRY_OPTOUT = "1"

# Configure Windows paths for Nix
$nixStorePath = if ($env:NIX_STORE) { $env:NIX_STORE } else { "C:/nix/store" }
$env:NIX_STORE = $nixStorePath

# Windows PowerShell execution policy (if needed)
try {
    $executionPolicy = Get-ExecutionPolicy -Scope CurrentUser
    if ($executionPolicy -eq "Restricted") {
        Write-Warning "PowerShell execution policy is restricted. Some operations may fail."
    }
} catch {
    Write-Warning "Could not check execution policy: $_"
}

# Function to run nix build with Windows-specific flags
function Invoke-WindowsNixBuild {
    param(
        [string]$PackagePath = ".",
        [string]$Target,
        [string]$OutLink
    )
    
    Write-Host "Starting Windows Nix build for target: $Target" -ForegroundColor Green
    Write-Host "Build started at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
    
    # Set Windows-specific Nix environment variables
    $env:NIX_SYSTEM = $Target
    $env:NIX_TARGET_SYSTEM = $Target
    
    # Create build log file
    $buildLogFile = "$env:TEMP\opencode-build-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
    Write-Host "Build log will be saved to: $buildLogFile" -ForegroundColor Yellow
    
    # Nix build command with Windows-specific parameters
    $nixArgs = @(
        "build"
        "--system", $Target
        "--no-substitute"
        "--print-build-logs"
    )
    
    # Add verbose flag if requested
    if ($Verbose) {
        $nixArgs += "--verbose"
    }
    
    # Add package path
    if ($PackagePath -ne ".") {
        $nixArgs += $PackagePath
    }
    
    # Determine which nix file to use
    $nixFile = if (Test-Path "nix\windows-opencode.nix") {
        "nix\windows-opencode.nix"
    } elseif (Test-Path "nix\opencode.nix") {
        "nix\opencode.nix"
    } else {
        Write-Error "No Nix file found (tried windows-opencode.nix and opencode.nix)"
        return $false
    }
    
    # Run nix build with enhanced error handling
    Write-Host "Executing: nix $($nixArgs -join ' ')" -ForegroundColor Yellow
    Write-Host "Using Nix file: $nixFile" -ForegroundColor Cyan
    
    try {
        # Capture both stdout and stderr with timestamps
        $buildOutput = & nix @nixArgs 2>&1
        $buildResult = $LASTEXITCODE
        
        # Write build output to log file with timestamps
        "Build started: $(Get-Date)" | Out-File -FilePath $buildLogFile -Encoding UTF8
        "Target: $Target" | Out-File -FilePath $buildLogFile -Append -Encoding UTF8
        "Command: nix $($nixArgs -join ' ')" | Out-File -FilePath $buildLogFile -Append -Encoding UTF8
        "" | Out-File -FilePath $buildLogFile -Append -Encoding UTF8
        $buildOutput | Out-File -FilePath $buildLogFile -Append -Encoding UTF8
        "" | Out-File -FilePath $buildLogFile -Append -Encoding UTF8
        "Build completed: $(Get-Date)" | Out-File -FilePath $buildLogFile -Append -Encoding UTF8
        "Exit code: $buildResult" | Out-File -FilePath $buildLogFile -Append -Encoding UTF8
        
        # Display build output in real-time if verbose
        if ($Verbose) {
            foreach ($line in $buildOutput) {
                Write-Host $line
            }
        }
        
        if ($buildResult -eq 0) {
            Write-Host "Build completed successfully!" -ForegroundColor Green
            Write-Host "Build log saved to: $buildLogFile" -ForegroundColor Green
            return $true
        } else {
            Write-Host "Build failed with exit code: $buildResult" -ForegroundColor Red
            Write-Host "Full build log available at: $buildLogFile" -ForegroundColor Yellow
            
            # Show last few lines of error output for quick diagnosis
            $errorLines = $buildOutput | Select-Object -Last 10
            Write-Host "Recent error output:" -ForegroundColor Red
            foreach ($line in $errorLines) {
                Write-Host "  $line" -ForegroundColor Red
            }
            
            Write-Host "" -ForegroundColor Yellow
            Write-Host "Troubleshooting suggestions:" -ForegroundColor Yellow
            Write-Host "1. Check the full build log: $buildLogFile" -ForegroundColor Yellow
            Write-Host "2. Ensure all dependencies are installed" -ForegroundColor Yellow
            Write-Host "3. Verify Nix configuration: nix doctor" -ForegroundColor Yellow
            Write-Host "4. Try cleaning the build: nix-store --gc" -ForegroundColor Yellow
            
            return $false
        }
        
    } catch {
        Write-Host "Build execution failed with exception:" -ForegroundColor Red
        Write-Host "  $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Stack trace:" -ForegroundColor Red
        Write-Host "  $($_.ScriptStackTrace)" -ForegroundColor Red
        "Exception occurred: $(Get-Date)" | Out-File -FilePath $buildLogFile -Append -Encoding UTF8
        "Error: $_" | Out-File -FilePath $buildLogFile -Append -Encoding UTF8
        return $false
    }
}

# Function to handle Windows path conversions
function ConvertTo-WindowsPath {
    param([string]$UnixPath)
    
    # Convert Unix-style paths to Windows format
    $windowsPath = $UnixPath -replace '/', '\'
    $windowsPath = $windowsPath -replace '\\nix\\store', 'C:\nix\store'
    
    return $windowsPath
}

# Function to set Windows file permissions
function Set-WindowsFilePermissions {
    param(
        [string]$Path,
        [string]$User = "Everyone",
        [string]$Rights = "FullControl"
    )
    
    try {
        # Use icacls to set permissions
        & icacls $Path /grant "$User`:$Rights" /T /C | Out-Null
        Write-Verbose "Set permissions for $Path"
    } catch {
        Write-Warning "Could not set permissions for $Path : $_"
    }
}

# Main build process
Write-Host "OpenCode Windows Build Script" -ForegroundColor Cyan
Write-Host "Target: $Target" -ForegroundColor Yellow
Write-Host "Architecture: $Architecture" -ForegroundColor Yellow

# Check if we're in the right directory
if (-not (Test-Path "nix\opencode.nix") -and -not (Test-Path "nix\windows-opencode.nix")) {
    Write-Error "Not in the correct OpenCode directory. Please run from the project root."
    exit 1
}

# Validate target architecture
$validTargets = @("x86_64-windows", "aarch64-windows")
if ($Target -notin $validTargets) {
    Write-Error "Invalid target: $Target. Valid targets are: $($validTargets -join ', ')"
    exit 1
}

# Check for required tools with comprehensive validation
$requiredTools = @("nix")
$optionalTools = @("bun")

Write-Host "Validating required tools..." -ForegroundColor Yellow

foreach ($tool in $requiredTools) {
    $toolPath = Get-Command $tool -ErrorAction SilentlyContinue
    if (-not $toolPath) {
        Write-Error "FATAL: Required tool '$tool' not found in PATH"
        Write-Error "Please install $tool and ensure it's in your PATH"
        Write-Host "Visit https://nixos.org/download/ to install Nix" -ForegroundColor Cyan
        exit 1
    }
    Write-Host "✓ Found $tool at: $($toolPath.Source)" -ForegroundColor Green
}

foreach ($tool in $optionalTools) {
    $toolPath = Get-Command $tool -ErrorAction SilentlyContinue
    if (-not $toolPath) {
        Write-Warning "Optional tool '$tool' not found - some features may not work"
        Write-Host "Visit https://bun.sh to install Bun" -ForegroundColor Cyan
    } else {
        Write-Host "✓ Found optional tool $tool at: $($toolPath.Source)" -ForegroundColor Green
    }
}

# Additional nix-specific validation
Write-Host "Validating Nix configuration..." -ForegroundColor Yellow
try {
    $nixVersion = & nix --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Nix version: $nixVersion" -ForegroundColor Green
    } else {
        throw "Nix version check failed"
    }
} catch {
    Write-Error "FATAL: Nix is not properly configured"
    Write-Error "Please ensure Nix is installed and configured correctly"
    Write-Host "Run: sh <(curl -L https://nixos.org/nix/install) --daemon" -ForegroundColor Cyan
    exit 1
}

# Check nix store access
try {
    $nixStoreTest = & nix store info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Nix store access test failed - this may cause build issues"
        Write-Host "Try running: nix-store --verify" -ForegroundColor Yellow
    } else {
        Write-Host "✓ Nix store accessible" -ForegroundColor Green
    }
} catch {
    Write-Warning "Could not verify Nix store access: $_"
}

# Run the build
try {
    $buildSuccess = Invoke-WindowsNixBuild -Target $Target
    
    if ($buildSuccess) {
        Write-Host "Build process completed successfully!" -ForegroundColor Green
        
        # Additional Windows-specific post-build tasks
        Write-Host "Running Windows-specific post-build tasks..." -ForegroundColor Yellow
        
        # Check for result
        if (Test-Path "result\bin\opencode.exe") {
            Write-Host "OpenCode executable created successfully!" -ForegroundColor Green
            Write-Host "Location: $(Resolve-Path 'result\bin\opencode.exe')" -ForegroundColor Cyan
        } else {
            Write-Warning "OpenCode executable not found in expected location"
        }
        
        # Set executable permissions (if needed)
        if (Test-Path "result\bin\opencode.exe") {
            Set-WindowsFilePermissions -Path "result\bin\opencode.exe"
        }
        
    } else {
        Write-Error "Build process failed!"
        exit 1
    }
    
} catch {
    Write-Error "Build process encountered an error: $_"
    exit 1
} finally {
    # Cleanup temporary directories
    if (Test-Path $env:BUN_INSTALL_CACHE_DIR) {
        Remove-Item -Recurse -Force $env:BUN_INSTALL_CACHE_DIR -ErrorAction SilentlyContinue
    }
}

Write-Host "Windows build process completed!" -ForegroundColor Green