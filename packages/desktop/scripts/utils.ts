import { $ } from "bun"
<<<<<<< HEAD
import fs from "fs"
import path from "path"
=======
>>>>>>> upstream/dev

export const SIDECAR_BINARIES: Array<{ rustTarget: string; ocBinary: string; assetExt: string }> = [
  {
    rustTarget: "aarch64-apple-darwin",
    ocBinary: "opencode-darwin-arm64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-apple-darwin",
    ocBinary: "opencode-darwin-x64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-pc-windows-msvc",
    ocBinary: "opencode-windows-x64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-unknown-linux-gnu",
    ocBinary: "opencode-linux-x64",
    assetExt: "tar.gz",
  },
  {
    rustTarget: "aarch64-unknown-linux-gnu",
    ocBinary: "opencode-linux-arm64",
    assetExt: "tar.gz",
  },
]

export const RUST_TARGET = Bun.env.RUST_TARGET

export function getCurrentSidecar(target = RUST_TARGET) {
  if (!target && !RUST_TARGET) throw new Error("RUST_TARGET not set")

  const binaryConfig = SIDECAR_BINARIES.find((b) => b.rustTarget === target)
  if (!binaryConfig) throw new Error(`Sidecar configuration not available for Rust target '${RUST_TARGET}'`)

  return binaryConfig
}

export async function copyBinaryToSidecarFolder(source: string, target = RUST_TARGET) {
<<<<<<< HEAD
  // Cross-platform directory creation
  const sidecarDir = "src-tauri/sidecars";
  await fs.promises.mkdir(sidecarDir, { recursive: true });
  
  const dest = `src-tauri/sidecars/opencode-cli-${target}${process.platform === "win32" ? ".exe" : ""}`
  // Cross-platform file copy
  await fs.promises.copyFile(source, dest);
=======
  await $`mkdir -p src-tauri/sidecars`
  const dest = `src-tauri/sidecars/opencode-cli-${target}${process.platform === "win32" ? ".exe" : ""}`
  await $`cp ${source} ${dest}`
>>>>>>> upstream/dev

  console.log(`Copied ${source} to ${dest}`)
}
