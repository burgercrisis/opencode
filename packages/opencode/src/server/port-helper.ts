import { Log } from "../util/log"

const log = Log.create({ service: "port-helper" })

/**
 * Kill any process that is listening on the specified port
 * This helps clean up stale processes that didn't shut down properly
 */
export async function killProcessOnPort(port: number): Promise<boolean> {
  if (process.platform !== "win32") {
    // On Unix-like systems, we could use lsof or fuser
    // For now, just return false on non-Windows
    return false
  }

  try {
    const { $ } = await import("bun")

    // Use PowerShell to find and kill the process using the port
    const result =
      await $`powershell -Command "$listener = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue; if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 300; Write-Output 'killed' } else { Write-Output 'not-found' }"`.text()

    if (result.includes("killed")) {
      log.info("port-cleaned", { port, message: `Successfully killed process on port ${port}` })
      return true
    }
    return false
  } catch (e) {
    log.warn("port-cleanup-failed", { port, error: String(e) })
    return false
  }
}
