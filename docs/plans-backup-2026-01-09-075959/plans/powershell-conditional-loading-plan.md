# PowerShell Executor Conditional Loading - Implementation Plan

## Objective

Replace static imports of PowerShell modules with dynamic imports to ensure Windows-specific code is only loaded on Windows platforms.

## Current Problems

1. **Static imports** in [`bash.ts:17-18`](packages/opencode/src/tool/bash.ts:17) load PowerShell code on all platforms
2. **~500+ lines** of Windows-specific code unnecessarily loaded on Linux/macOS
3. **Singleton never disposed** - potential memory leak
4. **Silent cleanup failures** in error handling

## Implementation Steps

### Step 1: Remove Static Imports

**File**: [`bash.ts:17-18`](packages/opencode/src/tool/bash.ts:17)

**Before**:

```typescript
import { PowerShellExecutor } from "./powershell-executor"
import { TempFileManager } from "./temp-file-manager"
```

**After**:

```typescript
// PowerShell modules loaded dynamically - see getPowerShellExecutor()
```

### Step 2: Update getPowerShellExecutor() Function

**File**: [`bash.ts:327-335`](packages/opencode/src/tool/bash.ts:327)

**Before**:

```typescript
let psExecutor: PowerShellExecutor | undefined

function getPowerShellExecutor(): PowerShellExecutor {
  if (!psExecutor) {
    const tempFileManager = new TempFileManager()
    psExecutor = new PowerShellExecutor({ tempFileManager })
  }
  return psExecutor
}
```

**After**:

```typescript
let psExecutor: PowerShellExecutor | undefined
let psExecutorCleanup: (() => void) | undefined

async function getPowerShellExecutor(): Promise<PowerShellExecutor | null> {
  // Platform check - return null on non-Windows
  if (process.platform !== "win32") {
    return null
  }

  // Return cached instance if available
  if (psExecutor) {
    return psExecutor
  }

  // Dynamic import - only loads on Windows
  const { PowerShellExecutor: PSExec } = await import("./powershell-executor")
  const { TempFileManager } = await import("./temp-file-manager")

  const tempFileManager = new TempFileManager()
  psExecutor = new PSExec({ tempFileManager })

  // Register cleanup on process exit
  psExecutorCleanup = () => {
    try {
      if (tempFileManager && typeof tempFileManager.dispose === "function") {
        tempFileManager.dispose()
      }
    } catch (error) {
      log.warn("Error disposing PowerShell temp file manager", { error })
    }
  }

  if (typeof process !== "undefined") {
    process.once("beforeExit", psExecutorCleanup)
    process.once("exit", psExecutorCleanup)
  }

  return psExecutor
}

export function disposePowerShellExecutor(): void {
  if (psExecutorCleanup) {
    psExecutorCleanup()
    psExecutorCleanup = undefined
    psExecutor = undefined
  }
}
```

### Step 3: Update Usage in execute() Method

**File**: [`bash.ts:504-523`](packages/opencode/src/tool/bash.ts:504)

**Before**:

```typescript
if (routing.useExecutor) {
  const executor = getPowerShellExecutor()
  const result = await executor.execute(routing.tempCommand!)
  return {
    title: params.description,
    metadata: {
      output: result.stdout,
      exit: result.exitCode,
      description: params.description,
    },
    output: result.stdout,
  }
}
```

**After**:

```typescript
if (routing.useExecutor) {
  const executor = await getPowerShellExecutor()

  if (!executor) {
    throw new Error("PowerShell executor not available on this platform")
  }

  const result = await executor.execute(routing.tempCommand!)
  return {
    title: params.description,
    metadata: {
      output: result.stdout,
      exit: result.exitCode,
      description: params.description,
    },
    output: result.stdout,
  }
}
```

### Step 4: Improve Error Handling in Temp File Cleanup

**File**: [`powershell-executor.ts`](packages/opencode/src/tool/powershell-executor.ts)

**Before**:

```typescript
finally {
  if (tempPath) {
    await this.tempFileManager.cleanup(tempPath).catch((e) => {
      // Silent failure
    })
  }
}
```

**After**:

```typescript
finally {
  if (tempPath) {
    this.tempFileManager.cleanup(tempPath)
      .then(() => {
        log.debug(`Cleaned up temp file: ${tempPath}`)
      })
      .catch((error) => {
        // Only log unexpected errors (not ENOENT which means file already gone)
        if (!error.message?.includes('ENOENT')) {
          log.warn(`Failed to cleanup temp file: ${tempPath}`, { error })
        }
      })
  }
}
```

### Step 5: Update Barrel Exports with Platform Comments

**File**: [`index.ts:24`](packages/opencode/src/tool/index.ts:24)

**Before**:

```typescript
export { PowerShellExecutor, PowerShellExecutionError } from "./powershell-executor"
```

**After**:

```typescript
/**
 * PowerShell execution (Windows command execution)
 * @platform Windows - These exports are only functional on Windows platforms
 */
export { PowerShellExecutor, PowerShellExecutionError } from "./powershell-executor"
```

---

## Files to Modify

| File                                                                                                     | Changes                                                                          |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`packages/opencode/src/tool/bash.ts`](packages/opencode/src/tool/bash.ts)                               | Remove static imports, update getPowerShellExecutor(), update usage in execute() |
| [`packages/opencode/src/tool/powershell-executor.ts`](packages/opencode/src/tool/powershell-executor.ts) | Improve error handling in cleanup                                                |
| [`packages/opencode/src/tool/index.ts`](packages/opencode/src/tool/index.ts)                             | Add platform comments                                                            |

---

## Testing Strategy

### Unit Tests

1. **Conditional Loading Test**:
   - Mock `process.platform` to 'linux'
   - Call `getPowerShellExecutor()`
   - Verify it returns `null`

2. **Singleton Behavior Test**:
   - Call `getPowerShellExecutor()` twice
   - Verify same instance is returned

3. **Cleanup Test**:
   - Verify cleanup function is registered
   - Verify cleanup is called on process exit

### Integration Tests

1. **Windows**: Verify PowerShell commands execute correctly
2. **Linux/macOS**: Verify no errors when PowerShell executor returns null
3. **Bundle Size**: Verify reduction in non-Windows builds

---

## Risk Assessment

| Risk                           | Impact | Mitigation                       |
| ------------------------------ | ------ | -------------------------------- |
| Breaking Windows functionality | High   | Extensive testing on Windows     |
| Bundle size not reducing       | Medium | Verify with bundle analysis      |
| Memory leaks from cleanup      | Medium | Proper disposal in cleanup       |
| Regression in bash tool        | High   | Comprehensive regression testing |

---

## Timeline Estimate

- **Step 1-2** (Import changes): 30 minutes
- **Step 3** (Usage update): 15 minutes
- **Step 4** (Error handling): 30 minutes
- **Step 5** (Documentation): 15 minutes
- **Testing**: 1-2 hours

**Total**: 2.5-3.5 hours
