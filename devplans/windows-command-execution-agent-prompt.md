# Windows Command Execution Fix - Agent Prompt

## Task
Fix Windows PowerShell command execution issues in bash.ts.

## Problem
PowerShell `-Command "..."` echoes quoted strings instead of executing because commands get wrapped in extra quotes.

## Solution
Route PowerShell `-Command` through temp files using `-File`.

## Steps

### 1. Create temp-file.ts
Create a new file with two functions:
```typescript
export function createTempPs1(content: string): string {
  const id = Date.now();
  const path = `${Deno.env('TEMP')}/opencode-${id}.ps1`;
  Deno.writeTextFileSync(path, content);
  return path;
}

export function deleteTempPs1(path: string): void {
  try { Deno.removeSync(path); } catch { /* ignore */ }
}
```

### 2. Modify bash.ts
Add PowerShell routing in the executeCommand function:

```typescript
import { createTempPs1, deleteTempPs1 } from './temp-file.ts';

async function executePowerShell(cmd: string, options: any): Promise<any> {
  const match = cmd.match(/-Command\s+["'](.+?)["']/s);
  if (match) {
    const tempFile = createTempPs1(match[1]);
    const newCmd = cmd.replace(/-Command\s+["'].+?["']/s, `-File "${tempFile}"`);
    try {
      return await executeDirect(newCmd, options);
    } finally {
      deleteTempPs1(tempFile);
    }
  }
  return executeDirect(cmd, options);
}
```

In executeCommand(), add before the normal execution:
```typescript
if (command.match(/^powershell/i) || command.match(/^pwsh/i)) {
  return executePowerShell(cmd, options);
}
```

### 3. Test
Run the test commands from `devplans/windows-command-execution-test-prompt.md` to verify:
- PowerShell inline commands work: `powershell -Command "Write-Host 'Test'"`
- Script blocks work: `powershell -Command "& { Write-Host 'Block' }"`
- CMD still works: `cmd /c echo Hello`

## Requirements
- Only change PowerShell execution path
- Don't modify CMD execution
- Don't change parseCommand() or stream handling
- Temp files must be cleaned up (use finally block)
- Rollback if anything breaks

## Expected Result
Pass rate improves from 41% to ~95% for PowerShell issues.
