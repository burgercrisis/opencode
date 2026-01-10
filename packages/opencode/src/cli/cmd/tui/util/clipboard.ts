import { platform, release } from "os"
import clipboardy from "clipboardy"
import { lazy } from "../../../../util/lazy.js"
import { tmpdir } from "os"
import path from "path"
import { spawn } from "child_process"
import fs from "fs/promises"

/**
 * Cross-platform shell execution helper
 */
async function shell(
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(args[0], args.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options?.cwd,
      env: options?.env,
    })
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    proc.stdout.on("data", (data: Buffer) => {
      stdout = Buffer.concat([stdout, data])
    })
    proc.stderr.on("data", (data: Buffer) => {
      stderr = Buffer.concat([stderr, data])
    })
    proc.on("close", (code: number) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })
    proc.on("error", (err: Error) => {
      stderr = Buffer.from(err.message)
      resolve({ stdout, stderr, exitCode: 1 })
    })
  })
}

/**
 * Check if a command exists in PATH
 */
function commandExists(cmd: string): boolean {
  const isBunRuntime = typeof Bun !== "undefined" && Bun.which !== undefined
  if (isBunRuntime) {
    return Bun.which(cmd) !== null
  }
  try {
    const { which } = require("which")
    return which.sync(cmd) !== null
  } catch {
    return false
  }
}

export namespace Clipboard {
  export interface Content {
    data: string
    mime: string
  }

  export async function read(): Promise<Content | undefined> {
    const os = platform()
    const isBunRuntime = typeof Bun !== "undefined" && Bun.file !== undefined

    if (os === "darwin") {
      const tmpfile = path.join(tmpdir(), "opencode-clipboard.png")
      try {
        const result = await shell([
          "osascript",
          "-e",
          'set imageData to the clipboard as "PNGf"',
          "-e",
          `set fileRef to open for access POSIX file "${tmpfile}" with write permission`,
          "-e",
          "set eof fileRef to 0",
          "-e",
          "write imageData to fileRef",
          "-e",
          "close access fileRef",
        ])
        let buffer: Buffer | ArrayBuffer
        if (isBunRuntime) {
          const file = Bun.file(tmpfile)
          buffer = await file.arrayBuffer()
        } else {
          buffer = await fs.readFile(tmpfile)
        }
        const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
        return { data: buf.toString("base64"), mime: "image/png" }
      } catch {
      } finally {
        await shell(["rm", "-f", tmpfile]).catch(() => {})
      }
    }

    if (os === "win32" || release().includes("WSL")) {
      const script =
        "Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $ms = New-Object System.IO.MemoryStream; $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); [System.Convert]::ToBase64String($ms.ToArray()) }"
      const result = await shell(["powershell.exe", "-command", script])
      const base64 = result.stdout.toString().trim()
      if (base64) {
        const imageBuffer = Buffer.from(base64, "base64")
        if (imageBuffer.length > 0) {
          return { data: imageBuffer.toString("base64"), mime: "image/png" }
        }
      }
    }

    if (os === "linux") {
      const waylandResult = await shell(["wl-paste", "-t", "image/png"])
      const wayland = waylandResult.exitCode === 0 ? waylandResult.stdout : null
      if (wayland && wayland.byteLength > 0) {
        return { data: Buffer.from(wayland).toString("base64"), mime: "image/png" }
      }
      const xclipResult = await shell(["xclip", "-selection", "clipboard", "-t", "image/png", "-o"])
      const x11 = xclipResult.exitCode === 0 ? xclipResult.stdout : null
      if (x11 && x11.byteLength > 0) {
        return { data: Buffer.from(x11).toString("base64"), mime: "image/png" }
      }
    }

    const text = await clipboardy.read().catch(() => {})
    if (text) {
      return { data: text, mime: "text/plain" }
    }
  }

  const getCopyMethod = lazy(() => {
    const os = platform()

    if (os === "darwin" && commandExists("osascript")) {
      console.log("clipboard: using osascript")
      return async (text: string) => {
        const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
        await shell(["osascript", "-e", `set the clipboard to "${escaped}"`]).catch(() => {})
      }
    }

    if (os === "linux") {
      if (process.env["WAYLAND_DISPLAY"] && commandExists("wl-copy")) {
        console.log("clipboard: using wl-copy")
        return async (text: string) => {
          const proc = spawn("wl-copy", { stdio: ["pipe", "ignore", "ignore"] as const })
          if (proc.stdin) {
            proc.stdin.write(text)
            proc.stdin.end()
          }
          await new Promise<void>((resolve) => {
            proc.on("close", () => resolve())
            proc.on("error", () => resolve())
          })
        }
      }
      if (commandExists("xclip")) {
        console.log("clipboard: using xclip")
        return async (text: string) => {
          const proc = spawn("xclip", ["-selection", "clipboard"], {
            stdio: ["pipe", "ignore", "ignore"] as const,
          })
          if (proc.stdin) {
            proc.stdin.write(text)
            proc.stdin.end()
          }
          await new Promise<void>((resolve) => {
            proc.on("close", () => resolve())
            proc.on("error", () => resolve())
          })
        }
      }
      if (commandExists("xsel")) {
        console.log("clipboard: using xsel")
        return async (text: string) => {
          const proc = spawn("xsel", ["--clipboard", "--input"], {
            stdio: ["pipe", "ignore", "ignore"] as const,
          })
          if (proc.stdin) {
            proc.stdin.write(text)
            proc.stdin.end()
          }
          await new Promise<void>((resolve) => {
            proc.on("close", () => resolve())
            proc.on("error", () => resolve())
          })
        }
      }
    }

    if (os === "win32") {
      console.log("clipboard: using powershell")
      return async (text: string) => {
        const escaped = text.replace(/"/g, '""')
        await shell(["powershell", "-command", `Set-Clipboard -Value "${escaped}"`]).catch(() => {})
      }
    }

    console.log("clipboard: no native support")
    return async (text: string) => {
      await clipboardy.write(text).catch(() => {})
    }
  })

  export async function copy(text: string): Promise<void> {
    await getCopyMethod()(text)
  }
}
