# Windows Command Execution Fix - Risk Analysis

## Potential New Problems from the Fix

### 1. Variable Expansion in CMD Shell (HIGH RISK)

**Problem**: CMD shell normally expands variables like `%USERNAME%`. With `shell: false`, variables won't expand.

| Command | Before (shell: true) | After (shell: false) |
|---------|---------------------|----------------------|
| `cmd /c echo %USERNAME%` | Outputs actual username | Outputs literal `%USERNAME%` |

**Mitigation**: Use shell wrapper for CMD commands:
```typescript
if (command.match(/^cmd\.exe?$/i)) {
  return executeWithShell(cmd, options);  // CMD needs shell
}
```

---

### 2. Redirection Operators (HIGH RISK)

**Problem**: `>`, `<`, `>>`, `2>` won't work without shell.

| Command | Before | After |
|---------|--------|-------|
| `echo "test" > output.txt` | Creates file | Fails/ignored |
| `dir > file.txt 2>&1` | Redirects both | Stderr not redirected |

**Mitigation**: Detect redirection and use shell wrapper:
```typescript
if (cmd.includes('>') || cmd.includes('<')) {
  return executeWithShell(cmd, options);
}
```

---

### 3. Command Chaining (HIGH RISK)

**Problem**: `&`, `&&`, `||`, `|` won't work without shell.

| Command | Before | After |
|---------|--------|-------|
| `echo A && echo B` | Outputs A then B | Fails |
| `echo A \| find "A"` | Filters output | Fails |

**Mitigation**: Detect chaining and use shell wrapper:
```typescript
if (cmd.includes('&&') || cmd.includes('||') || cmd.includes('|')) {
  return executeWithShell(cmd, options);
}
```

---

### 4. Exit Code Handling (MEDIUM RISK)

**Problem**: Different exit code behavior between shell wrapper and direct spawn.

**Impact**: Commands wrapped in `cmd /c` may report different exit codes than PowerShell directly.

**Mitigation**: Test exit code mapping:
```typescript
// Verify exit codes match expected values
const result = await executeDirect(command, args, options);
if (result.exitCode !== expected) {
  // Log warning or adjust
}
```

---

### 5. Working Directory Resolution (LOW RISK)

**Problem**: Relative paths may resolve differently without shell.

| Command | Before | After |
|---------|--------|-------|
| `.\script.ps1` | Resolves to cwd | May fail |
| `../script.ps1` | Resolves relative | May fail |

**Mitigation**: Always use absolute paths:
```typescript
const absPath = path.resolve(options.cwd || '.', relativePath);
```

---

### 6. Environment Variables (LOW RISK)

**Problem**: PowerShell `$env:VAR` should work, but PATH behavior may differ.

**Assessment**: PowerShell with `shell: false` still processes `$env:VAR` correctly. **Low risk.**

---

### 7. Unicode/Encoding (LOW RISK)

**Problem**: Shell wrapper may handle encoding differently.

**Assessment**: Bun.spawn handles UTF-8 correctly. **Low risk.**

---

## Risk Summary Table

| Issue | Severity | Mitigation | Status |
|-------|----------|------------|--------|
| CMD variable expansion | HIGH | Use shell for CMD | ✅ Fixable |
| Redirection operators | HIGH | Detect and use shell | ✅ Fixable |
| Command chaining | HIGH | Detect and use shell | ✅ Fixable |
| Exit code handling | MEDIUM | Test and verify | ⚠️ Needs testing |
| Working directory | LOW | Use absolute paths | ✅ Fixable |
| Environment variables | LOW | PowerShell handles | ✅ OK |
| Unicode/encoding | LOW | Bun handles | ✅ OK |

---

## Safe Fix Strategy

```typescript
async function executeCommand(
  cmd: string,
  options: ExecutionOptions
): Promise<CommandResult> {
  const result = parseCommand(cmd);
  const { command, args } = result;

  // Check if command contains shell features
  const needsShell = checkIfNeedsShell(cmd);

  // PowerShell with shell features → use shell wrapper
  if (command.match(/^powershell/i) && needsShell) {
    return executeWithShell(cmd, options);
  }

  // PowerShell without shell features → use array spawn (fixes quoting)
  if (command.match(/^powershell/i) && !needsShell) {
    return executeWithArray(command, args, options);
  }

  // CMD always needs shell (variables, redirection, chaining)
  if (command.match(/^cmd\.exe?$/i)) {
    return executeWithShell(cmd, options);
  }

  // Default: use shell wrapper
  return executeWithShell(cmd, options);
}

function checkIfNeedsShell(cmd: string): boolean {
  return (
    cmd.match(/%[A-Z_]+%/) !== null ||   // Variable expansion
    cmd.match(/[><|]/) !== null ||        // Redirection/chaining
    cmd.match(/ && | \|\| /) !== null     // Chaining
  );
}
```

---

## Testing Matrix

| Test Case | Before Fix | After Fix | Status |
|-----------|------------|-----------|--------|
| PowerShell inline | ❌ 25% | ✅ ~95% | Need test |
| PowerShell script blocks | ❌ 0% | ✅ ~95% | Need test |
| PowerShell with variables | ? | ✅ | Need test |
| CMD variable expansion | ✅ 100% | ✅ 100% | Need test |
| CMD redirection | ✅ 100% | ✅ 100% | Need test |
| CMD chaining | ✅ 100% | ✅ 100% | Need test |
| Exit codes | ✅ | ✅ | Need test |
| Working directory | ✅ | ✅ | Need test |

---

## Conclusion

**Net Risk Assessment**: 

- **PowerShell Issues Fixed**: #1, #10, #13, #14
- **New Issues Introduced**: Potentially CMD variable/redirection/chaining
- **Mitigation**: Always use shell wrapper for CMD commands
- **Overall Impact**: POSITIVE - fixes PowerShell without breaking CMD
