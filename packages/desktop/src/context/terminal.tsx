import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { batch, createMemo } from "solid-js"

export type LocalPTY = {
    id: string
    title: string
    rows?: number
    cols?: number
    buffer?: string
    scrollY?: number
}

export const { use: useTerminal, provider: TerminalProvider } = createSimpleContext({
    name: "Terminal",
    init: () => {
        const [store] = createStore<{
            active?: string
            all: LocalPTY[]
        }>({
            all: [],
        })

        return {
            all: createMemo(() => Object.values(store.all)),
            active: createMemo(() => store.active),
            new() {
                // For desktop, we'll just log for now
                console.log("Creating new terminal")
                const id = `terminal-${Date.now()}`
                store.all.push({
                    id,
                    title: `Terminal ${store.all.length + 1}`,
                })
            },
            close(id: string) {
                batch(() => {
                    store.all = store.all.filter((pty) => pty.id !== id)
                    if (store.active === id) {
                        store.active = store.all[0]?.id
                    }
                })
            },
            setActive(id: string) {
                store.active = id
            },
            update(id: string, updates: Partial<LocalPTY>) {
                const index = store.all.findIndex((pty) => pty.id === id)
                if (index !== -1) {
                    Object.assign(store.all[index], updates)
                }
            },
        }
    },
})
