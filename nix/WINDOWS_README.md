# Windows Nix Build Integration for OpenCode

This directory contains Windows-compatible Nix expressions and PowerShell scripts to build OpenCode on Windows platforms.

## Files Created

### 1. `windows-opencode.nix`
Windows-specific Nix configuration that replaces Linux build tools with Windows equivalents:
- Uses `stdenv` instead of `stdenvNoCC` for Windows build environment
- Replaces Unix commands with PowerShell equivalents:
  - `cp` → `Copy-Item`
  - `chmod` → `icacls`
  - `ln` → `mklink` (Windows junctions)
  - `find` → `Get-ChildItem` with recursion
  - `grep` → `Select-String`
  - `sed` → PowerShell replace operators
- Handles Windows path formats (`\` separators)
- Supports both `x86_64-windows` and `aarch64-windows` targets

### 2. `build-windows.ps1`
PowerShell build wrapper that:
- Sets Windows-specific environment variables
- Runs nix build with Windows target flags
- Handles Windows path conventions
- Provides detailed build logging and error handling
- Validates build requirements and tools

### 3. `windows-commands.psm1`
PowerShell module providing Windows alternatives for Unix commands:
- **Find-Files**: Recursive file finding with filtering
- **Set-Permissions**: Windows ACL-based permission setting
- **New-SymLink**: Symbolic links and directory junctions
- **Copy-Files**: Enhanced file copying with attributes
- **Search-Text**: Text searching with regex support
- **Replace-Text**: Pattern-based text replacement
- **Set-Writable**: File attribute manipulation
- **Path conversion utilities**: Unix ↔ Windows path conversion

## Usage

### Building for Windows

```powershell
# Navigate to the project root
cd path\to\opencode

# Run the Windows build script
.\nix\build-windows.ps1 -Target "x86_64-windows"

# Or build for ARM64
.\nix\build-windows.ps1 -Target "aarch64-windows"

# Enable verbose output
.\nix\build-windows.ps1 -Target "x86_64-windows" -Verbose
```

### Manual Nix Build

```powershell
# Direct nix build command
nix build --system x86_64-windows .#packages.x86_64-windows.opencode

# Using the Windows-specific configuration
nix build --system x86_64-windows nix/windows-opencode.nix
```

### Using Windows Commands Module

```powershell
# Import the module
Import-Module .\nix\windows-commands.psm1

# Use Windows command alternatives
Find-Files -Path "." -Filter "*.ts" -FileType File
Set-Permissions -Path "script.sh" -Permission "Execute"
New-SymLink -Target "C:\source" -LinkPath "C:\link" -Type Junction
```

## Key Differences from Linux Build

### Path Handling
- **Windows**: Uses backslash (`\`) path separators
- **Linux**: Uses forward slash (`/`) path separators
- **Nix Store**: Windows uses `C:/nix/store` instead of `/nix/store`

### File Operations
- **Symlinks**: Windows uses `mklink` command for junctions
- **Permissions**: Windows uses ACL-based permissions via `icacls`
- **Executable**: No Unix-style executable bits, relies on file extensions

### Build Tools
- **Shell**: PowerShell instead of bash
- **File Copy**: `Copy-Item` instead of `cp -r`
- **Directory Creation**: `New-Item` instead of `mkdir -p`

## Windows-Specific Features

### Environment Variables
- `NIX_STORE`: Defaults to `C:/nix/store` on Windows
- `NIX_TARGET_PLATFORM`: Set to target architecture
- `BUN_INSTALL_CACHE_DIR`: Windows temp directory
- `HOME`: Set to temp directory for build isolation

### PowerShell Integration
- Full PowerShell cmdlet support
- Error handling with try/catch blocks
- Verbose output for debugging
- Cross-platform path conversion utilities

### Windows File System Support
- NTFS ACL permissions
- Directory junctions for Unix-like symlink behavior
- Windows-specific file attributes
- Case-insensitive path handling

## Integration with Existing Build

The Windows configuration is designed to work alongside the existing Linux build:

1. **Shared Components**: Node modules and package management remain the same
2. **Build Scripts**: Updated to use Windows PowerShell commands
3. **Platform Detection**: Automatic detection of Windows vs Linux paths
4. **Backward Compatibility**: Linux builds continue to work unchanged

## Requirements

### Prerequisites
- Windows 10/11 or Windows Server
- Nix installed on Windows
- PowerShell 5.1 or later
- Bun runtime for Windows

### Tools Needed
- `nix`: Nix package manager for Windows
- `bun`: JavaScript runtime and package manager
- `icacls`: Windows built-in permission tool
- `mklink`: Windows built-in symlink creation tool

## Troubleshooting

### Common Issues

1. **PowerShell Execution Policy**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. **Nix Store Path Issues**
   ```powershell
   $env:NIX_STORE = "C:/nix/store"
   ```

3. **Permission Denied Errors**
   ```powershell
   # Run PowerShell as Administrator
   Set-Permissions -Path "target" -Permission "FullControl" -User "Everyone" -Recursive
   ```

4. **Symlink Creation Failures**
   - Ensure Developer Mode is enabled in Windows Settings
   - Or run PowerShell as Administrator

### Debug Mode

Enable verbose logging for troubleshooting:

```powershell
.\nix\build-windows.ps1 -Target "x86_64-windows" -Verbose -Debug
```

## Performance Considerations

- Windows builds may be slower due to different I/O patterns
- PowerShell has different performance characteristics than bash
- Windows antivirus may scan Nix store contents
- Use Windows Developer Mode for better symlink performance

## Security Notes

- Windows ACLs provide granular permission control
- PowerShell execution policy affects script execution
- Windows Defender may interfere with Nix operations
- Consider adding Nix directory to Windows Defender exclusions

## Future Enhancements

Potential improvements for future Windows support:

1. **Windows Subsystem for Linux (WSL) Integration**
2. **Windows Package Manager (winget) integration**
3. **Windows Terminal optimization**
4. **PowerShell Core (pwsh) support**
5. **Windows Service integration**
6. **Windows Registry integration for system-wide installation