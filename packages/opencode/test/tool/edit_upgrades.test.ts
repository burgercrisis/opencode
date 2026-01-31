import { expect, test, describe } from "bun:test"
import { trimDiff } from "../../src/tool/edit"

describe("Edit Tool Upgrades (Reflecting 5a87a6a Branch Point)", () => {
  describe("Unit Tests: trimDiff", () => {
    test("removes common indentation from diff lines", () => {
      const input = `--- file.txt
+++ file.txt
@@ -1,3 +1,3 @@
-    old line
+    new line
     context line`
      
      const expected = `--- file.txt
+++ file.txt
@@ -1,3 +1,3 @@
-old line
+new line
 context line`
      
      expect(trimDiff(input)).toBe(expected)
    })

    test("handles diffs with different indentation levels", () => {
      const input = `--- file.txt
+++ file.txt
@@ -1,4 +1,4 @@
-    old line
+    new line
       indented line
     context line`
      
      const expected = `--- file.txt
+++ file.txt
@@ -1,4 +1,4 @@
-old line
+new line
   indented line
 context line`
      
      expect(trimDiff(input)).toBe(expected)
    })

    test("does not trim if there is no common indentation", () => {
      const input = `--- file.txt
+++ file.txt
@@ -1,2 +1,2 @@
-old line
+new line`
      
      expect(trimDiff(input)).toBe(input)
    })

    test("ignores empty lines when calculating min indentation", () => {
      const input = `--- file.txt
+++ file.txt
@@ -1,4 +1,4 @@
-    old line
+
+    new line
     context line`
      
      const expected = `--- file.txt
+++ file.txt
@@ -1,4 +1,4 @@
-old line
+
+new line
 context line`
      
      expect(trimDiff(input)).toBe(expected)
    })
  })
})
