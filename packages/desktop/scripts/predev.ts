import { $ } from "bun"
import { copyBinaryToSidecarFolder, getCurrentSidecar, windowsify, RUST_TARGET } from "./utils"

// Aggressively kill any hanging sidecar or app processes to release file locks
if (process.platform === "win32") {
  try {
    // Kill any process that might be using the opencode-cli or the app
    await $`powershell -Command "Get-Process | Where-Object { $_.Name -like '*opencode*' } | Stop-Process -Force"`.quiet()
  } catch (e) {
    // Ignore errors if no processes found
  }
}

const sidecarConfig = getCurrentSidecar(RUST_TARGET)

// Use baseline builds on Windows due to Bun download issues
const useBaseline = process.platform !== "win32"

// Use correct binary name based on whether we're doing baseline build
const binaryName = process.platform === "win32" && sidecarConfig.ocBinary.includes("-baseline")
  ? sidecarConfig.ocBinary.replace("-baseline", "")
  : sidecarConfig.ocBinary

const binaryPath = windowsify(`../opencode/dist/${binaryName}/bin/opencode`)

await (useBaseline ? $`cd ../opencode && bun run build --single --baseline` : $`cd ../opencode && bun run build --single`)
await copyBinaryToSidecarFolder(binaryPath, RUST_TARGET)

// Give Windows/Antivirus a moment to release the file handle
if (process.platform === "win32") {
  await new Promise(resolve => setTimeout(resolve, 1000))
}
