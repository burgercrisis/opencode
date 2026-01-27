import { Log } from "@/util/log"
import { Bonjour } from "bonjour-service"
import os from "os"

const log = Log.create({ service: "mdns" })

export namespace MDNS {
  let bonjour: Bonjour | undefined
  let currentPort: number | undefined

  export function publish(port: number, name?: string) {
    if (currentPort === port) return
    if (bonjour) unpublish()

    try {
      const serviceName = name ?? `opencode-${os.hostname().toLowerCase()}-${port}`
      bonjour = new Bonjour()
      const service = bonjour.publish({
        name: serviceName,
        type: "http",
        host: "opencode.local",
        port,
        txt: { path: "/" },
      })

      service.on("up", () => {
        log.info("mDNS service published", { name: serviceName, port })
      })

      service.on("error", (err) => {
        log.error("mDNS service error", { error: err })
      })

      currentPort = port
    } catch (err) {
      log.error("mDNS publish failed", { error: err })
      if (bonjour) {
        try {
          bonjour.destroy()
        } catch {}
      }
      bonjour = undefined
      currentPort = undefined
    }
  }

  export function unpublish() {
    if (bonjour) {
      try {
        bonjour.unpublishAll()
        bonjour.destroy()
      } catch (err) {
        log.error("mDNS unpublish failed", { error: err })
      }
      bonjour = undefined
      currentPort = undefined
      log.info("mDNS service unpublished")
    }
  }
}
