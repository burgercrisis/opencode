# Windows Command Execution Fix - Implementation Plan

## Root Cause (REVISED)
The issue is NOT PowerShell's `-Command` parameter - it's **HOW bash.ts passes the command**.

When bash.ts passes the entire command as a single string to `Bun.spawn`, the shell layer wraps it in additional quotes:
```
powershell -Command ""Write-Host 'Test'""
```

PowerShell receives: `-Command` value = `"Write-Host 'Test'"` (a string literal)
Result: Echoes the string instead of executing

## Solution: Pass Command and Arguments Separately

**Don't do this** (single string - gets quote-wrapped):
```typescript
Bun.spawn("powershell -Command \"Write-Host 'Test'\"", { shell: true })
```

**Do this** (array - no quote wrapping):
```typescript
Bun.spawn(["powershell", "-Command", "Write-Host 'Test'"], { shell: true })
```

---

## Implementation Plan

### Step 1: Fix Command Parsing in bash.ts

**Current problematic code** (around line 139):
```typescript
const result = parseCommand(cmd);
const command = result.command;
const args = result.args;
```

**Fix**: Ensure `-Command` argument is NOT quote-wrapped.

```typescript
// Line 280-310: PowerShell execution
async function executeCommand(
  cmd: string,
  options: ExecutionOptions
): Promise<CommandResult> {
  const result = parseCommand(cmd);
  const { command, args, shouldBypassShell } = result;

  // For PowerShell on Windows, pass args as separate elements
  if (command.match(/^powershell/i) && options.platform === 'win32') {
    // Pass command and args as array - NO quote wrapping
    const proc = Bun.spawn(
      [command, ...args],  // Array - each arg is separate
      {
        shell: false,  // No shell wrapper needed
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: options.cwd,
        env: options.env,
      }
    );

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = proc.exitCode;

    return { stdout, stderr, exitCode };
  }

  // ... existing code for other shells
}
```

### Step 2: Fix parseCommand() to Not Quote -Command Values

The `parseCommand()` function (line 139) must NOT wrap `-Command` arguments in quotes:

```typescript
function parseCommand(cmd: string): ParsedCommand {
  const tokens = tokenizeCommand(cmd);
  const command = tokens[0];
  const args = tokens.slice(1);

  // Build args array without adding extra quotes to -Command
  const shellArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Don't quote -Command values
    if (arg === '-Command' || arg === '-c') {
      shellArgs.push(arg);
      // Next arg is the command - don't quote it
      if (i + 1 < args.length) {
        shellArgs.push(args[i + 1]);
        i++;  // Skip next arg
      }
      continue;
    }

    // Quote other args that need it
    if (arg.includes(' ') && !arg.startsWith('"')) {
      shellArgs.push(`"${arg}"`);
    } else {
      shellArgs.push(arg);
    }
  }

  return {
    command,
    args: shellArgs,
    shouldBypassShell: /* ... */
  };
}
```

### Step 3: Verify Shell Bypass Logic

Ensure `shouldBypassShell` correctly identifies when to skip shell wrapper:

```typescript
// Around line 150
shouldBypassShell:
  process.platform === 'win32' &&
  (command.match(/^powershell/i) || command.match(/^cmd\.exe$/i))
```

This ensures:
- PowerShell: Skip shell wrapper, pass args as array
- CMD: Skip shell wrapper, pass args as array
- Other shells: Use shell wrapper

---

## Expected Results

| Issue | Before | After |
|-------|--------|-------|
| #10 PowerShell inline | 25% | ~95% |
| #14 Script blocks | 0% | ~95% |
| #1 Double-wrapping | 38% | ~95% |
| #13 Shell bypass | 50% | ~95% |

---

## Test Commands

After fix, these should all work:

```powershell
powershell -Command "Write-Host 'Test'"          # → Test
powershell -Command "Get-Date | Out-String"      # → Current date
powershell -Command "& { Write-Host 'Block' }"   # → Block
powershell -Command "exit 42"; echo $LASTEXITCODE  # → 42
```

---

## Key Files to Modify

| File | Change |
|------|--------|
| `packages/opencode/src/tool/bash.ts` | Fix `executeCommand()` to pass PowerShell args as array |
| `packages/opencode/src/tool/bash.ts` | Fix `parseCommand()` to not quote -Command values |

---

## Why This Works

1. **No quote wrapping**: Array args bypass shell quote processing
2. **Direct to PowerShell**: Each argument passed exactly as specified
3. **PowerShell parses correctly**: `-Command "Write-Host 'Test'"` works as expected
4. **Script blocks work**: `& { ... }` passed correctly without nesting
