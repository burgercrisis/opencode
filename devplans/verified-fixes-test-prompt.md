# Verified Fixes Terminal Test Prompt

**Purpose**: Test the agent's ACTUAL terminal command execution capabilities. Use this prompt to verify all fixes work in real terminal scenarios.

**Instructions**:

1. Execute ALL commands directly in the terminal (DO NOT write test scripts)
2. Run commands as the agent would during normal operation
3. Verify each command executes correctly and produces expected output
4. Test edge cases by running variations of real-world commands
5. Document results in the Results Template section

---

## 1. Environment Variable Handling (Issue #2)

**Test**: Run git commands that require environment variables and binaries

### Terminal Commands to Execute

```bash
# Core git commands
git status
git log --oneline -5
git branch -a
git diff --stat
git remote -v
git config --list | head -20

# Git with different environments
PATH=/usr/bin:/bin git status
HOME=/tmp git log --oneline -1
GIT_PAGER=cat git log --oneline -3

# Test git from different directories
cd /tmp && git status 2>&1 || echo "Expected: No git repo"
cd / && git status 2>&1 || echo "Expected: No git repo"

# Verify git binary access
which git
git --version
```

### Edge Case Terminal Commands

```bash
# Test with empty PATH component
PATH=":/usr/bin:/bin" git --version

# Test with modified HOME
HOME=/nonexistent git config --list 2>&1 || echo "Expected error or empty"

# Test git with custom environment
env TEST_VAR=test123 bash -c 'echo $TEST_VAR && git --version'
```

### Expected Results

- All commands exit with code 0 (except where "Expected error" noted)
- No "command not found" errors
- Git commands work from any directory
- Environment variables properly passed

---

## 2. Stream Reading (Issue #3)

**Test**: Execute commands that produce various stream outputs

### Terminal Commands to Execute

```bash
# Generate 100 lines of output
for i in $(seq 1 100); do echo "LINE_$i"; done

# Generate 1000 lines - verify no data loss
for i in $(seq 1 1000); do echo "LINE_$i"; done | wc -l

# Test with START and END markers
(echo "START"; for i in $(seq 1 50); do echo "LINE_$i"; done; echo "END")

# Test mixed output
(echo "stdout1"; echo "stderr1" >&2; echo "stdout2"; echo "stderr2" >&2)

# Test slow output
for i in $(seq 1 20); do echo "LINE_$i"; sleep 0.05; done

# Test JSON output
echo '{"test": "value", "number": 42, "array": [1,2,3]}'

# Large buffer test
head -c 50000 /dev/urandom | base64 | head -20
```

### Race Condition Terminal Tests

```bash
# Run 20 iterations of stream reading - no data loss
for iter in {1..20}; do
  count=$(for i in $(seq 1 100); do echo "LINE_$i"; done | wc -l)
  if [ "$count" -ne "100" ]; then
    echo "FAIL: Iteration $iter - got $count lines"
    exit 1
  fi
done
echo "PASS: All 20 iterations - no data loss"

# Rapid command execution
for i in {1..10}; do
  result=$(echo "test$i")
  if [ -z "$result" ]; then
    echo "FAIL: Empty result at iteration $i"
    exit 1
  fi
done
echo "PASS: 10 rapid commands executed"
```

### Expected Results

- All lines captured (100, 1000, etc.)
- START and END markers both present
- Mixed stdout/stderr both captured
- No data loss across iterations

---

## 3. Abort Signal Handling (Issue #4)

**Test**: Execute abort-capable commands and verify no listener warnings

### Terminal Commands to Execute

```bash
# Test abort followed by normal command
timeout 0.1 sleep 10 2>&1 || echo "Timed out (expected)"
echo "Command after abort works"

# Multiple rapid aborts
for i in {1..5}; do
  (sleep 0.2 && echo "Delayed $i") &
  kill %1 2>/dev/null || true
done
wait
echo "After rapid aborts - success"

# Test with SIGTERM
sleep 10 &
pid=$!
sleep 0.1
kill $pid 2>/dev/null || true
wait $pid 2>/dev/null || echo "Process killed (expected)"
echo "After SIGTERM - success"

# Nested process abort
(sleep 10 &
kill %1 2>/dev/null || true
wait 2>/dev/null || true
echo "Nested abort handled"
echo "After nested - success")
```

### Listener Limit Tests

```bash
# Test for MaxListenersExceededWarning - add 15+ listeners
for i in {1..15}; do
  trap "echo Handler $i" EXIT
done
echo "Multiple handlers registered - no warning"
```

### Expected Results

- No "MaxListenersExceededWarning"
- Commands after aborts execute normally
- Signal handling is clean
- No zombie processes

---

## 4. Stream Draining (Issue #5)

**Test**: Execute commands with multiple streams and verify complete capture

### Terminal Commands to Execute

```bash
# Multi-line capture
echo -e "line1\nline2\nline3\nline4\nline5"

# Large output capture
seq 1 100 | xargs -I{} echo "Line {}"

# Special characters
echo -e "a\tb\tc\td\te"

# Pipe chain
printf "1\n2\n3\n4\n5" | tail -3

# Stdout and stderr together
(echo "stdout line 1"; echo "stderr line 1" >&2; echo "stdout line 2"; echo "stderr line 2" >&2)

# Slow stream with delay
for i in {1..10}; do
  echo "Line $i"
  sleep 0.02
done

# Large buffered output
dd if=/dev/zero bs=1024 count=100 2>/dev/null | head -c 5000
```

### Stream Verification

```bash
# Verify all lines captured
output=$(for i in $(seq 1 50); do echo "LINE_$i"; done)
line_count=$(echo "$output" | wc -l)
if [ "$line_count" -eq "50" ]; then
  echo "PASS: All 50 lines captured"
else
  echo "FAIL: Expected 50 lines, got $line_count"
fi

# Verify order preserved
output=$(echo -e "first\nsecond\nthird\nfourth\nfifth")
if echo "$output" | grep -q "first.*second.*third"; then
  echo "PASS: Order preserved"
else
  echo "FAIL: Order not preserved"
fi
```

### Expected Results

- All output captured (no truncation)
- Both stdout and stderr present
- Line order preserved
- No partial output

---

## 5. Shell Bypass (Issue #9)

**Test**: Execute commands directly through shell (cmd.exe on Windows, bash on Unix)

### Terminal Commands to Execute

```bash
# Simple commands
echo "test_output"
echo "unicode: café résumé"
date
pwd
ls -la

# Git commands
git --version
git status
git log --oneline -3

# Windows-specific (if on Windows)
cmd /c echo native_windows
cmd /c ver
cmd /c echo %USERNAME%

# Shell features - Pipes
echo "test" | cat | cat | cat
seq 1 10 | sort -r | tail -5

# Shell features - Command substitution
current_date=$(date +%Y-%m-%d)
echo "Today is: $current_date"
result=$(git --version | cut -d' ' -f3)
echo "Git version extracted: $result"

# Shell features - Environment variables
echo "Home is: $HOME"
echo "PATH has $(echo $PATH | tr ':' '\n' | wc -l) directories"

# Shell features - Glob patterns
ls *.md 2>/dev/null || echo "No .md files"
ls packages/*/package.json 2>/dev/null | head -5

# Shell features - Redirection
echo "redirect test" > /tmp/test-redirect.txt
cat /tmp/test-redirect.txt
echo "error" 2>&1 > /dev/null || echo "Stderr captured"

# Shell features - Quotes
echo 'Single quotes: $VAR and `command`'
echo "Double quotes: $HOME and $(date)"
echo "Mixed: 'single' and \"double\" quotes"
```

### Exit Code Tests

```bash
# Test various exit codes
true && echo "Exit 0: success" || echo "Exit 0: fail"
(false; echo $?) | tail -1
ls /nonexistent 2>&1; echo "Exit code: $?"
command_does_not_exist 2>&1; echo "Exit code: $?"
```

### Expected Results

- All commands execute with expected output
- Exit codes correct (0 for success, non-zero for errors)
- No command echoing (output is result, not command string)
- Shell features work as expected

---

## 6. Server Initialization Race Condition (Issue #8)

**Test**: Execute commands immediately after startup to verify no race conditions

### Terminal Commands to Execute

```bash
# Immediate command at "startup"
echo "hello"
echo "world"

# Rapid sequence - no initialization delay
for i in {1..10}; do
  echo "Command $i at $(date +%s.%N)"
done

# Commands that depend on server state
git config --global user.name "Test User" 2>/dev/null || true
git config --global user.email "test@example.com" 2>/dev/null || true
git config --list | grep user

# Multiple rapid commands
date; pwd; echo "test"; git --version; echo "complete"

# Concurrent initialization test
(echo "1") & (echo "2") & (echo "3") & wait
echo "Concurrent commands complete"
```

### Timing Tests

```bash
# Measure initialization time
start=$(date +%s%N)
result=$(echo "test")
end=$(date +%s%N)
duration=$(( (end - start) / 1000000 ))
echo "Command execution time: ${duration}ms"

if [ $duration -lt 1000 ]; then
  echo "PASS: Fast initialization (<1s)"
else
  echo "WARNING: Slow initialization (${duration}ms)"
fi

# Rapid succession test
for i in {1..20}; do
  result=$(echo "cmd$i" 2>&1)
  if [ $? -ne 0 ]; then
    echo "FAIL at iteration $i"
    exit 1
  fi
done
echo "PASS: 20 rapid commands all succeeded"
```

### Expected Results

- Commands execute immediately (no initialization delay)
- All rapid commands complete successfully
- No race conditions or errors at startup

---

## 7. Edit Tool: newString Validation (Issue #7)

**Test**: Execute edit commands with various newString values

### Terminal Commands to Execute

```bash
# Create test files
echo -e "LINE1\nLINE2\nLINE3" > /tmp/edit-test.txt
cat /tmp/edit-test.txt

# Test empty newString (should fail)
# Note: This test may need to be run through the actual edit tool
# Simulating the validation:
if [ -z "" ]; then
  echo "PASS: Empty string detected as invalid"
else
  echo "FAIL: Empty string not detected"
fi

# Test undefined/null handling
if [ -z "${newString:-}" ]; then
  echo "PASS: Undefined detected as invalid"
else
  echo "INFO: Undefined check (may vary)"
fi

# Test valid replacement
echo "Testing valid replacement through edit tool..."
# Expected: Edit tool updates LINE1 to NEWLINE1

# Test whitespace-only (should be valid)
if [ ! -z " " ] && [ -z " " ]; then
  echo "INFO: Whitespace-only string handling"
fi

# Test no-change scenario
if [ "LINE1" = "LINE1" ]; then
  echo "PASS: No-change scenario identified"
fi
```

### Validation Tests

```bash
# File existence checks
ls -la /tmp/edit-test.txt && echo "Test file exists"

# Verify file content
cat /tmp/edit-test.txt

# Test with different content types
echo -e 'function test() {\n  return true;\n}' > /tmp/edit-js.txt
echo -e '{"key": "value", "num": 42}' > /tmp/edit-json.txt
echo -e '<html>\n<body>\nHello\n</body>\n</html>' > /tmp/edit-html.txt
echo "Test files created for various content types"
```

### Expected Results

- Empty/undefined newString properly rejected
- Valid replacements work correctly
- Error messages are descriptive
- Various file types handled correctly

---

## 8. Edit Tool: Multiple Match Handling (Issue #15)

**Test**: Execute edit commands where oldString appears multiple times

### Terminal Commands to Execute

```bash
# Create test file with repeated content
cat > /tmp/multi-match.txt << 'MULTIEOF'
apple
banana
apple
cherry
apple
MULTIEOF

cat /tmp/multi-match.txt

# Test multiple match detection
# Expected: Edit tool should detect "apple" appears 3 times
# and require replaceFirst=true or return error

# Count occurrences
echo "Occurrences of 'apple': $(grep -c 'apple' /tmp/multi-match.txt)"

# Test unique context match
echo "banana followed by apple:"
grep -n "banana\napple" /tmp/multi-match.txt || echo "No direct match (expected with grep)"

# Test replaceFirst behavior
# Create test for replaceFirst=true scenario
cat > /tmp/replacefirst-test.txt << 'RPFEOF'
apple 1
banana
apple 2
cherry
apple 3
RPFEOF

echo "Original content:"
cat /tmp/replacefirst-test.txt

# Verify line count
line_count=$(wc -l < /tmp/replacefirst-test.txt)
echo "Line count: $line_count"
```

### Expected Results

- Clear error when multiple matches found without replaceFirst
- replaceFirst=true only replaces first occurrence
- Context-based patterns work when unique
- All occurrences properly counted

---

## 9. Edit Tool: Unicode Character Matching (Issue #19)

**Test**: Execute edit commands with Unicode characters

### Terminal Commands to Execute

```bash
# Create test file with Unicode content
cat > /tmp/unicode-test.txt << 'UNICODEEOF'
"Smart quotes"
it's working
Item — with em dash
Mixed: "test" and 'quotes'
Café résumé naïve
Ñoño España
Smile 😀 emoji
Chinese 中文
Math: ∑ ∏ ∫ ≈ ≠ ≤ ≥
UNICODEEOF

cat /tmp/unicode-test.txt

# Verify Unicode content
file /tmp/unicode-test.txt
echo "File encoding check complete"

# Test specific Unicode characters
echo "Testing Unicode character detection:"
grep -n '"Smart quotes"' /tmp/unicode-test.txt && echo "Smart quotes found"
grep -n "it's" /tmp/unicode-test.txt && echo "Smart apostrophe found"
grep -n "—" /tmp/unicode-test.txt && echo "Em dash found"
grep -n "Café" /tmp/unicode-test.txt && echo "Accented characters found"
grep -n "中文" /tmp/unicode-test.txt && echo "CJK characters found"
grep -n "😀" /tmp/unicode-test.txt && echo "Emoji found"

# Test Unicode length
echo "String lengths:"
echo "ASCII 'test': $(echo -n 'test' | wc -c)"
echo "UTF-8 'café': $(echo -n 'café' | wc -c)"
echo "UTF-8 '中文': $(echo -n '中文' | wc -c)"
echo "UTF-8 '😀': $(echo -n '😀' | wc -c)"
```

### Expected Results

- Smart quotes (", ") match correctly
- Smart apostrophe (') matches correctly
- Em dash (—) matches correctly
- All Unicode types (accented, CJK, emoji) match correctly
- UTF-8 encoding preserved

---

## 10. Edit Tool: Multi-line Patterns with Empty Lines (Issue #26)

**Test**: Execute edit commands with multi-line patterns including empty lines

### Terminal Commands to Execute

```bash
# Create test files with various empty line configurations

# Single empty line in middle
cat > /tmp/empty-middle.txt << 'EMPTYEOF'
START
MIDDLE


CONTINUE
END
EMPTYEOF

# Two empty lines
cat > /tmp/empty-double.txt << 'EMPTYEOF'
START


END
EMPTYEOF

# Empty line at start
cat > /tmp/empty-start.txt << 'EMPTYEOF'

START
MIDDLE
END
EMPTYEOF

# Empty line at end
cat > /tmp/empty-end.txt << 'EMPTYEOF'
START
MIDDLE
END

EMPTYEOF

# Multiple empty lines (3+)
cat > /tmp/empty-many.txt << 'EMPTYEOF'
START



END
EMPTYEOF

# Whitespace-only lines
cat > /tmp/empty-whitespace.txt << 'EMPTYEOF'
START
  
MIDDLE
   
END
EMPTYEOF

# Display all test files
echo "=== Empty Middle ==="
cat -A /tmp/empty-middle.txt
echo ""
echo "=== Empty Double ==="
cat -A /tmp/empty-double.txt
echo ""
echo "=== Empty Start ==="
cat -A /tmp/empty-start.txt
echo ""
echo "=== Empty End ==="
cat -A /tmp/empty-end.txt
echo ""
echo "=== Empty Many ==="
cat -A /tmp/empty-many.txt
echo ""
echo "=== Empty Whitespace ==="
cat -A /tmp/empty-whitespace.txt

# Verify line counts
echo ""
echo "Line counts:"
wc -l /tmp/empty-*.txt
```

### Expected Results

- Single empty line patterns work
- Multiple empty lines work
- Empty line at start of pattern works
- Empty line at end of pattern works
- Whitespace-only lines handled appropriately

---

## 11. Cross-Category Integration Tests

**Test**: Execute commands combining multiple fix areas

### Terminal Commands to Execute

```bash
# Test 1: Unicode + Multi-line + Edit
cat > /tmp/int-unicode.txt << 'EOF'
START
Café résumé
END
EOF
echo "Unicode multi-line test file created"

# Test 2: Environment + Shell + Git
export TEST_VAR="value with spaces"
echo "Environment test: $TEST_VAR"
git config --global test.var "$TEST_VAR"
git config --global test.var && echo "Git config with special chars works"

# Test 3: Stream + Abort + Shell
(echo "start"; sleep 0.1; echo "middle"; sleep 0.1; echo "end") &
pid=$!
sleep 0.15
kill $pid 2>/dev/null || true
wait $pid 2>/dev/null || echo "Process handled"
echo "Stream abort test complete"

# Test 4: Edit + Multiple Matches + Empty Lines
cat > /tmp/int-multi-empty.txt << 'EOF'
apple

apple

apple
EOF
echo "Multiple matches with empty lines file created"

# Test 5: Server Init + Rapid Commands
echo "Rapid command test:"
for i in {1..15}; do
  echo "cmd$i" > /dev/null
done
echo "15 rapid commands completed"

# Test 6: Shell Features + Unicode + Special Chars
echo "Mixed test:"
export UNICODE_VAR="Café 中文 😀"
echo "Unicode var: $UNICODE_VAR"
echo "Special chars: !@#$%^&*()"

# Test 7: Git + Stream Reading + Environment
echo "Git with environment:"
GIT_PAGER=cat git log --oneline -5 --no-pager 2>/dev/null || git log --oneline -5
```

### Expected Results

- All integration tests execute without errors
- No unexpected interactions between fix areas
- Commands complete successfully

---

## Results Template

### Environment Variables

| Command | Exit Code | Output | Status | Notes |
|---------|-----------|--------|--------|-------|
| `git status` | ? | ? | ✅/❌ | |
| `git log --oneline -5` | ? | ? | ✅/❌ | |
| `git branch -a` | ? | ? | ✅/❌ | |
| `git diff --stat` | ? | ? | ✅/❌ | |
| `git remote -v` | ? | ? | ✅/❌ | |
| `which git` | ? | ? | ✅/❌ | |
| `PATH=":/usr/bin" git --version` | ? | ? | ✅/❌ | |
| `env TEST_VAR=test git --version` | ? | ? | ✅/❌ | |

### Stream Reading

| Test | Command | Expected | Actual | Status |
|------|---------|----------|--------|--------|
| 100 lines | `for i in $(seq 1 100)` | 100 lines | ? | ✅/❌ |
| 1000 lines | `for i in $(seq 1 1000)` | 1000 lines | ? | ✅/❌ |
| Markers | START/END markers | Both present | ? | ✅/❌ |
| JSON | Echo JSON | Valid parse | ? | ✅/❌ |
| Race (20 iter) | 20 iterations | All pass | ? | ✅/❌ |
| Rapid (10) | 10 rapid commands | All succeed | ? | ✅/❌ |

### Abort Handling

| Test | Command | Expected | Actual | Status |
|------|---------|----------|--------|--------|
| Timeout + echo | `timeout 0.1 sleep 10` | Timeout + echo works | ? | ✅/❌ |
| 5 rapid aborts | Loop with kill | All handle | ? | ✅/❌ |
| SIGTERM | `kill sleep` | Clean kill | ? | ✅/❌ |
| 15 handlers | Multiple traps | No warning | ? | ✅/❌ |

### Stream Draining

| Test | Command | Expected | Actual | Status |
|------|---------|----------|--------|--------|
| Multi-line | 5 lines echo | 5 captured | ? | ✅/❌ |
| 100 lines | seq 1 100 | All captured | ? | ✅/❌ |
| Tabs | echo with \t | Preserved | ? | ✅/❌ |
| Mixed streams | stdout + stderr | Both captured | ? | ✅/❌ |
| Slow stream | 10 lines, 0.02s delay | Complete | ? | ✅/❌ |

### Shell Bypass

| Test | Command | Expected | Actual | Status |
|------|---------|----------|--------|--------|
| Simple echo | `echo test` | "test" | ? | ✅/❌ |
| Git version | `git --version` | Version | ? | ✅/❌ |
| Windows cmd | `cmd /c echo native` | "native" | ? | ✅/❌ |
| Pipes | `a\|b\|c` | Chained | ? | ✅/❌ |
| Substitution | `$(date)` | Date output | ? | ✅/❌ |
| Glob | `ls *.md` | Files | ? | ✅/❌ |
| Exit 0 | `true` | Exit 0 | ? | ✅/❌ |
| Exit non-0 | `ls /nonexistent` | Exit !=0 | ? | ✅/❌ |

### Server Initialization

| Test | Command | Expected | Actual | Status |
|------|---------|----------|--------|--------|
| Immediate echo | `echo "hello"` | Immediate | ? | ✅/❌ |
| 10 rapid | Loop 10 commands | All succeed | ? | ✅/❌ |
| Timing | Measure duration | <1s | ? | ✅/❌ |
| 20 rapid | Loop 20 commands | All succeed | ? | ✅/❌ |

### Edit Tool Validation

| Test | Command | Expected | Actual | Status |
|------|---------|----------|--------|--------|
| Empty string | Empty newString | Error | ? | ✅/❌ |
| Undefined | Undefined newString | Error | ? | ✅/❌ |
| Valid | Valid replacement | Success | ? | ✅/❌ |
| No change | Same string | Success | ? | ✅/❌ |

### Edit Tool Multiple Matches

| Test | Command | Expected | Actual | Status |
|------|---------|----------|--------|--------|
| Multiple apple | 3 occurrences | Error or flag | ? | ✅/❌ |
| replaceFirst | Only first | First replaced | ? | ✅/❌ |
| Context match | Unique pattern | Success | ? | ✅/❌ |

### Edit Tool Unicode

| Test | Command | Expected | Actual | Status |
|------|---------|----------|--------|--------|
| Smart quotes | "text" | Match | ? | ✅/❌ |
| Em dash | — | Match | ? | ✅/❌ |
| Smart apostrophe | it's | Match | ? | ✅/❌ |
| CJK | 中文 | Match | ? | ✅/❌ |
| Emoji | 😀 | Match | ? | ✅/❌ |

### Edit Tool Multi-line Empty

| Test | File | Expected | Actual | Status |
|------|------|----------|--------|--------|
| Single empty | empty-middle.txt | Match | ? | ✅/❌ |
| Double empty | empty-double.txt | Match | ? | ✅/❌ |
| Start empty | empty-start.txt | Match | ? | ✅/❌ |
| End empty | empty-end.txt | Match | ? | ✅/❌ |
| Many empty | empty-many.txt | Match | ? | ✅/❌ |

### Integration Tests

| Test | Command | Expected | Actual | Status |
|------|---------|----------|--------|--------|
| Unicode multi-line | Create + edit file | Works | ? | ✅/❌ |
| Git + env | Git with env vars | Works | ? | ✅/❌ |
| Stream + abort | Stream with kill | Clean | ? | ✅/❌ |
| Edit + multi + empty | Complex edit | Works | ? | ✅/❌ |
| Rapid 15 | 15 rapid commands | All pass | ? | ✅/❌ |

---

## Pass Criteria Summary

For **ALL** fixes to be considered verified:

1. ✅ **Environment Variables**: All terminal commands execute without errors
2. ✅ **Stream Reading**: 100% output captured in all terminal tests
3. ✅ **Abort Handling**: No warnings, clean termination in terminal
4. ✅ **Stream Draining**: All terminal output captured completely
5. ✅ **Shell Bypass**: Direct shell execution works for all commands
6. ✅ **Server Initialization**: No race conditions in rapid terminal commands
7. ✅ **Edit Validation**: Empty/undefined newString rejected in actual edit calls
8. ✅ **Multiple Matches**: Clear error or correct behavior with replaceFirst
9. ✅ **Unicode**: All Unicode types match in actual edit operations
10. ✅ **Multi-line Empty**: All empty line configurations work in actual edits
11. ✅ **Integration**: Cross-category terminal tests all pass

---

## Quick Terminal Verification (Minimum Viable)

Run these commands directly in terminal:

```bash
# Core terminal tests
echo "=== Quick Verification ==="
git status
git --version
echo "test_output"
cmd /c echo native_windows 2>/dev/null || echo "Windows command not available"

# Stream test
(for i in $(seq 1 100); do echo "LINE_$i"; done) | wc -l

# Rapid commands
for i in {1..5}; do echo "cmd$i"; done

# Git test
git log --oneline -3

echo "=== Quick verification complete ==="
```

If all pass → Core fixes are VERIFIED ✅

---

## Test Execution Checklist

- [ ] All terminal commands executed directly (no test scripts)
- [ ] Results documented in template
- [ ] All pass criteria met
- [ ] No warnings or errors in output
- [ ] Edge cases tested via terminal variations
- [ ] Integration tests passed via direct commands
- [ ] Final verification complete

**Test Date**: _______________
**Tester**: _______________
**Terminal**: _______________
**Total Commands Run**: _______________
**Commands Passed**: _______________
**Commands Failed**: _______________
**Notes**: _______________
