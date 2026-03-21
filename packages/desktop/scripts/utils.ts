import { $ } from "bun"
import { copyFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"

export const SIDECAR_BINARIES: Array<{ rustTarget: string; ocBinary: string; assetExt: string }> = [
  {
    rustTarget: "aarch64-apple-darwin",
    ocBinary: "opencode-darwin-arm64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-apple-darwin",
    ocBinary: "opencode-darwin-x64-baseline",
    assetExt: "zip",
  },
  {
    rustTarget: "aarch64-pc-windows-msvc",
    ocBinary: "opencode-windows-arm64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-pc-windows-msvc",
    ocBinary: "opencode-windows-x64-baseline",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-unknown-linux-gnu",
    ocBinary: "opencode-linux-x64-baseline",
    assetExt: "tar.gz",
  },
  {
    rustTarget: "aarch64-unknown-linux-gnu",
    ocBinary: "opencode-linux-arm64",
    assetExt: "tar.gz",
  },
]

export const RUST_TARGET =
  Bun.env.RUST_TARGET ||
  Bun.env.TAURI_ENV_TARGET_TRIPLE ||
  (process.platform === "win32"
    ? "x86_64-pc-windows-msvc"
    : process.platform === "darwin"
      ? process.arch === "arm64"
        ? "aarch64-apple-darwin"
        : "x86_64-apple-darwin"
      : process.arch === "arm64"
        ? "aarch64-unknown-linux-gnu"
        : "x86_64-unknown-linux-gnu")

export function getCurrentSidecar(target = RUST_TARGET) {
  if (!target) throw new Error("RUST_TARGET not set and could not be inferred")

  const binaryConfig = SIDECAR_BINARIES.find((b) => b.rustTarget === target)
  if (!binaryConfig) throw new Error(`Sidecar configuration not available for Rust target '${target}'`)

  return binaryConfig
}

export async function copyBinaryToSidecarFolder(source: string, target = RUST_TARGET) {
  const dest = windowsify(`src-tauri/sidecars/opencode-cli-${target}`)

  // Ensure directory exists
  const destDir = dirname(dest)
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true })
  } else {
    // Clean up any existing opencode-cli files in the sidecar folder to avoid conflicts/locks
    try {
      const files = readdirSync(destDir)
      for (const file of files) {
        if (file.startsWith("opencode-cli")) {
          const filePath = join(destDir, file)
          try {
            // Remove read-only attribute if it exists
            if (process.platform === "win32") {
              await $`attrib -r ${filePath}`.quiet()
            }
            unlinkSync(filePath)
          } catch (e) {
            console.warn(`Could not delete ${filePath}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }
    } catch (e) {
      console.warn(`Could not read sidecar directory: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  copyFileSync(source, dest)

  // Ensure the new file is not read-only and is "unblocked" for Windows
  if (process.platform === "win32") {
    try {
      await $`attrib -r ${dest}`.quiet()
      await $`powershell -Command "Unblock-File -Path '${dest}'"`.quiet()
    } catch (e) {
      // Ignore errors if attributes can't be set
    }
  }
}

export function windowsify(path: string) {
  if (path.endsWith(".exe")) return path
  return `${path}${process.platform === "win32" ? ".exe" : ""}`
}
