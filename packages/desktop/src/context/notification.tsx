import { createStore } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { Binary } from "@opencode-ai/util/binary"
import { base64Encode } from "@opencode-ai/util/encode"
import { EventSessionError } from "@opencode-ai/sdk/v2"

type NotificationBase = {
    directory?: string
    session?: string
    metadata?: any
    time: number
    viewed: boolean
}

type TurnCompleteNotification = NotificationBase & {
    type: "turn-complete"
}

type ErrorNotification = NotificationBase & {
    type: "error"
    error: EventSessionError["properties"]["error"]
}

export type Notification = TurnCompleteNotification | ErrorNotification

export const { use: useNotification, provider: NotificationProvider } = createSimpleContext({
    name: "Notification",
    init: () => {
        const [store] = createStore({
            notifications: [] as Notification[],
        })

        async function sendNotification(notification: Notification) {
            // Add to store
            store.notifications.push(notification)

            // For desktop, we'll just log for now
            console.log("Notification:", notification)
        }

        return {
            notifications: store.notifications,
            sendNotification,
            markAsViewed(notificationId: string) {
                const index = store.notifications.findIndex(n => n.time === Number(notificationId))
                if (index !== -1) {
                    store.notifications[index].viewed = true
                }
            },
            clear() {
                store.notifications.length = 0
            },
        }
    },
})
