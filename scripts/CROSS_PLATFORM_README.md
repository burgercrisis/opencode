# Cross-Platform Scripts

This directory contains cross-platform Node.js/Bun scripts that replace Linux-specific shell scripts for Windows, macOS, and Linux compatibility.

## Converted Scripts

### 1. OpenCode Installer
- **Original**: `install`
- **New**: `scripts/install.ts`
- **Purpose**: Cross-platform installer for Windows/macOS/Linux
- **Usage**: `bun run install` or `bun scripts/install.ts`

### 2. Nix Hash Update Script
- **Original**: `nix/scripts/update-hashes.sh`
- **New**: `nix/scripts/update-hashes.ts`
- **Purpose**: Updates Nix package hashes for node_modules
- **Usage**: `bun run nix:update-hashes` or `bun nix/scripts/update-hashes.ts`

### 3. First-Time Contributors Analysis
- **Original**: `scripts/analyze-first-time-contributors.sh`
- **New**: `scripts/analyze-first-time-contributors.ts`
- **Purpose**: Analyzes first-time contributors from last 4 weeks
- **Usage**: `bun run analyze:first-time` or `bun scripts/analyze-first-time-contributors.ts`

### 4. Recent Weeks Analysis
- **Original**: `scripts/analyze-recent-weeks.sh`
- **New**: `scripts/analyze-recent-weeks.ts`
- **Purpose**: Analyzes GitHub issues from recent weeks
- **Usage**: `bun run analyze:recent` or `bun scripts/analyze-recent-weeks.ts`

## TypeScript Fixes

### Major Issues Resolved (Phases 1-3)

All critical TypeScript errors have been systematically resolved:

#### Phase 1: Quick Wins ✅
- **Legacy Script Removal**: Removed all bash scripts with TypeScript equivalents
- **Dependencies**: Added missing `hnswlib-node` dependency
- **Simple Type Issues**: Fixed URL assignment and unused directives

#### Phase 2: Critical Type Safety ✅
- **cli/error.ts**: Fixed 'data' property on 'never' type errors
- **session/retry.ts**: Fixed Promise property access and type inference issues
- **file/index.ts**: Fixed Promise<Entry> property access issues
- **src/index.ts**: Fixed instanceof and unknown type issues
- **config/config.ts**: Fixed function overload mismatches
- **lsp/client.ts**: Fixed function overload mismatches
- **provider/provider.ts**: Fixed function overload mismatches

#### Phase 3: Complex Issues ✅
- **provider/auth.ts**: Fixed missing AuthOuathResult export and type definitions
- **server.ts**: Fixed critical callable expressions and missing variable issues

### Remaining Issues
The remaining TypeScript errors are lower priority:
- Missing exports (`createOpencodeClient` vs `OpencodeClient`)
- Missing properties (`preview` property on version objects)
- Implicit 'any' types (function parameters need explicit typing)
- Missing properties (`home` property in Path type)

These issues do not block core functionality and can be addressed in future iterations.

## Features

### Cross-Platform Compatibility
- ✅ Windows (PowerShell/CMD) - Full support with native packages
- ✅ macOS (zsh/bash) - Full support with native packages  
- ✅ Linux (bash/zsh) - Full support with native packages

### Key Improvements
1. **No shell dependencies** - Uses Node.js/Bun built-in modules
2. **Proper error handling** - Cross-platform error management
3. **TypeScript support** - Type safety and better IDE support
4. **Consistent APIs** - Same behavior across all platforms
5. **Better cleanup** - Proper temp file management

### Dependencies
- **Bun** - Runtime and package manager
- **Node.js built-ins**: `fs`, `path`, `os`, `process`
- **No external dependencies** - Fully self-contained

## Migration Guide

### For Windows Users
Replace shell script calls:
```bash
# Old (requires WSL or Git Bash)
./scripts/analyze-first-time-contributors.sh

# New (native Windows)
bun run analyze:contributors
```

**Windows-specific benefits:**
- No need for WSL (Windows Subsystem for Linux)
- No need for Git Bash or Unix emulation
- Native PowerShell/CMD compatibility
- Windows-specific package dependencies in Nix (msys2, PowerShell)

### For macOS Users
Replace shell script calls:
```bash
# Old (requires bash/zsh)
./scripts/analyze-first-time-contributors.sh

# New (native macOS)
bun run analyze:contributors
```

### For CI/CD
Update GitHub Actions and other CI systems:
```yaml
# Old
- name: Analyze contributors
  run: ./scripts/analyze-first-time-contributors.sh

# New
- name: Analyze contributors
  run: bun run analyze:contributors
```

### For Development
All scripts are available as npm/bun scripts:
```bash
bun run analyze:contributors
bun run analyze:issues
bun run nix:update-hashes
```

## Technical Details

### Error Handling
- Cross-platform signal handling (SIGINT, SIGTERM)
- Proper cleanup of temporary files
- Graceful error messages and exit codes

### File System Operations
- Uses `path.join()` for cross-platform paths
- Proper permission handling (Windows vs Unix)
- Safe temporary file creation and cleanup

### Network Operations
- Uses `fetch()` API (available in Bun/Node.js)
- Proper timeout and error handling
- JSON parsing with error handling

## Nix Package Manager Support

### Windows Compatibility
The project now supports Windows through Nix with:
- **Windows targets**: `aarch64-windows`, `x86_64-windows`
- **Windows Bun binaries**: `bun-windows-arm64`, `bun-windows-x64`
- **Windows-specific packages**: msys2, PowerShell
- **Cross-platform development shells**

### Nix Commands on Windows
```bash
# Development shell with Windows packages
nix develop

# Build for Windows
nix build .#packages.x86_64-windows.default

# Update hashes for Windows
bun run nix:update-hashes SYSTEM=x86_64-windows
```

## Testing

To test the scripts on different platforms:

```bash
# Test all scripts
bun run install
bun run analyze:contributors
bun run analyze:issues
bun run nix:update-hashes

# Test individual scripts
bun scripts/install.ts
bun scripts/analyze-first-time-contributors.ts
bun scripts/analyze-recent-weeks.ts
bun nix/scripts/update-hashes.ts
```

## Troubleshooting

### Common Issues

1. **Permission denied**: Make sure scripts are executable
   ```bash
   chmod +x scripts/*.ts nix/scripts/*.ts
   ```

2. **Bun not found**: Install Bun first
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

3. **Network errors**: Check internet connection and API rate limits

4. **Temp file issues**: Ensure write permissions to temp directory

### Debug Mode
Add environment variable for debug output:
```bash
DEBUG=1 bun run analyze:contributors
```

## Contributing

When adding new cross-platform scripts:

1. Use TypeScript for type safety
2. Handle all platform-specific edge cases
3. Add proper error handling and cleanup
4. Include usage examples in this README
5. Add npm/bun script entries to package.json
6. Test on Windows, macOS, and Linux

## Legacy Scripts

The original shell scripts have been removed and replaced with cross-platform TypeScript versions:
- `install` (bash installer) → `scripts/install.ts`
- `nix/scripts/update-hashes.sh` → `nix/scripts/update-hashes.ts`
- `scripts/analyze-first-time-contributors.sh` → `scripts/analyze-first-time-contributors.ts`
- `scripts/analyze-recent-weeks.sh` → `scripts/analyze-recent-weeks.ts`

All legacy bash scripts have been removed to avoid confusion and ensure only cross-platform versions are used.
