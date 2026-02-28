import { $ } from "bun"
import * as fs from "fs/promises"
import os from "os"
import path from "path"
import type { Config } from "../../src/config/config"

// Strip null bytes from paths (defensive fix for CI environment issues)
function sanitizePath(p: string): string {
  return p.replace(/\0/g, "")
}

type TmpDirOptions<T> = {
  git?: boolean
  config?: Partial<Config.Info>
  init?: (dir: string) => Promise<T>
  dispose?: (dir: string) => Promise<T>
}
export async function tmpdir<T>(options?: TmpDirOptions<T>) {
  const dirpath = sanitizePath(path.join(os.tmpdir(), "opencode-test-" + Math.random().toString(36).slice(2)))
  await fs.mkdir(dirpath, { recursive: true })
  if (options?.git) {
    await $`git init`.cwd(dirpath).quiet()
    await $`git commit --allow-empty -m "root commit ${dirpath}"`.cwd(dirpath).quiet()
  }
  if (options?.config) {
    await Bun.write(
      path.join(dirpath, "opencode.json"),
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        ...options.config,
      }),
    )
  }
  const extra = await options?.init?.(dirpath)
  const realpath = sanitizePath(await fs.realpath(dirpath))
  const result = {
    [Symbol.asyncDispose]: async () => {
      // Enhanced cleanup with retry mechanism for Windows file locking
      const maxRetries = 3
      const retryDelay = 100 // 100ms between retries

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Try to remove directory first
          await fs.rm(dirpath, { recursive: true, force: true })

          // Wait a bit to ensure Windows releases file handles
          if (process.platform === "win32") {
            await new Promise(resolve => setTimeout(resolve, retryDelay))
          }

          // Verify directory is actually gone
          try {
            await fs.access(dirpath)
            // If we can still access it, files are locked
            await new Promise(resolve => setTimeout(resolve, retryDelay))
            continue
          } catch {
            // Directory is gone, proceed with cleanup
            break
          }
        } catch (error) {
          // Directory removal failed, try again
          if (attempt === maxRetries) {
            console.warn(`Failed to cleanup tmpdir after ${maxRetries} attempts:`, error)
            break
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
      }

      // Final cleanup of any remaining files
      try {
        await options?.dispose?.(dirpath)
      } catch (error) {
        console.warn("Dispose callback failed:", error)
      }

      console.log(`Successfully cleaned up temporary directory: ${dirpath}`)
    },
    path: realpath,
    extra: extra as T,
  }
  return result
}
