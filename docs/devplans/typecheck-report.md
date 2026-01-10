# Typecheck Report - Cross-Platform Analysis

**Date:** 2026-01-09  
**Run Command:** `bun run typecheck`  
**Status:** FAILED - Multiple type errors found  
**Affected Package:** `opencode` (main package with errors)

---

## Executive Summary

The typecheck identified **68 total errors** across multiple files in the `opencode` package. All other packages passed typecheck (cached). The errors fall into several categories:

1. **Global type usage issues** (59 occurrences) - Using TypeScript type as value
2. **Duplicate identifier errors** (14 occurrences) - Multiple exports with same name
3. **Missing module/type declarations** (6 occurrences)
4. **Case sensitivity issues** (5 occurrences) - Tool naming inconsistencies
5. **Test-related issues** (6 occurrences)
6. **Type assignment issues** (1 occurrence)

---

## Error Breakdown by Category

### 1. Global Type Usage (TS2693) - 59 occurrences

**File:** [`packages/opencode/src/lsp/server.ts`](packages/opencode/src/lsp/server.ts)

**Error Pattern:** `'Global' only refers to a type, but is being used as a value here.`

**Affected Lines:** 126, 136, 175, 182, 185, 194, 195, 370, 379, 389, 408, 420, 430, 515, 519, 569, 571, 589, 592, 607, 630, 697, 701, 709, 714, 742, 753, 764, 782, 793, 804, 912, 921, 925, 990, 1006, 1015, 1019, 1029, 1030, 1050, 1054, 1098, 1102, 1156, 1237, 1320, 1332, 1374, 1435, 1441, 1508, 1512, 1602, 1606, 1640, 1684, 1687, 1696, 1730, 1774, 1778, 1787, 1792, 1822, 1826, 1931, 1982, 1986, 1994, 1999

**Root Cause:** The code is using `Global` as a runtime value when it's only available as a TypeScript type. This is likely a Node.js/Bun runtime compatibility issue where the code expects `Global` to be available as a global object.

**Platform Impact:**

- ❌ Windows (Node/Bun)
- ❌ macOS (Node/Bun)
- ❌ Linux (Node/Bun)
- ❌ Unix (Node/Bun)

**Suggested Fix:**

- Replace `Global` usage with appropriate runtime checks
- Use `globalThis` with proper type guards
- Add runtime environment detection

---

### 2. Duplicate Identifier Errors (TS2300) - 14 occurrences

**File:** [`packages/opencode/src/tool/index.ts`](packages/opencode/src/tool/index.ts)

**Error Pattern:** `Duplicate identifier 'TempFileManager'`, `Duplicate identifier 'PowerShellExecutor'`, etc.

**Affected Lines:**

- Line 24: `TempFileManager` and `TempFilePoolFullError`
- Line 30: `PowerShellExecutor` and `PowerShellExecutionError`
- Line 36: `TempFileManager` and `TempFilePoolFullError`
- Line 42: `PowerShellExecutor` and `PowerShellExecutionError`

**Root Cause:** Multiple exports with the same name from different modules. This suggests duplicate imports or multiple declaration files.

**Platform Impact:**

- ⚠️ All platforms (compilation error, affects all builds)

**Suggested Fix:**

- Remove duplicate exports
- Consolidate imports from single source
- Use barrel exports properly

---

### 3. Case Sensitivity Issues (TS2724) - 5 occurrences

**File:** [`packages/opencode/src/tool/index.ts`](packages/opencode/src/tool/index.ts)

**Error Pattern:** Tools being exported with wrong case

**Affected Lines:**

- Line 46: `CodesearchTool` → Should be `CodeSearchTool`
- Line 51: `LsTool` → Should be `ListTool`
- Line 53: `MultieditTool` → Should be `MultiEditTool`
- Line 61: `WebfetchTool` → Should be `WebFetchTool`
- Line 62: `WebsearchTool` → Should be `WebSearchTool`

**Root Cause:** Inconsistent naming conventions in exports.

**Platform Impact:**

- ⚠️ Case-sensitive file systems (Linux, macOS) will fail
- ✅ Case-insensitive file systems (Windows default) may work

**Suggested Fix:**

- Standardize tool naming to PascalCase
- Update all references to match correct case

---

### 4. Missing Module/Type Declarations (TS2307, TS1484) - 6 occurrences

**File:** [`packages/opencode/src/tool/index.ts`](packages/opencode/src/tool/index.ts) and test files

**Errors:**

1. Line 56: `RegistryTool` - Module has no exported member
2. Line 59: `todoread` - Cannot find module
3. Line 60: `todowrite` - Cannot find module
4. Test file `test/tool/powershell-executor.test.ts` - Type-only import issues
5. Test file `test/tool/temp-file-manager.test.ts` - Object literal duplicate property

**Root Cause:** Missing or misconfigured module exports and type imports.

**Platform Impact:**

- ⚠️ All platforms (missing functionality)

**Suggested Fix:**

- Create missing modules or fix exports
- Add type-only imports where required
- Fix duplicate object properties

---

### 5. Missing vitest Types - 2 occurrences

**File:** [`packages/opencode/test/tool/bash-parse.test.ts`](packages/opencode/test/tool/bash-parse.test.ts)  
**File:** [`packages/opencode/test/tool/bash-stream.test.ts`](packages/opencode/test/tool/bash-stream.test.ts)

**Error:** `Cannot find module 'vitest' or its corresponding type declarations`

**Root Cause:** vitest types not installed or configured.

**Platform Impact:**

- ⚠️ Test execution affected on all platforms

**Suggested Fix:**

- Install vitest types: `bun add -D @types/vitest`
- Or add vitest to devDependencies

---

### 6. Type Assignment Issue (TS2322) - 1 occurrence

**File:** [`packages/opencode/src/tool/git-env.ts`](packages/opencode/src/tool/git-env.ts:58)

**Error:** `Type 'string | undefined' is not assignable to type 'string'`

**Root Cause:** Potential undefined value being assigned without null check.

**Platform Impact:**

- ⚠️ Runtime error possible on all platforms

**Suggested Fix:**

- Add null/undefined check before assignment
- Use fallback value

---

### 7. Property Access Issues (TS7053) - 3 occurrences

**File:** [`packages/opencode/test/tool/temp-file-manager.test.ts`](packages/opencode/test/tool/temp-file-manager.test.ts)

**Error:** `Property 'cleanupTimer' does not exist on type 'TempFileManager'`

**Affected Lines:** 283, 288, 301

**Root Cause:** Accessing non-existent property on TempFileManager class.

**Platform Impact:**

- ⚠️ Test compilation fails on all platforms

**Suggested Fix:**

- Add `cleanupTimer` property to TempFileManager class
- Or remove references if not needed

---

## Platform/Shell Compatibility Matrix

| Error Category        | Windows | macOS | Linux | Unix | Notes                   |
| --------------------- | ------- | ----- | ----- | ---- | ----------------------- |
| Global type usage     | ❌      | ❌    | ❌    | ❌   | Needs runtime detection |
| Duplicate identifiers | ❌      | ❌    | ❌    | ❌   | Build breaks everywhere |
| Case sensitivity      | ⚠️      | ❌    | ❌    | ❌   | Windows may work        |
| Missing modules       | ❌      | ❌    | ❌    | ❌   | Feature incomplete      |
| vitest types          | ⚠️      | ⚠️    | ⚠️    | ⚠️   | Test issues             |
| Type assignment       | ⚠️      | ⚠️    | ⚠️    | ⚠️   | Runtime potential error |
| Property access       | ❌      | ❌    | ❌    | ❌   | Test compilation fails  |

**Legend:**

- ❌ = Breaks on this platform
- ⚠️ = May work but potential issues
- ✅ = Works correctly

---

## Priority Fixes

### High Priority (Blocking)

1. **Global type usage** - 59 errors in LSP server (core functionality)
2. **Duplicate identifiers** - 14 errors blocking compilation
3. **Missing modules** - RegistryTool, todoread, todowrite

### Medium Priority (Functional)

4. **Case sensitivity** - 5 errors (may work on Windows)
5. **Property access** - 3 errors in tests
6. **Type assignment** - 1 error in git-env.ts

### Low Priority (Testing)

7. **vitest types** - 2 errors in test files

---

## Recommended Fix Strategy

1. **Phase 1: Critical Fixes**
   - Fix duplicate exports in `tool/index.ts`
   - Create missing modules or remove broken exports
   - Fix Global type usage with runtime checks

2. **Phase 2: Naming Consistency**
   - Standardize tool naming to PascalCase
   - Update all references

3. **Phase 3: Test Fixes**
   - Install vitest types
   - Fix property access issues
   - Fix type imports

4. **Phase 4: Validation**
   - Run typecheck on all platforms
   - Test shell execution (bash, powershell, git, zsh)
   - Validate Node and Bun runtimes

---

## Next Steps

1. Create detailed fix plan for each error category
2. Implement fixes starting with high priority items
3. Test cross-platform compatibility
4. Validate with both Node and Bun runtimes
5. Update unit tests to ensure coverage
6. Document any remaining issues
