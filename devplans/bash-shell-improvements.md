# Bash and Shell Improvements (5a87a6ab-exclusive)

This document tracks the status of the bash and shell improvements that are exclusive to the 5a87a6ab branch point.

## Status: Completed ✅

All core functionality has been implemented and verified with automated tests.

## Key Upgrades

### 1. CMD Exit Code Normalization
- **Non-existent commands**: Normalized to exit code `9009` (standard CMD behavior) instead of generic shell errors.
- **`if not exist` commands**: Correctly returns exit code `1` when the condition is met (e.g., file missing), aligning with user expectations for branch logic.
- **Pipe operations**: Improved exit code handling for piped commands (e.g., `dir | findstr`) to ensure success codes are correctly propagated.

### 2. Shell Command Routing
- **Bare CMD Builtins**: Automatically routes bare CMD commands (like `dir`, `copy`, `type`) to `cmd /c` with appropriate arguments (e.g., `/a` for `dir`).
- **PowerShell Integration**: Correctly identifies PowerShell/pwsh commands and routes them to the appropriate executable with proper argument handling.
- **Delayed Expansion**: Automatically enables delayed expansion (`/V:ON`) and converts `%VAR%` to `!VAR!` in chained CMD commands to ensure dynamic variable resolution works as expected.

### 3. Output Post-processing
- **PowerShell Error Enhancement**: Automatically detects common PowerShell errors (like missing cmdlets or unsupported parameters) and provides helpful suggestions (e.g., suggesting `Select-Object` when `-First` is used with `Format-Table`).
- **CMD Variable Trimming**: Strips trailing quotes from variable expansions in CMD output to prevent path resolution issues.

### 4. Diff Normalization
- **Line-Trimmed Diffs**: Implemented `trimDiff` in the EditTool to remove unnecessary common indentation from diff blocks, making the output more readable and consistent.

## Verification

The following test suites have been created/updated and are passing:
- `packages/opencode/test/tool/bash_upgrades.test.ts`: Integration and unit tests for CMD/PowerShell upgrades.
- `packages/opencode/test/shell/shell_upgrades.test.ts`: Unit tests for command routing and shell logic.
- `packages/opencode/test/tool/edit_upgrades.test.ts`: Unit tests for diff trimming logic.

## Remaining Risks / Next Steps
- None. All targeted upgrades for the 5a87a6ab branch point are verified.
