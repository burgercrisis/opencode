// This is a patch for the listen function in server.ts
// Replace lines 2832-2851 with this code:

/*
  import { killProcessOnPort } from "./port-helper"

  export function listen(opts: { port: number; hostname: string; mdns?: boolean; cors?: string[] }) {
    _corsWhitelist = opts.cors ?? []

    const args = {
      hostname: opts.hostname,
      idleTimeout: 0,
      fetch: App().fetch,
      websocket: websocket,
    } as const
    const tryServe = (port: number) => {
      try {
        return Bun.serve({ ...args, port })
      } catch {
        return undefined
      }
    }

    const tryServeWithCleanup = async (port: number): Promise<Bun.Server | undefined> => {
      // Try normal serve first
      const server = tryServe(port)
      if (server) return server
      
      // If port is occupied and we're trying 4096, try to clean up
      if (port === 4096) {
        log.info("port-occupied", { port: 4096, message: "Attempting to kill stale process on port 4096" })
        const cleaned = await killProcessOnPort(4096)
        if (cleaned) {
          // Give the OS a moment to release the port
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Try serving again after cleanup
          const cleanedServer = tryServe(4096)
          if (cleanedServer) {
            log.info("port-cleaned", { port: 4096, message: "Successfully killed stale process and claimed port" })
            return cleanedServer
          }
        }
      }
      
      return undefined
    }

    const server = opts.port === 0 ? (tryServeWithCleanup(4096) ?? tryServe(0)) : tryServeWithCleanup(opts.port)
    if (!server) {
      // Last resort: try random port
      const fallback = tryServe(0)
      if (!fallback) throw new Error(`Failed to start server on port ${opts.port} and fallback ports`)
      log.warn("server-fallback-port", { port: fallback.port, message: "Server started on random port due to port conflict" })
      _url = fallback.url
      return fallback
    }

    _url = server.url
*/
