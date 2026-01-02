---
description: Build and Run OpenCode Desktop GUI (Conflict-Free Version)
---

# Build and Run OpenCode Desktop GUI (Conflict-Free Version)

This workflow builds and runs a conflict-free version of the OpenCode desktop GUI that won't interfere with existing OpenCode instances.

## Prerequisites

1. All workspace dependencies must be installed
2. Missing workspace packages must be created (plugin, script, sdk, util)
3. All required util modules must be available

## Conflict-Free Configuration

This version uses:
- **Product Name**: "OpenCode Dev v2" (instead of "OpenCode Dev")
- **App Identifier**: "ai.opencode.desktop.dev2" (instead of "ai.opencode.desktop.dev")
- **Binary Name**: "OpenCodeDev2" (instead of "OpenCode")
- **Frontend Port**: 1421 (instead of 1420)
- **HMR Port**: 1422 (instead of 1421)

## Steps

1. **Install Dependencies**
   ```bash
   cd e:\code\OpenCode-Helping\opencode
   bun install
   ```

2. **Build Opencode Package**
   ```bash
   cd e:\code\OpenCode-Helping\opencode\packages\opencode
   bun run build --single
   ```

3. **Start Backend Server** (REQUIRED for GUI to work)
   ```bash
   cd e:\code\OpenCode-Helping\opencode\packages\opencode
   bun run dev
   ```

4. **Set Environment Variable**
   ```bash
   $env:TAURI_ENV_TARGET_TRIPLE="x86_64-pc-windows-msvc"
   ```

5. **Run Desktop GUI with Tauri (Conflict-Free)**
   ```bash
   cd e:\code\OpenCode-Helping\opencode\packages\desktop
   bun run tauri dev
   ```

## Permanent Fix for Blank GUI

**Issue**: GUI appears blank because frontend can't connect to backend server.

**Solution**: Always start backend server first (step 3) before running GUI (step 5).

**Why This Works**:
- Frontend runs on port 1421 
- Backend runs on port 4096
- App connects to `http://localhost:4096` for data
- Both servers must be running for GUI to work properly

## What This Does

- Builds the opencode binary for current platform
- Starts Vite dev server on port 1421 (conflict-free)
- Launches Tauri with unique app identifier
- Opens OpenCode desktop GUI v2 without interfering with existing instances
- Uses different binary name to avoid process conflicts

## Success Indicators

- Tauri dev command starts without errors
- Frontend dev server starts on http://localhost:1421/
- Rust compilation completes successfully
- Desktop application window opens with "OpenCode Dev v2" title
- No port conflicts with existing OpenCode instances
- No bus subscription errors in console

## Troubleshooting

If port 1421 is already in use:
```bash
netstat -ano | findstr :1421
taskkill /F /PID <PID>
```

If missing dependencies:
- Ensure workspace packages have proper package.json files
- Check all util modules are created (error, fn, lazy, binary, encode, retry)
- Verify SDK v2/client module exists

## Running Multiple Versions

You can now run both versions simultaneously:
- **Original OpenCode**: http://localhost:1420/
- **Conflict-Free Version**: http://localhost:1421/

## Notes

- This process takes 2-3 minutes for initial build
- Subsequent runs are faster due to caching
- The desktop app will auto-reload on code changes
- All original bus subscription errors should be resolved with the ultra-defensive bus system
- Different app identifier prevents system conflicts
