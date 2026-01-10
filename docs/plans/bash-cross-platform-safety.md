# Cross-Platform Safety Improvements for bash.ts

## Current State

- **Phases 1-4**: In Progress 🔄
- **Phase 5**: Pending (path resolution)
- **Status**: All typecheck errors fixed (0 errors)
- **Cross-platform compatibility**: 100% complete for runtime detection patterns

---

## Potential Edge Cases & Improvements

### 1. **Path Resolution Fallback**

**Issue**: `realpath` command might not exist on all systems (especially Windows without Git Bash)

**Current approach**:

```typescript
// Bun path: $`realpath ${arg}`
// Node.js path: execSync("realpath", {...})
```

**Safer approach**:

```typescript
async function resolvePath(arg: string, cwd: string): Promise<string | undefined> {
  // Try realpath first
  try {
    if (isBunRuntime) {
      return await $`realpath ${arg}`
        .cwd(cwd)
        .quiet()
        .nothrow()
        .text()
        .then((x) => x.trim())
    } else {
      const { execSync } = require("child_process")
      return execSync(`realpath ${arg}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
    }
  } catch {
    // Fallback to path.resolve for simple cases (doesn't resolve symlinks but works)
    const { join } = require("path")
    return join(cwd, arg)
  }
}
```

---

### 2. **Shell Detection Safety**

**Issue**: What if shell detection fails or returns unexpected values?

**Current**: Uses `process.platform` checks

**Safer approach**: Add validation and fallbacks

```typescript
function detectCommandShell(command: string): "powershell" | "pwsh" | "cmd" | "bash" | "other" {
  const trimmed = (command || "").trim().toLowerCase()
  if (!trimmed) return "other"
  // ... existing detection logic
}
```

---

### 3. **Spawn Options Consistency**

**Issue**: Windows requires different spawn options than Unix

**Current**:

```typescript
detached: process.platform !== "win32"
```

**Check**: Verify this is consistent with `shell.ts` behavior

---

### 4. **Process Kill Safety**

**Issue**: `Shell.killTree` might not work on all platforms

**Current**: Uses `Shell.killTree(proc as any, ...)`

**Consideration**: Add try/catch around kill operations to prevent crashes

---

### 5. **Stream Reading Safety**

**Issue**: Stream readers might not be available on all process objects

**Current**: `proc.stdout?.getReader()` - uses optional chaining ✅

**Consideration**: Already safe with `?.`

---

## Recommended Improvements

### A. **Add Safe Path Resolution Helper**

```typescript
/**
 * Cross-platform path resolution with graceful fallback
 */
async function resolvePath(arg: string, cwd: string): Promise<string | undefined> {
  if (!arg) return undefined

  // Try realpath first (works for symlinks and absolute paths)
  try {
    if (isBunRuntime) {
      const result = await $`realpath ${arg}`.cwd(cwd).quiet().nothrow().text()
      return result.trim() || undefined
    } else {
      const { execSync } = require("child_process")
      const result = execSync(`realpath ${arg}`, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      return result.trim() || undefined
    }
  } catch {
    // Fallback: use path.resolve (doesn't resolve symlinks but works)
    try {
      const { resolve } = require("path")
      return resolve(cwd, arg)
    } catch {
      return undefined
    }
  }
}
```

### B. **Add Platform Constants**

```typescript
const isWindows = process.platform === "win32"
const isMac = process.platform === "darwin"
const isLinux = process.platform === "linux"
```

### C. **Validate Command Before Execution**

```typescript
function validateCommand(cmd: string[]): boolean {
  if (!cmd || cmd.length === 0) return false
  if (!cmd[0]) return false
  return true
}
```

---

## Testing Matrix

| Platform | Runtime | Test Case           | Expected                   |
| -------- | ------- | ------------------- | -------------------------- |
| Windows  | Bun     | `ls -la`            | Works                      |
| Windows  | Bun     | `realpath file.txt` | Works                      |
| Windows  | Node.js | `ls -la`            | Works                      |
| Windows  | Node.js | `realpath file.txt` | Falls back to path.resolve |
| macOS    | Bun     | `ls -la`            | Works                      |
| macOS    | Node.js | `ls -la`            | Works                      |
| Linux    | Bun     | `ls -la`            | Works                      |
| Linux    | Node.js | `ls -la`            | Works                      |

---

## Summary of Changes Needed

1. **Phase 5**: Add `resolvePath` helper function with fallback
2. **Safety**: Add try/catch around all platform-specific operations
3. **Testing**: Verify on all target platforms
4. **Documentation**: Update `bash.txt` to reflect cross-platform support
