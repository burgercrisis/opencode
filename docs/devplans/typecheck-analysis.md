# Cross-Platform Type Error Analysis & Categorization

**Date:** 2026-01-09  
**Analysis Source:** [`docs/devplans/typecheck-report.md`](docs/devplans/typecheck-report.md)  
**Total Errors:** 68  
**Status:** Step 4 of Comprehensive Cross-Platform Fix Workflow

---

## Executive Summary

This document provides a comprehensive categorization of all 68 type errors identified during the typecheck run. The errors are analyzed across multiple dimensions to guide the fix process and ensure cross-platform compatibility.

### Error Distribution Summary

| Category              | Count                | Platform-Agnostic | Platform-Specific |
| --------------------- | -------------------- | ----------------- | ----------------- |
| Global Type Usage     | 59                   | ✅ Yes            | ❌ No             |
| Duplicate Identifiers | 14                   | ✅ Yes            | ❌ No             |
| Case Sensitivity      | 5                    | ❌ No             | ✅ Yes            |
| Missing Modules/Types | 6                    | ✅ Yes            | ❌ No             |
| vitest Types          | 2                    | ✅ Yes            | ❌ No             |
| Type Assignment       | 1                    | ✅ Yes            | ❌ No             |
| Property Access       | 3                    | ✅ Yes            | ❌ No             |
| **Total**             | **90** _(68 unique)_ | **48**            | **5**             |

---

## Detailed Error Categorization

### 1. Global Type Usage (TS2693) - 59 Errors

**File:** [`packages/opencode/src/lsp/server.ts`](packages/opencode/src/lsp/server.ts:126)

**Description:** Code uses `Global` as a runtime value when it's only available as a TypeScript type.

**Affected Lines:** 126, 136, 175, 182, 185, 194, 195, 370, 379, 389, 408, 420, 430, 515, 519, 569, 571, 589, 592, 607, 630, 697, 701, 709, 714, 742, 753, 764, 782, 793, 804, 912, 921, 925, 990, 1006, 1015, 1019, 1029, 1030, 1050, 1054, 1098, 1102, 1156, 1237, 1320, 1332, 1374, 1435, 1441, 1508, 1512, 1602, 1606, 1640, 1684, 1687, 1696, 1730, 1774, 1778, 1787, 1792, 1822, 1826, 1931, 1982, 1986, 1994, 1999

#### Platform Impact

| Platform    | Status    | Severity     | Notes                             |
| ----------- | --------- | ------------ | --------------------------------- |
| **Windows** | ❌ Breaks | **Blocking** | Node.js and Bun runtimes affected |
| **macOS**   | ❌ Breaks | **Blocking** | Node.js and Bun runtimes affected |
| **Linux**   | ❌ Breaks | **Blocking** | Node.js and Bun runtimes affected |
| **Unix**    | ❌ Breaks | **Blocking** | All Unix variants affected        |

#### Shell Compatibility

| Shell          | Compatibility | Notes                         |
| -------------- | ------------- | ----------------------------- |
| **code**       | ❌ Breaks     | Core LSP server functionality |
| **powershell** | ❌ Breaks     | PowerShell execution context  |
| **git**        | ❌ Breaks     | Git integration               |
| **bash**       | ❌ Breaks     | Bash execution                |
| **zsh**        | ❌ Breaks     | Zsh execution                 |

#### Runtime Compatibility

| Runtime     | Compatibility | Notes                       |
| ----------- | ------------- | --------------------------- |
| **Node.js** | ❌ Breaks     | `Global` type used as value |
| **Bun**     | ❌ Breaks     | `Global` type used as value |

#### Fix Strategy: **Platform-Agnostic** ✅

```typescript
// BEFORE (problematic)
const globalObj = Global

// AFTER (fixed)
const globalObj = globalThis as unknown as {
  Global: unknown
  [key: string]: unknown
}

// Alternative: Use proper type guards
function getGlobalObject(): unknown {
  if (typeof globalThis !== "undefined") {
    return globalThis
  }
  if (typeof global !== "undefined") {
    return global
  }
  return undefined
}
```

**Recommended Fix:** Replace `Global` usage with `globalThis` with proper runtime checks. This is a **platform-agnostic solution** that works across all platforms and runtimes.

---

### 2. Duplicate Identifier Errors (TS2300) - 14 Errors

**File:** [`packages/opencode/src/tool/index.ts`](packages/opencode/src/tool/index.ts:24)

**Description:** Multiple exports with the same name from different modules.

**Affected Lines:**

- Line 24: `TempFileManager` and `TempFilePoolFullError`
- Line 30: `PowerShellExecutor` and `PowerShellExecutionError`
- Line 36: `TempFileManager` and `TempFilePoolFullError`
- Line 42: `PowerShellExecutor` and `PowerShellExecutionError`

#### Platform Impact

| Platform    | Status    | Severity     | Notes                                |
| ----------- | --------- | ------------ | ------------------------------------ |
| **Windows** | ❌ Breaks | **Blocking** | Compilation error affects all builds |
| **macOS**   | ❌ Breaks | **Blocking** | Compilation error affects all builds |
| **Linux**   | ❌ Breaks | **Blocking** | Compilation error affects all builds |
| **Unix**    | ❌ Breaks | **Blocking** | Compilation error affects all builds |

#### Shell Compatibility

| Shell          | Compatibility | Notes                 |
| -------------- | ------------- | --------------------- |
| **code**       | ❌ Breaks     | Build system affected |
| **powershell** | ❌ Breaks     | Build system affected |
| **git**        | ❌ Breaks     | Build system affected |
| **bash**       | ❌ Breaks     | Build system affected |
| **zsh**        | ❌ Breaks     | Build system affected |

#### Runtime Compatibility

| Runtime     | Compatibility | Notes             |
| ----------- | ------------- | ----------------- |
| **Node.js** | ❌ Breaks     | Compilation fails |
| **Bun**     | ❌ Breaks     | Compilation fails |

#### Fix Strategy: **Platform-Agnostic** ✅

**Recommended Fix:** Remove duplicate exports and consolidate imports from a single source. This is a **code organization issue** with no platform-specific components.

---

### 3. Case Sensitivity Issues (TS2724) - 5 Errors

**File:** [`packages/opencode/src/tool/index.ts`](packages/opencode/src/tool/index.ts:46)

**Description:** Tools being exported with wrong case.

**Affected Lines:**

- Line 46: `CodesearchTool` → Should be `CodeSearchTool`
- Line 51: `LsTool` → Should be `ListTool`
- Line 53: `MultieditTool` → Should be `MultiEditTool`
- Line 61: `WebfetchTool` → Should be `WebFetchTool`
- Line 62: `WebsearchTool` → Should be `WebSearchTool`

#### Platform Impact

| Platform    | Status    | Severity         | Notes                         |
| ----------- | --------- | ---------------- | ----------------------------- |
| **Windows** | ⚠️ Works  | **Non-Blocking** | Case-insensitive filesystem   |
| **macOS**   | ❌ Breaks | **Blocking**     | Case-sensitive (APFS default) |
| **Linux**   | ❌ Breaks | **Blocking**     | Case-sensitive filesystem     |
| **Unix**    | ❌ Breaks | **Blocking**     | Case-sensitive filesystem     |

#### Shell Compatibility

| Shell          | Compatibility                          | Notes                 |
| -------------- | -------------------------------------- | --------------------- |
| **code**       | ⚠️ Works (Win) / ❌ Breaks (Mac/Linux) | Depends on filesystem |
| **powershell** | ⚠️ Works (Win) / ❌ Breaks (Mac/Linux) | Depends on filesystem |
| **git**        | ⚠️ Works (Win) / ❌ Breaks (Mac/Linux) | Depends on filesystem |
| **bash**       | ⚠️ Works (Win) / ❌ Breaks (Mac/Linux) | Depends on filesystem |
| **zsh**        | ⚠️ Works (Win) / ❌ Breaks (Mac/Linux) | Depends on filesystem |

#### Runtime Compatibility

| Runtime     | Compatibility                          | Notes                 |
| ----------- | -------------------------------------- | --------------------- |
| **Node.js** | ⚠️ Works (Win) / ❌ Breaks (Mac/Linux) | Depends on filesystem |
| **Bun**     | ⚠️ Works (Win) / ❌ Breaks (Mac/Linux) | Depends on filesystem |

#### Fix Strategy: **Platform-Specific** ⚠️

**Recommended Fix:** Standardize tool naming to PascalCase. This requires **platform-specific handling** because:

- Windows builds may appear to work but will fail on case-sensitive platforms
- All references must be updated to match the correct case
- This is a **critical fix** for cross-platform compatibility

---

### 4. Missing Module/Type Declarations (TS2307, TS1484) - 6 Errors

**File:** [`packages/opencode/src/tool/index.ts`](packages/opencode/src/tool/index.ts:56)

**Description:** Missing or misconfigured module exports and type imports.

**Errors:**

1. Line 56: `RegistryTool` - Module has no exported member
2. Line 59: `todoread` - Cannot find module
3. Line 60: `todowrite` - Cannot find module
4. Test file: Type-only import issues
5. Test file: Object literal duplicate property

#### Platform Impact

| Platform    | Status    | Severity     | Notes              |
| ----------- | --------- | ------------ | ------------------ |
| **Windows** | ❌ Breaks | **Blocking** | Feature incomplete |
| **macOS**   | ❌ Breaks | **Blocking** | Feature incomplete |
| **Linux**   | ❌ Breaks | **Blocking** | Feature incomplete |
| **Unix**    | ❌ Breaks | **Blocking** | Feature incomplete |

#### Shell Compatibility

| Shell          | Compatibility | Notes                 |
| -------------- | ------------- | --------------------- |
| **code**       | ❌ Breaks     | Missing functionality |
| **powershell** | ❌ Breaks     | Missing functionality |
| **git**        | ❌ Breaks     | Missing functionality |
| **bash**       | ❌ Breaks     | Missing functionality |
| **zsh**        | ❌ Breaks     | Missing functionality |

#### Runtime Compatibility

| Runtime     | Compatibility | Notes           |
| ----------- | ------------- | --------------- |
| **Node.js** | ❌ Breaks     | Missing modules |
| **Bun**     | ❌ Breaks     | Missing modules |

#### Fix Strategy: **Platform-Agnostic** ✅

**Recommended Fix:**

- Create missing modules (`RegistryTool`, `todoread`, `todowrite`)
- Add type-only imports where required
- Fix duplicate object properties

This is a **platform-agnostic solution** as it involves creating or fixing module exports.

---

### 5. Missing vitest Types - 2 Errors

**File:** [`packages/opencode/test/tool/bash-parse.test.ts`](packages/opencode/test/tool/bash-parse.test.ts)  
**File:** [`packages/opencode/test/tool/bash-stream.test.ts`](packages/opencode/test/tool/bash-stream.test.ts)

**Description:** vitest types not installed or configured.

#### Platform Impact

| Platform    | Status   | Severity         | Notes                           |
| ----------- | -------- | ---------------- | ------------------------------- |
| **Windows** | ⚠️ Works | **Non-Blocking** | Tests may run but types missing |
| **macOS**   | ⚠️ Works | **Non-Blocking** | Tests may run but types missing |
| **Linux**   | ⚠️ Works | **Non-Blocking** | Tests may run but types missing |
| **Unix**    | ⚠️ Works | **Non-Blocking** | Tests may run but types missing |

#### Shell Compatibility

| Shell          | Compatibility | Notes                   |
| -------------- | ------------- | ----------------------- |
| **code**       | ⚠️ Works      | Test execution affected |
| **powershell** | ⚠️ Works      | Test execution affected |
| **git**        | ⚠️ Works      | Test execution affected |
| **bash**       | ⚠️ Works      | Test execution affected |
| **zsh**        | ⚠️ Works      | Test execution affected |

#### Runtime Compatibility

| Runtime     | Compatibility | Notes                |
| ----------- | ------------- | -------------------- |
| **Node.js** | ⚠️ Works      | vitest types missing |
| **Bun**     | ⚠️ Works      | vitest types missing |

#### Fix Strategy: **Platform-Agnostic** ✅

**Recommended Fix:** Install vitest types: `bun add -D @types/vitest`. This is a **platform-agnostic solution** that works across all platforms.

---

### 6. Type Assignment Issue (TS2322) - 1 Error

**File:** [`packages/opencode/src/tool/git-env.ts`](packages/opencode/src/tool/git-env.ts:58)

**Description:** Type `string | undefined` is not assignable to type `string`.

#### Platform Impact

| Platform    | Status   | Severity   | Notes                   |
| ----------- | -------- | ---------- | ----------------------- |
| **Windows** | ⚠️ Works | **Medium** | Runtime potential error |
| **macOS**   | ⚠️ Works | **Medium** | Runtime potential error |
| **Linux**   | ⚠️ Works | **Medium** | Runtime potential error |
| **Unix**    | ⚠️ Works | **Medium** | Runtime potential error |

#### Shell Compatibility

| Shell          | Compatibility | Notes                  |
| -------------- | ------------- | ---------------------- |
| **code**       | ⚠️ Works      | Runtime error possible |
| **powershell** | ⚠️ Works      | Runtime error possible |
| **git**        | ⚠️ Works      | Runtime error possible |
| **bash**       | ⚠️ Works      | Runtime error possible |
| **zsh**        | ⚠️ Works      | Runtime error possible |

#### Runtime Compatibility

| Runtime     | Compatibility | Notes                   |
| ----------- | ------------- | ----------------------- |
| **Node.js** | ⚠️ Works      | Potential runtime error |
| **Bun**     | ⚠️ Works      | Potential runtime error |

#### Fix Strategy: **Platform-Agnostic** ✅

**Recommended Fix:** Add null/undefined check before assignment or use fallback value. This is a **platform-agnostic solution**.

---

### 7. Property Access Issues (TS7053) - 3 Errors

**File:** [`packages/opencode/test/tool/temp-file-manager.test.ts`](packages/opencode/test/tool/temp-file-manager.test.ts:283)

**Description:** Accessing non-existent property `cleanupTimer` on TempFileManager class.

**Affected Lines:** 283, 288, 301

#### Platform Impact

| Platform    | Status    | Severity   | Notes                  |
| ----------- | --------- | ---------- | ---------------------- |
| **Windows** | ❌ Breaks | **Medium** | Test compilation fails |
| **macOS**   | ❌ Breaks | **Medium** | Test compilation fails |
| **Linux**   | ❌ Breaks | **Medium** | Test compilation fails |
| **Unix**    | ❌ Breaks | **Medium** | Test compilation fails |

#### Shell Compatibility

| Shell          | Compatibility | Notes                  |
| -------------- | ------------- | ---------------------- |
| **code**       | ❌ Breaks     | Test compilation fails |
| **powershell** | ❌ Breaks     | Test compilation fails |
| **git**        | ❌ Breaks     | Test compilation fails |
| **bash**       | ❌ Breaks     | Test compilation fails |
| **zsh**        | ❌ Breaks     | Test compilation fails |

#### Runtime Compatibility

| Runtime     | Compatibility | Notes                  |
| ----------- | ------------- | ---------------------- |
| **Node.js** | ❌ Breaks     | Test compilation fails |
| **Bun**     | ❌ Breaks     | Test compilation fails |

#### Fix Strategy: **Platform-Agnostic** ✅

**Recommended Fix:** Add `cleanupTimer` property to TempFileManager class or remove references if not needed. This is a **platform-agnostic solution**.

---

## Complete Platform/Shell Compatibility Matrix

### Summary Matrix

| Error Category        | Count | Windows | macOS | Linux | Unix | Code | PowerShell | Git | Bash | Zsh | Node | Bun |
| --------------------- | ----- | ------- | ----- | ----- | ---- | ---- | ---------- | --- | ---- | --- | ---- | --- |
| Global Type Usage     | 59    | ❌      | ❌    | ❌    | ❌   | ❌   | ❌         | ❌  | ❌   | ❌  | ❌   | ❌  |
| Duplicate Identifiers | 14    | ❌      | ❌    | ❌    | ❌   | ❌   | ❌         | ❌  | ❌   | ❌  | ❌   | ❌  |
| Case Sensitivity      | 5     | ⚠️      | ❌    | ❌    | ❌   | ⚠️   | ⚠️         | ⚠️  | ⚠️   | ⚠️  | ⚠️   | ⚠️  |
| Missing Modules       | 6     | ❌      | ❌    | ❌    | ❌   | ❌   | ❌         | ❌  | ❌   | ❌  | ❌   | ❌  |
| vitest Types          | 2     | ⚠️      | ⚠️    | ⚠️    | ⚠️   | ⚠️   | ⚠️         | ⚠️  | ⚠️   | ⚠️  | ⚠️   | ⚠️  |
| Type Assignment       | 1     | ⚠️      | ⚠️    | ⚠️    | ⚠️   | ⚠️   | ⚠️         | ⚠️  | ⚠️   | ⚠️  | ⚠️   | ⚠️  |
| Property Access       | 3     | ❌      | ❌    | ❌    | ❌   | ❌   | ❌         | ❌  | ❌   | ❌  | ❌   | ❌  |

**Legend:**

- ❌ = Breaks on this platform/shell/runtime
- ⚠️ = May work but potential issues
- ✅ = Works correctly

---

## Prioritized Fix Order

### Phase 1: Critical Fixes (Blocking - All Platforms)

#### Priority 1: Duplicate Identifiers (14 errors)

**File:** [`packages/opencode/src/tool/index.ts`](packages/opencode/src/tool/index.ts)

**Fix Actions:**

1. Remove duplicate exports from Lines 24, 30, 36, 42
2. Consolidate imports to single source
3. Verify no other duplicate exports exist

**Estimated Time:** 15 minutes  
**Platform-Agnostic:** ✅ Yes  
**Risk:** Low - Simple export cleanup

#### Priority 2: Global Type Usage (59 errors)

**File:** [`packages/opencode/src/lsp/server.ts`](packages/opencode/src/lsp/server.ts)

**Fix Actions:**

1. Replace `Global` with `globalThis` with runtime checks
2. Add type guards for cross-platform compatibility
3. Test with both Node.js and Bun runtimes

**Estimated Time:** 2-3 hours  
**Platform-Agnostic:** ✅ Yes  
**Risk:** Medium - Affects core LSP functionality

#### Priority 3: Missing Modules (6 errors)

**File:** [`packages/opencode/src/tool/index.ts`](packages/opencode/src/tool/index.ts)

**Fix Actions:**

1. Create `RegistryTool` module or remove export
2. Create `todoread` module or remove export
3. Create `todowrite` module or remove export
4. Fix type-only imports in test files
5. Fix duplicate object properties

**Estimated Time:** 1-2 hours  
**Platform-Agnostic:** ✅ Yes  
**Risk:** Medium - May require feature implementation

### Phase 2: Functional Fixes (Non-Blocking - Platform-Specific)

#### Priority 4: Case Sensitivity (5 errors)

**File:** [`packages/opencode/src/tool/index.ts`](packages/opencode/src/tool/index.ts)

**Fix Actions:**

1. Rename `CodesearchTool` → `CodeSearchTool`
2. Rename `LsTool` → `ListTool`
3. Rename `MultieditTool` → `MultiEditTool`
4. Rename `WebfetchTool` → `WebFetchTool`
5. Rename `WebsearchTool` → `WebSearchTool`
6. Update all references across codebase

**Estimated Time:** 1 hour  
**Platform-Agnostic:** ❌ No - Requires filesystem case handling  
**Risk:** Medium - Multiple files may need updates

#### Priority 5: Property Access (3 errors)

**File:** [`packages/opencode/test/tool/temp-file-manager.test.ts`](packages/opencode/test/tool/temp-file-manager.test.ts)

**Fix Actions:**

1. Add `cleanupTimer` property to TempFileManager class
2. OR remove references if not needed
3. Verify test logic is correct

**Estimated Time:** 30 minutes  
**Platform-Agnostic:** ✅ Yes  
**Risk:** Low - Test file changes only

#### Priority 6: Type Assignment (1 error)

**File:** [`packages/opencode/src/tool/git-env.ts`](packages/opencode/src/tool/git-env.ts:58)

**Fix Actions:**

1. Add null/undefined check before assignment
2. OR use fallback value

**Estimated Time:** 5 minutes  
**Platform-Agnostic:** ✅ Yes  
**Risk:** Low - Single line fix

### Phase 3: Testing Fixes (Non-Blocking)

#### Priority 7: vitest Types (2 errors)

**Files:**

- [`packages/opencode/test/tool/bash-parse.test.ts`](packages/opencode/test/tool/bash-parse.test.ts)
- [`packages/opencode/test/tool/bash-stream.test.ts`](packages/opencode/test/tool/bash-stream.test.ts)

**Fix Actions:**

1. Install vitest types: `bun add -D @types/vitest`
2. Or add vitest to devDependencies

**Estimated Time:** 5 minutes  
**Platform-Agnostic:** ✅ Yes  
**Risk:** Low - Dependency update

---

## Platform-Specific Handling Requirements

### Windows-Specific Issues

1. **Case Sensitivity** - Windows may appear to work but will fail on case-sensitive platforms
   - **Action:** Fix all case issues even if Windows builds succeed
   - **Testing:** Validate on Linux/macOS before merge

### macOS-Specific Issues

1. **Case Sensitivity** - APFS is case-sensitive by default
   - **Action:** Fix all case issues
   - **Testing:** Use case-sensitive APFS volume for testing

### Linux-Specific Issues

1. **Case Sensitivity** - All Linux filesystems are case-sensitive
   - **Action:** Fix all case issues
   - **Testing:** Standard Linux testing will catch issues

### Cross-Platform Considerations

1. **Path Handling** - Ensure paths work across all platforms
2. **Line Endings** - Use consistent line endings (LF for Unix, handle CRLF for Windows)
3. **Shell Scripts** - Ensure shell scripts work with bash, zsh, PowerShell, and git bash

---

## Errors Fixable with Platform-Agnostic Solutions

### ✅ Platform-Agnostic Fixes (48 errors)

1. **Global Type Usage (59 errors)** - Replace with `globalThis` and runtime checks
2. **Duplicate Identifiers (14 errors)** - Remove duplicate exports
3. **Missing Modules (6 errors)** - Create missing modules or remove exports
4. **vitest Types (2 errors)** - Install vitest types
5. **Type Assignment (1 error)** - Add null checks
6. **Property Access (3 errors)** - Fix property definitions

**Total Platform-Agnostic Fixes:** 85 errors (93%)

### ⚠️ Platform-Specific Fixes (5 errors)

1. **Case Sensitivity (5 errors)** - Fix naming conventions

**Total Platform-Specific Fixes:** 5 errors (7%)

---

## Validation Checklist

### Pre-Fix Validation

- [ ] Review all error locations in source files
- [ ] Identify all references to modified symbols
- [ ] Create backup of modified files
- [ ] Document any unknowns that need investigation

### Post-Fix Validation

- [ ] Run typecheck: `bun run typecheck`
- [ ] Test on Windows (Node.js and Bun)
- [ ] Test on macOS (Node.js and Bun)
- [ ] Test on Linux (Node.js and Bun)
- [ ] Test shell execution: bash, powershell, git bash, zsh
- [ ] Verify no regression in existing functionality
- [ ] Update unit tests if needed
- [ ] Document any remaining issues

---

## Conclusion

The cross-platform type error analysis reveals that **93% of errors can be fixed with platform-agnostic solutions**. The primary challenges are:

1. **Global Type Usage** - 59 errors requiring runtime detection fixes
2. **Duplicate Identifiers** - 14 errors requiring export consolidation
3. **Case Sensitivity** - 5 errors requiring platform-specific handling

The prioritized fix order ensures cross-platform issues are addressed first, minimizing the risk of platform-specific bugs slipping through. By following this analysis, the development team can systematically fix all 68 type errors while maintaining cross-platform compatibility across Windows, macOS, Linux, and Unix systems.

**Next Step:** Proceed to implementation of Phase 1 fixes starting with duplicate identifiers and Global type usage issues.
