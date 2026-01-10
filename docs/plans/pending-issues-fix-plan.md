# Plan: Fix Pending Issues in bash.ts

## Status: ✅ COMPLETED

Both pending issues have been fixed and all tests pass (66/66).

**File**: `packages/opencode/src/tool/powershell-executor.ts`
**Line**: 11
**Severity**: CRITICAL

### Problem

```typescript
import { spawn } from "bun"
```

This import will fail immediately on Node.js because 'bun' is not a valid module.

### Solution

Use conditional imports pattern similar to `bash.ts`:

```typescript
// Replace static import with conditional import
let spawn: typeof import("bun").spawn

// Runtime detection
const isBunRuntime = typeof Bun !== "undefined" && Bun.spawn !== undefined

// Lazy initialization
async function getSpawn(): Promise<typeof spawn> {
  if (isBunRuntime) {
    const bun = await import("bun")
    return bun.spawn
  } else {
    const node = await import("child_process")
    return node.spawn
  }
}
```

### Implementation Steps

1. **Remove static import** (line 11)
2. **Add runtime detection** at module level:
   ```typescript
   const isBunRuntime = typeof Bun !== "undefined" && Bun.spawn !== undefined
   ```
3. **Add lazy spawn function**:
   ```typescript
   async function getSpawn() {
     if (isBunRuntime) {
       const { spawn } = await import("bun")
       return spawn
     } else {
       const { spawn } = await import("child_process")
       return spawn
     }
   }
   ```
4. **Update `executeFile()` method** to use `getSpawn()`:
   ```typescript
   const spawn = await getSpawn()
   const proc = spawn({
     cmd: [this.executable, ...args],
     stdout: options?.captureOutput !== false ? "pipe" : "ignore",
     stderr: options?.captureOutput !== false ? "pipe" : "ignore",
   })
   ```

### Testing

- Test on Bun runtime (current behavior should work)
- Test on Node.js runtime (should work after fix)
- Verify Windows PowerShell execution still works

---

## Issue 7: TempFileManager Cleanup Timer Property

**File**: `packages/opencode/src/tool/temp-file-manager.ts`
**Line**: 85

### Problem

```typescript
private cleanupTimer?: ReturnType<typeof setInterval>
```

The property exists but:

- Timer is never started in constructor (per line 98-99 comment)
- Property is only used in `dispose()` which clears it
- Documentation is misleading - says "removed" but property still exists

### Solution

Two options:

**Option A: Keep property for safety (minimal change)**

- Update comment to clarify property exists for backward compatibility
- Document that timer is never started automatically

**Option B: Remove property entirely (cleaner)**

- Remove line 85 (`private cleanupTimer?: ...`)
- Remove lines 218-221 in `dispose()` that clear the timer
- This is cleaner since timer is never started

### Recommendation

**Option B** - Remove the unused property since:

1. Timer is explicitly not started (per comment line 98-99)
2. No code ever calls `startCleanupTimer()`
3. Keeping unused code is technical debt

### Implementation Steps (Option B)

1. **Remove property declaration** (line 85):

   ```typescript
   // REMOVE THIS LINE:
   private cleanupTimer?: ReturnType<typeof setInterval>
   ```

2. **Update `dispose()` method** (lines 217-223):

   ```typescript
   // BEFORE:
   async dispose(): Promise<void> {
     if (this.cleanupTimer) {
       clearInterval(this.cleanupTimer)
       this.cleanupTimer = undefined
     }
     await this.cleanupAll()
   }

   // AFTER:
   async dispose(): Promise<void> {
     await this.cleanupAll()
   }
   ```

3. **Update comments** to clarify timer was removed entirely

---

## Files to Modify

| File                     | Changes                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `powershell-executor.ts` | Lines 11, add runtime detection + getSpawn function, update executeFile() |
| `temp-file-manager.ts`   | Lines 85, 217-223                                                         |

---

## Timeline

| Task                     | Estimate   |
| ------------------------ | ---------- |
| Fix Issue 6 (Bun import) | 30 minutes |

| Fix Issue 7 (Timer cleanup
