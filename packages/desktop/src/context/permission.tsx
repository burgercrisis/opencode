import { onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import type { Permission } from "@opencode-ai/sdk/v2/client"

type PermissionRespondFn = (input: {
    sessionID: string
    permissionID: string
    response: "once" | "always" | "reject"
    directory?: string
}) => void

const AUTO_ACCEPT_TYPES = new Set(["edit", "write"])

function shouldAutoAccept(perm: Permission) {
    return AUTO_ACCEPT_TYPES.has(perm.type)
}

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
    name: "Permission",
    init: () => {
        const [store] = createStore({
            autoAcceptEdits: {} as Record<string, boolean>,
        })

        const responded = new Set<string>()

        const respond: PermissionRespondFn = (input) => {
            // For desktop, we'll just log for now
            console.log("Permission response:", input)
            responded.delete(input.permissionID)
        }

        function respondOnce(permission: Permission, directory?: string) {
            if (responded.has(permission.id)) return
            responded.add(permission.id)
            respond({
                sessionID: permission.sessionID,
                permissionID: permission.id,
                response: "once",
                directory,
            })
        }

        return {
            store,
            respond,
            respondOnce,
            shouldAutoAccept,
        }
    },
})
