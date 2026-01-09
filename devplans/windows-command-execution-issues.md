# Windows Command Execution - Outstanding Issues
## Issues NOT YET FIXED or NOT YET VERIFIED

---

## Executive Summary

This document contains only issues that are **NOT YET FIXED** or **NOT YET VERIFIED** through comprehensive testing.

**Verified Fixed Issues** have been moved to: [`devplans/verified-fixes-summary.md`](verified-fixes-summary.md)

---

## Outstanding Issues

| # | Issue | Severity | Status | Confidence | Root Cause | Location |
|---|-------|----------|--------|------------|------------|----------|
| **90% CONFIDENCE** | | | | | | |
| 12 | tree-sitter parser latency | MEDIUM | ℹ️ KNOWN | 90% | WASM loading on first use | bash.ts:31 |
| **85% CONFIDENCE** | | | | | | |
| 16 | Exit code error handling | MEDIUM | ⚠️ NEEDS IMPROVE | 85% | Silent failures | bash.ts:405 |
| 17 | Output truncation mid-line | MEDIUM | ⚠️ UX ISSUE | 85% | Check before adding | bash.ts:316 |
| 18 | Windows path escaping | MEDIUM | ⚠️ NEEDS FIX | 85% | Backslash handling across layers | bash.ts:288-292 |
| **80% CONFIDENCE** | | | | | | |
| 20 | Timeout handling | LOW | ⚠️ SUBOPTIMAL | 80% | Arbitrary buffer | bash.ts:367 |
| 21 | Missing timeout handling (prompt.ts) | LOW | ⚠️ NEEDS FIX | 80% | No timeout parameter | prompt.ts:1262 |
| 22 | Missing timedOut metadata (prompt.ts) | LOW | ⚠️ NEEDS FIX | 80% | No timedOut tracking | prompt.ts:1484 |
| 23 | parseCommand naive splitting | LOW | ⚠️ SUBOPTIMAL | 80% | No quote handling | bash.ts:139 |
| 24 | CMD double-escaping | MEDIUM | ⚠️ NEEDS FIX | 80% | Extra backslashes before quotes | bash.ts:288-292 |
| 25 | Output ambiguity | MEDIUM | ⚠️ NEEDS FIX | 80% | Can't distinguish echo vs execute | bash.ts:406-414 |
| 27 | File modification race | MEDIUM | ⚠️ NEEDS FIX | 75% | Concurrent access conflicts | bash.ts:200 |
| **75% CONFIDENCE** | | | | | | |
| 28 | Path resolution on Windows | MEDIUM | ⚠️ EDGE CASE | 75% | realpath failures | bash.ts:226 |
| 29 | Fallback to empty args (prompt.ts) | LOW | ⚠️ EDGE CASE | 75% | Unknown shell handling | prompt.ts:1329 |
| **70% CONFIDENCE** | | | | | | |
| 30 | Permission pattern extraction | MEDIUM | ⚠️ EDGE CASE | 70% | Variable expansion issues | bash.ts:207 |
| 31 | Shell name matching bug (prompt.ts) | LOW | ⚠️ EDGE CASE | 70% | Basename extraction | prompt.ts:1343 |
| **65% CONFIDENCE** | | | | | | |
| 32 | CMD quote/path handling | MEDIUM | ⚠️ NEEDS FIX | 65% | Double-escaping in shell wrapper | bash.ts:288-292 |
| **60% CONFIDENCE** | | | | | | |
| 33 | PowerShell -Path misuse | LOW | ❌ USER ERROR | 60% | User confused syntax | User error |
| 34 | PowerShell quoting issues (prompt.ts) | LOW | ⚠️ EDGE CASE | 60% | Hardcoded args | prompt.ts:1381 |
| **40% CONFIDENCE** | | | | | | |
| 35 | Files remain after delete | MEDIUM | ❓ EXTERNAL | 40% | Lock/permission/path | External |
| **NEW ISSUES** | | | | | | |
| 38 | Windows del command not recognized | HIGH | ❌ UNFIXED | 85% | Shell wrapper bypasses CMD built-ins | bash.ts:288-292 |
| 39 | Base64 encoded commands fail | MEDIUM | ❌ UNFIXED | 75% | Encoding issues | bash.ts:288-292 |
| 40 | Script block execution | HIGH | ❌ UNFIXED | 85% | `& { ... }` treated as literal | bash.ts:291 |
| 41 | Desktop app port conflict | LOW | ⚠️ NEEDS FIX | 100% | No port conflict handling | vite.config.ts |
| 42 | Python3 alias triggers Store prompt | LOW | ❌ UNFIXED | 100% | Windows Store association | External |

---

## Verified Fixed Issues (Moved to verified-fixes-summary.md)

The following issues have been **verified as fixed** and are documented in [`devplans/verified-fixes-summary.md`](verified-fixes-summary.md):

| Issue | Fix | Status | Verification Date |
|-------|-----|--------|-------------------|
| #1 | Bypass cmd.exe wrapper for PowerShell commands | ✅ VERIFIED | January 9, 2026 |
| #2 | Add Git cmd and MinGW paths to git-env.ts | ✅ VERIFIED | January 8, 2026 |
| #3 | Fix stream reading race condition | ✅ VERIFIED | January 8, 2026 |
| #4 | Remove duplicate abort listeners from bash.ts | ✅ VERIFIED | January 8, 2026 |
| #5 | Add stream draining to prompt.ts | ✅ VERIFIED | January 8, 2026 |
| #7 | Fix newString undefined bug | ✅ VERIFIED | January 8, 2026 |
| #8 | Fix desktop race condition | ✅ VERIFIED | January 8, 2026 |
| #9 | Add shell bypass to prompt.ts | ✅ VERIFIED | January 8, 2026 |
| #10 | Add Unified PowerShell Routing (-Command, -File) | ✅ VERIFIED | January 9, 2026 |
| #13 | Shell bypass consistency for native Windows commands | ✅ VERIFIED | January 9, 2026 |
| #14 | Auto-wrap bare script blocks with & operator | ✅ VERIFIED | January 9, 2026 |
| #15 | Add unique match identification | ✅ VERIFIED | January 8, 2026 |
| #19 | Fix Unicode character matching | ✅ VERIFIED | January 8, 2026 |
| #26 | Fix multi-line patterns | ✅ VERIFIED | January 8, 2026 |
| #36 | Path escaping for PowerShell | ✅ VERIFIED | January 9, 2026 |
| #37 | Route batch files through PowerShell wrapper | ✅ VERIFIED | January 9, 2026 |

**Total Verified Fixed:** 16 issues  
**Integration Test Results:** 140/140 tests passed (100% success rate)

---

## Action Plan for Outstanding Issues

### P1 (High Priority - Windows Command Execution)

| Issue | Action | Effort | Confidence |
|-------|--------|--------|------------|
| #18 | Fix Windows path escaping | Medium | 85% |
| #24 | Fix CMD double-escaping | Easy | 80% |
| #25 | Add output verification | Medium | 80% |
| #32 | Fix CMD quote/path handling | Medium | 65% |
| #38 | Fix Windows del command recognition | High | 85% |
| #40 | Fix script block execution | High | 85% |

### P2 (Medium Priority - General Improvements)

| Issue | Action | Effort | Confidence |
|-------|--------|--------|------------|
| #16 | Improve error handling for exit codes | Low | 85% |
| #17 | Improve output truncation | Low | 85% |
| #20 | Adaptive timeout handling | Medium | 80% |
| #21 | Add timeout handling to prompt.ts | Medium | 80% |
| #22 | Add timedOut metadata to prompt.ts | Easy | 80% |
| #23 | Use shell-quote for argument parsing | Medium | 80% |
| #27 | Implement file locking | Medium | 75% |

### P3 (Lower Priority / Edge Cases)

| Issue | Action | Effort | Confidence |
|-------|--------|--------|------------|
| #28 | Add UNC path support | Medium | 75% |
| #29 | Improve fallback handling | Low | 75% |
| #30 | Handle variable expansion in patterns | Medium | 70% |
| #31 | Fix shell name matching | Low | 70% |
| #34 | Fix PowerShell quoting | Medium | 60% |
| #35 | Add delete verification | Medium | 40% |
| #39 | Fix Base64 encoded commands | Medium | 75% |
| #41 | Add port conflict handling | Medium | 100% |
| #42 | Python3 alias handling | Low | 100% |

### P4 (Known Limitations / External)

| Issue | Action | Effort | Confidence |
|-------|--------|--------|------------|
| #12 | tree-sitter parser latency (known limitation) | N/A | 90% |
| #33 | PowerShell -Path misuse (user error) | Low | 60% |

---

## Document References

| File | Purpose |
|------|---------|
| [`devplans/verified-fixes-summary.md`](verified-fixes-summary.md) | All verified fixed issues with test results |
| [`devplans/windows-command-execution-test-prompt.md`](windows-command-execution-test-prompt.md) | Windows command execution test commands |
| [`devplans/verified-fixes-test-prompt.md`](verified-fixes-test-prompt.md) | Comprehensive test suite |
| [`packages/opencode/src/tool/bash.ts`](packages/opencode/src/tool/bash.ts) | Main file for Windows command execution |
| [`packages/opencode/src/tool/edit.ts`](packages/opencode/src/tool/edit.ts) | Edit tool implementation |

---

## Handoff Summary

- **16 issues verified fixed** and documented in [`verified-fixes-summary.md`](verified-fixes-summary.md)
- **23 issues outstanding** in this document
- **100% test success rate** for verified fixes (140/140 tests passed)

---

**Document Version:** 2.0  
**Created:** January 8, 2026  
**Updated:** January 9, 2026 01:45 UTC  
**Status:** MAINTAINED - Outstanding issues only
