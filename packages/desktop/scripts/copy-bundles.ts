import { $ } from "bun"
import * as path from "node:path"
import fs from "fs"

import { RUST_TARGET } from "./utils"

if (!RUST_TARGET) throw new Error("RUST_TARGET not defined")

const BUNDLE_DIR = `src-tauri/target/${RUST_TARGET}/release/bundle`
const BUNDLES_OUT_DIR = path.join(process.cwd(), `src-tauri/target/bundles`)

// Cross-platform directory creation
await fs.promises.mkdir(BUNDLES_OUT_DIR, { recursive: true });

// Cross-platform recursive copy
async function copyRecursive(src: string, dest: string): Promise<void> {
  const stat = await fs.promises.stat(src);
  if (stat.isDirectory()) {
    await fs.promises.mkdir(dest, { recursive: true });
    const files = await fs.promises.readdir(src);
    for (const file of files) {
      await copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    await fs.promises.copyFile(src, dest);
  }
}

// Copy all OpenCode bundles
const bundleItems = await fs.promises.readdir(BUNDLE_DIR, { withFileTypes: true });
for (const item of bundleItems) {
  if (item.isDirectory() && item.name.startsWith("OpenCode")) {
    const sourceDir = path.join(BUNDLE_DIR, item.name);
    const destDir = path.join(BUNDLES_OUT_DIR, item.name);
    await copyRecursive(sourceDir, destDir);
  }
}
