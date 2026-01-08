# Windows Command Execution - Minimal Fix

## What Went Wrong Last Time

The previous `-File` fix broke the app because:
1. Introduced complex `PowerShellExecutor` class with WASM dependencies
2. Created type errors that required `as any` workarounds
3. Changed file structure causing `calloc` WASM errors
4. Modified too much code at once

## Minimal Fix Approach

**Goal**: Change ONLY the PowerShell execution path, nothing else.

### Step 1: Add Simple Temp File Helper

**File**: `packages/opencode/src/tool/temp-file.ts`

```typescript
// Minimal temp file manager - no complex logic
const tempDir = Deno.env('TEMP') || Deno.env('TMP') || '/tmp';
let fileCounter = 0;

export function createTempPs1(content: string): string {
  const id = Date.now() + '-' + (++fileCounter);
  const path = `${tempDir}/opencode-${id}.ps1`;
  Deno.writeTextFileSync(path, content);
  return path;
}

export function deleteTempPs1(path: string): void {
  try {
    Deno.removeSync(path);
  } catch {
    // Ignore cleanup errors
  }
}
```

### Step 2: Modify Only PowerShell Execution

**File**: `packages/opencode/src/tool/bash.ts`

Find the PowerShell execution section (around line 280) and make a MINIMAL change:

```typescript
// BEFORE (around line 283):
const proc = Bun.spawn(cmd, { shell: true, ... });

// AFTER (minimal change):
import { createTempPs1, deleteTempPs1 } from './temp-file.ts';

async function executePowerShell(cmd: string, options: any): Promise<any> {
  // Check if this is a -Command invocation
  const commandMatch = cmd.match(/-Command\s+["'](.+?)["']/s);

  if (commandMatch) {
    // Extract command content
    const commandContent = commandMatch[1];
    const tempFile = createTempPs1(commandContent);

    try {
      // Replace -Command "..." with -File "..."
      const newCmd = cmd.replace(
        /-Command\s+["'].+?["']/s,
        `-File "${tempFile}"`
      );
      return await executeDirect(newCmd, options);
    } finally {
      deleteTempPs1(tempFile);
    }
  }

  // Not a -Command, execute as-is
  return executeDirect(cmd, options);
}
```

### Step 3: Route PowerShell Through Helper

```typescript
// In executeCommand() function, around line 250:

export async function executeCommand(cmd: string, options: any): Promise<any> {
  const { command } = parseCommand(cmd);

  // Minimal change: Route PowerShell through temp file helper
  if (command.match(/^powershell/i) || command.match(/^pwsh/i)) {
    if (options.platform === 'win32') {
      return executePowerShell(cmd, options);
    }
  }

  // All other commands: unchanged
  return executeDirect(cmd, options);
}
```

---

## Changes Summary

| File | Lines | Change |
|------|-------|--------|
| `temp-file.ts` | NEW (20 lines) | Simple temp file create/delete |
| `bash.ts` | ~260 | Add PowerShell routing check |
| `bash.ts` | ~285 | Add executePowerShell function |

**Total lines changed**: ~40 lines (minimal, surgical)

---

## What NOT to Change

❌ Don't modify `parseCommand()`
❌ Don't change stream handling
❌ Don't add new WASM dependencies
❌ Don't change CMD execution
❌ Don't modify exit code handling
❌ Don't touch other shell execution paths

---

## Testing Plan

1. **Before**: Run test prompt, verify 41% pass rate
2. **After**: Run same test prompt, verify ~95% pass rate
3. **Regression**: Verify CMD still works (100%)

---

## Rollback Plan

If this breaks:
1. Delete `temp-file.ts`
2. Remove PowerShell routing in bash.ts
3. Restore to original execution path

---

## Why This Won't Break

1. **Only affects PowerShell on Windows** - Other commands unchanged
2. **Simple logic** - No complex type manipulation
3. **Cleanup in finally** - Temp files always deleted
4. **Fallback** - If -Command pattern not matched, executes as-is
5. **Incremental** - Small change, easy to debug
