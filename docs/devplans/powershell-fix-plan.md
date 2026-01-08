# Windows PowerShell Command Execution Fix - Implementation Plan

## Overview
Fix Windows PowerShell command execution issues by routing `-Command` through temporary `.ps1` files using `-File` parameter.

## Root Cause
When PowerShell receives `-Command "..."`, the quotes protecting the command from cmd.exe wrapping become part of PowerShell's input, causing it to treat the command as a literal string to output instead of executing.

## Solution Architecture

```mermaid
flowchart TD
    A[User Command: powershell -Command "Write-Host 'Test'"] --> B{Is PowerShell?}
    B -->|Yes| C[Extract command from -Command "..."]
    B -->|No| M[Normal execution path]
    C --> D[Create temp .ps1 file]
    D --> E[Rewrite: powershell -File "temp.ps1"]
    E --> F[Execute with Bun.spawn]
    F --> G[Cleanup temp file]
    G --> H[Return result]
    M --> I[Standard execution]
```

## Implementation Steps

### Step 1: Create temp-file.ts
**File**: `packages/opencode/src/tool/temp-file.ts`

```typescript
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Creates a temporary PowerShell script file with the given content.
 * @param content - The PowerShell script content to write
 * @returns The path to the created temporary file
 */
export function createTempPs1(content: string): string {
  const id = Date.now();
  const path = join(tmpdir(), `opencode-${id}.ps1`);
  writeFileSync(path, content, { encoding: 'utf8' });
  return path;
}

/**
 * Deletes a temporary PowerShell script file.
 * @param path - Path to the temporary file to delete
 */
export function deleteTempPs1(path: string): void {
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    // Ignore cleanup errors - file may not exist
  }
}
```

### Step 2: Modify bash.ts
**File**: `packages/opencode/src/tool/bash.ts`

#### 2.1 Add imports
Add at the top of the file (around line 16):
```typescript
import { createTempPs1, deleteTempPs1 } from './temp-file.ts';
```

#### 2.2 Add executePowerShell function
Add before the `BashTool` definition (around line 174):
```typescript
/**
 * Executes PowerShell commands by routing -Command through temp files.
 * This avoids the issue where cmd.exe wrapping causes PowerShell to echo 
 * quoted strings instead of executing them.
 */
async function executePowerShell(cmd: string, options: any): Promise<any> {
  // Extract the command content from -Command "..."
  const match = cmd.match(/-Command\s+["'](.+?)["']/s);
  if (match) {
    const commandContent = match[1];
    const tempFile = createTempPs1(commandContent);
    
    // Replace -Command "..." with -File "path"
    const newCmd = cmd.replace(/-Command\s+["'].+?["']/s, `-File "${tempFile}"`);
    
    log.debug("PowerShell routing through temp file", {
      original: cmd,
      tempFile,
      routed: newCmd
    });
    
    try {
      return await executeDirect(newCmd, options);
    } finally {
      deleteTempPs1(tempFile);
    }
  }
  
  // No -Command found, execute directly
  return executeDirect(cmd, options);
}
```

#### 2.3 Add PowerShell detection in execute flow
In the execute function (around line 276), before the command resolution, add:
```typescript
// PowerShell routing: use temp files for -Command to avoid quote issues
if (process.platform === "win32" && shellType === 'powershell') {
  return await executePowerShell(params.command, ctx);
}
```

## Requirements & Constraints
- ✅ Only change PowerShell execution path
- ✅ Don't modify CMD execution
- ✅ Don't change parseCommand() or stream handling
- ✅ Temp files must be cleaned up (finally block)
- ✅ Rollback plan documented

## Testing Plan

### Test Commands (from windows-command-execution-test-prompt.md)
1. `powershell -NoProfile -Command "Write-Host 'Test123'"`
2. `powershell -Command "Get-Date | Out-String"`
3. `powershell -Command "1 + 1"`
4. `powershell -Command "& { Write-Host 'Inside block' }"`
5. `powershell -Command "if (1 -eq 1) { Write-Host 'True' }"`
6. `cmd /c echo HelloWorld` (verify CMD still works)

### Expected Results
- **PowerShell**: Pass rate improves from 41% to ~95%
- **CMD**: Maintains 100% pass rate (unchanged)

## Rollback Plan
1. Delete `packages/opencode/src/tool/temp-file.ts`
2. Remove import and executePowerShell function from bash.ts
3. Remove PowerShell detection/routing logic from execute function
4. Revert to original execution path

## Files Changed
- `packages/opencode/src/tool/temp-file.ts` - NEW (~15 lines)
- `packages/opencode/src/tool/bash.ts` - MODIFIED (~25 lines)

## Timeline
- Implementation: ~30 minutes
- Testing: ~15 minutes
- Total: ~45 minutes
