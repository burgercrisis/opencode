#!/usr/bin/env bun

import fs from "fs"
import path from "path"

/**
 * Rewrite tree-sitter wasm references inside a JS file to absolute paths.
 * argv: [node, script, file, mainWasm, ...wasmPaths]
 */
const [, , file, mainWasm, ...wasmPaths] = process.argv

if (!file || !mainWasm) {
  console.error("usage: patch-wasm <file> <mainWasm> [wasmPaths...]")
  process.exit(1)
}

const content = fs.readFileSync(file, "utf8")
const byName = new Map<string, string>()

for (const wasm of wasmPaths) {
  const name = path.basename(wasm)
  byName.set(name, wasm)
}

let next = content

for (const [name, wasmPath] of byName) {
  next = next.replaceAll(name, wasmPath)
}

next = next.replaceAll("tree-sitter.wasm", mainWasm).replaceAll("web-tree-sitter/tree-sitter.wasm", mainWasm)

// Collapse any relative prefixes before absolute store paths (e.g., "../../../..//nix/store/..." or "../../../..//C:/nix/store/...")
const isWindows = process.platform === 'win32'
const nixStorePrefix = process.env.NIX_STORE || 
  (isWindows ? "C:/nix/store" : "/nix/store")

// Normalize path separators for cross-platform compatibility
const normalizedStorePrefix = nixStorePrefix
  .replace(/\\/g, '/') // Convert backslashes to forward slashes for regex
  .replace(/^\//, '') // Remove leading slash for regex

next = next.replace(/(\.\/)+/g, "./")

// Handle both Unix and Windows path patterns
// Match patterns like "../../../..//nix/store/..." or "../../../..//C:/nix/store/..."
next = next.replace(
  new RegExp(`(\\.\\.\\/)+\\/{1,2}(${normalizedStorePrefix}[^"']+)`, "g"),
  "/$2",
)

// Match patterns like "//nix/store/..." or "//C:/nix/store/..."
next = next.replace(
  new RegExp(`(["'])\\/{2,}(\\/${normalizedStorePrefix}[^"']+)(["'])`, "g"), 
  "$1$2$3"
)

// Match patterns like "/nix/store/..." or "/C:/nix/store/..." with quotes
next = next.replace(
  new RegExp(`(["'])\\/(${normalizedStorePrefix}[^"']+)(["'])`, "g"), 
  "$1$2$3"
)

if (next !== content) fs.writeFileSync(file, next)