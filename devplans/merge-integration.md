# Merge and Integration Plan

This document tracks the status of merging and integrating features from upstream branches/commits.

## Status: In Progress 🚧

## Completed Tasks ✅

### 1. Token Counting Accuracy & Streaming Logic (d7aefec Merge)
- **Problem**: Double-counting tokens in the message creation pipeline and inaccurate token estimates during streaming when providers don't return usage info.
- **Solution**: Integrated upstream fixes from `d7aefec` with a "best of both worlds" approach, adding character-based tracking for fallback estimates.
- **Changes**:
    - **Token Utility**: Added `calculateToolResultTokens`, `toCharCount`, and `toTokenEstimate` in `packages/opencode/src/util/token.ts` for robust token estimation and safety.
    - **Streaming Accumulation**: Added character-based accumulation in `packages/opencode/src/session/processor.ts` to track reasoning and text length during streaming.
    - **Fallback Logic**: Implemented fallback token estimation in `processor.ts`'s `finish-step` using character counts when provider usage info is missing.
    - **Double-Counting Fix**: Updated `packages/opencode/src/session/prompt.ts` to use the spread operator (`...info.tokens`) to preserve existing token fields during message updates, preventing overwriting manual or accumulated counts.
    - **Refined Filtering**: Enhanced message filtering in `prompt.ts` to exclude ignored parts from token estimation.
- **Verification**: Logic reviewed for consistency with existing pipeline. All types verified and clean diagnostics.

### 2. Enhanced Exit Safety (91b50654ce74 Merge)
- **Feature**: Double-press confirmation for exiting the TUI.
- **Changes**:
    - Added `tryExit` function with a 2-second threshold and toast notification.
    - Integrated `tryExit` into the `app_exit` keybind handler in `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`.
    - Applied `tryExit` to the `submit` function for "exit", "quit", and ":q" commands for consistency.
- **Verification**: Malformed code in original commit fixed during integration.

### 3. Grep Performance & Filesystem Utility (c1f54f2 Merge)
- **Changes**:
    - [x] Integrated high-performance `grep.ts` changes.
    - [x] Restored `MATCH_LIMIT` to 250 (was 100 in upstream).
    - [x] Restored and optimized modTime sorting using batched `stat` calls for unique files.
    - [x] Switched to `Filesystem` utility for cross-platform path resolution.
    - [x] Preserved current branch's Windows line-ending support.

### 4. Project Cache Stability & Expanded Test Suite (2c7607f5 Merge)
...
- **Verification**: All 13 tests in the integrated suite passed successfully.

### 5. Graceful Shutdown & Port Reuse (186521796 Merge)
- **Feature**: Improved server lifecycle management for the `serve` command.
- **Changes**:
    - **Graceful Shutdown**: Added signal handlers (`SIGINT`, `SIGTERM`, `SIGBREAK`) in `packages/opencode/src/cli/cmd/serve.ts` to ensure `server.stop()` is called.
    - **Port Reuse**: Enabled `reusePort: true` in `packages/opencode/src/server/server.ts` for faster restarts.
- **Verification**: Verified clean diagnostics and logic consistency.

### 6. Desktop Server Health Cleanup (3779d0fc Merge)
- **Feature**: Refactored server health check logic in the desktop app.
- **Changes**:
    - **Helper Function**: Added `url_is_localhost` in `packages/desktop/src-tauri/src/lib.rs` for robust loopback detection.
    - **URL Handling**: Improved URL parsing and joining for health checks.
    - **Proxy Bypass**: Ensured `no_proxy()` is applied when connecting to a local sidecar to avoid interference from environment variables.
- **Verification**: Logic verified against existing `remerge` branch state. Conflict in `spawn_sidecar` resolved by preserving the more advanced `--hostname` support while keeping the health check improvements.

### 7. Markdown Context Synchronization (213c0e18 Merge)
- **Problem**: "useMarked must be used within a MarkedProvider" error due to duplicate context instances between `packages/app` and `packages/ui`.
- **Solution**: Synchronized SolidJS context between packages by exporting the underlying context from the UI package and using it in the App package.
- **Changes**:
    - **Context Helper**: Modified `packages/ui/src/context/helper.tsx` to expose the internal context object from `createSimpleContext`.
    - **Marked Context**: Exported `MarkedContext` from `packages/ui/src/context/marked.tsx`.
    - **App Context**: Refactored `packages/app/src/context/marked.tsx` to use the shared `MarkedContext` and support `nativeParser` integration.
    - **App Integration**: Added `MarkedProviderWithNativeParser` in `packages/app/src/app.tsx` to inject platform-specific markdown parsing.
- **Verification**: Fixed the context mismatch error while preserving the local file structure. Verified with `tsc --noEmit`.

## Next Steps ⏭️

...
- Monitor for other unmerged features from the `91b50654ce74` branch point.
- Continue resolving merge conflicts with "best of both worlds" philosophy.
