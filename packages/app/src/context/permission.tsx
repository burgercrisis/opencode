<<<<<<< HEAD
import { onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import type { Permission } from "@opencode-ai/sdk/v2/client"
import { persisted } from "@/utils/persist"
import { useGlobalSDK } from "@/context/global-sdk"
=======
import { createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import type { PermissionRequest } from "@opencode-ai/sdk/v2/client"
import { persisted } from "@/utils/persist"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "./global-sync"
import { useParams } from "@solidjs/router"
import { base64Decode } from "@opencode-ai/util/encode"
>>>>>>> upstream/dev

type PermissionRespondFn = (input: {
  sessionID: string
  permissionID: string
  response: "once" | "always" | "reject"
  directory?: string
}) => void

<<<<<<< HEAD
const AUTO_ACCEPT_TYPES = new Set(["edit", "write"])

function shouldAutoAccept(perm: Permission) {
  return AUTO_ACCEPT_TYPES.has(perm.type)
=======
function shouldAutoAccept(perm: PermissionRequest) {
  return perm.permission === "edit"
>>>>>>> upstream/dev
}

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
  name: "Permission",
  init: () => {
<<<<<<< HEAD
    const globalSDK = useGlobalSDK()
=======
    const params = useParams()
    const globalSDK = useGlobalSDK()
    const globalSync = useGlobalSync()

    const permissionsEnabled = createMemo(() => {
      if (!params.dir || !base64Decode(params.dir)) return false
      const [store] = globalSync.child(base64Decode(params.dir))
      return store.config.permission !== undefined
    })

>>>>>>> upstream/dev
    const [store, setStore, _, ready] = persisted(
      "permission.v3",
      createStore({
        autoAcceptEdits: {} as Record<string, boolean>,
      }),
    )

    const responded = new Set<string>()

    const respond: PermissionRespondFn = (input) => {
      globalSDK.client.permission.respond(input).catch(() => {
        responded.delete(input.permissionID)
      })
    }

<<<<<<< HEAD
    function respondOnce(permission: Permission, directory?: string) {
=======
    function respondOnce(permission: PermissionRequest, directory?: string) {
>>>>>>> upstream/dev
      if (responded.has(permission.id)) return
      responded.add(permission.id)
      respond({
        sessionID: permission.sessionID,
        permissionID: permission.id,
        response: "once",
        directory,
      })
    }

    function isAutoAccepting(sessionID: string) {
      return store.autoAcceptEdits[sessionID] ?? false
    }

    const unsubscribe = globalSDK.event.listen((e) => {
      const event = e.details
<<<<<<< HEAD
      if (event?.type !== "permission.updated") return
=======
      if (event?.type !== "permission.asked") return
>>>>>>> upstream/dev

      const perm = event.properties
      if (!isAutoAccepting(perm.sessionID)) return
      if (!shouldAutoAccept(perm)) return

      respondOnce(perm, e.name)
    })
    onCleanup(unsubscribe)

    function enable(sessionID: string, directory: string) {
      setStore("autoAcceptEdits", sessionID, true)

      globalSDK.client.permission
        .list({ directory })
        .then((x) => {
          for (const perm of x.data ?? []) {
            if (!perm?.id) continue
            if (perm.sessionID !== sessionID) continue
            if (!shouldAutoAccept(perm)) continue
            respondOnce(perm, directory)
          }
        })
        .catch(() => undefined)
    }

    function disable(sessionID: string) {
      setStore("autoAcceptEdits", sessionID, false)
    }

    return {
      ready,
      respond,
<<<<<<< HEAD
      autoResponds(permission: Permission) {
=======
      autoResponds(permission: PermissionRequest) {
>>>>>>> upstream/dev
        return isAutoAccepting(permission.sessionID) && shouldAutoAccept(permission)
      },
      isAutoAccepting,
      toggleAutoAccept(sessionID: string, directory: string) {
        if (isAutoAccepting(sessionID)) {
          disable(sessionID)
          return
        }

        enable(sessionID, directory)
      },
      enableAutoAccept(sessionID: string, directory: string) {
        if (isAutoAccepting(sessionID)) return
        enable(sessionID, directory)
      },
      disableAutoAccept(sessionID: string) {
        disable(sessionID)
      },
<<<<<<< HEAD
=======
      permissionsEnabled,
>>>>>>> upstream/dev
    }
  },
})
