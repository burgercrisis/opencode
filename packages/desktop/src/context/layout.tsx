import { createStore, produce } from "solid-js/store"
import { batch, createMemo } from "solid-js"
import { createSimpleContext } from "@opencode-ai/ui/context"

const AVATAR_COLOR_KEYS = ["pink", "mint", "orange", "purple", "cyan", "lime"] as const
export type AvatarColorKey = (typeof AVATAR_COLOR_KEYS)[number]

export function getAvatarColors(key?: string) {
    if (key && AVATAR_COLOR_KEYS.includes(key as AvatarColorKey)) {
        return {
            background: `var(--avatar-background-${key})`,
            foreground: `var(--avatar-text-${key})`,
        }
    }
    return {
        background: "var(--surface-info-base)",
        foreground: "var(--text-base)",
    }
}

type SessionTabs = {
    active?: string
    all: string[]
}

export type LocalProject = { worktree: string; expanded: boolean }

export const { use: useLayout, provider: LayoutProvider } = createSimpleContext({
    name: "Layout",
    init: () => {
        const [store] = createStore({
            sidebar: {
                opened: false,
                width: 280,
            },
            terminal: {
                opened: false,
                height: 280,
            },
            review: {
                opened: true,
            },
            session: {
                width: 600,
            },
            sessionTabs: {} as Record<string, SessionTabs>,
        })

        const usedColors = new Set<AvatarColorKey>()

        function pickAvailableColor(): AvatarColorKey {
            const available = AVATAR_COLOR_KEYS.filter((c) => !usedColors.has(c))
            if (available.length === 0) return AVATAR_COLOR_KEYS[Math.floor(Math.random() * AVATAR_COLOR_KEYS.length)]
            return available[Math.floor(Math.random() * available.length)]
        }

        return {
            projects: {
                list: createMemo(() => []),
                open(directory: string) {
                    console.log("Opening project:", directory)
                },
                close(directory: string) {
                    console.log("Closing project:", directory)
                },
                expand(directory: string) {
                    console.log("Expanding project:", directory)
                },
                collapse(directory: string) {
                    console.log("Collapsing project:", directory)
                },
                move(directory: string, toIndex: number) {
                    console.log("Moving project:", directory, "to index:", toIndex)
                },
            },
            sidebar: {
                opened: createMemo(() => store.sidebar.opened),
                open() {
                    store.sidebar.opened = true
                },
                close() {
                    store.sidebar.opened = false
                },
                toggle() {
                    store.sidebar.opened = !store.sidebar.opened
                },
                width: createMemo(() => store.sidebar.width),
                resize(width: number) {
                    store.sidebar.width = width
                },
                set(settings: { opened: boolean; width: number }) {
                    store.sidebar.opened = settings.opened
                    store.sidebar.width = settings.width
                },
            },
            terminal: {
                opened: createMemo(() => store.terminal.opened),
                open() {
                    store.terminal.opened = true
                },
                close() {
                    store.terminal.opened = false
                },
                toggle() {
                    store.terminal.opened = !store.terminal.opened
                },
                height: createMemo(() => store.terminal.height),
                resize(height: number) {
                    store.terminal.height = height
                },
                set(settings: { opened: boolean; height: number }) {
                    store.terminal.opened = settings.opened
                    store.terminal.height = settings.height
                },
            },
            review: {
                opened: createMemo(() => store.review?.opened ?? true),
                open() {
                    store.review.opened = true
                },
                close() {
                    store.review.opened = false
                },
                toggle() {
                    store.review.opened = !store.review.opened
                },
                set(settings: { opened: boolean }) {
                    store.review.opened = settings.opened
                },
            },
            session: {
                width: createMemo(() => store.session?.width ?? 600),
                resize(width: number) {
                    store.session.width = width
                },
                set(settings: { width: number }) {
                    store.session.width = settings.width
                },
            },
            tabs(sessionKey: string) {
                const tabs = createMemo(() => store.sessionTabs[sessionKey] ?? { all: [] })
                return {
                    tabs,
                    active: createMemo(() => tabs().active),
                    all: createMemo(() => tabs().all),
                    setActive(tab: string | undefined) {
                        if (!store.sessionTabs[sessionKey]) {
                            store.sessionTabs[sessionKey] = { all: [], active: tab }
                        } else {
                            store.sessionTabs[sessionKey].active = tab
                        }
                    },
                    setAll(all: string[]) {
                        if (!store.sessionTabs[sessionKey]) {
                            store.sessionTabs[sessionKey] = { all, active: undefined }
                        } else {
                            store.sessionTabs[sessionKey].all = all
                        }
                    },
                    async open(tab: string) {
                        const current = store.sessionTabs[sessionKey] ?? { all: [] }
                        if (!store.sessionTabs[sessionKey]) {
                            store.sessionTabs[sessionKey] = { all: [tab], active: tab }
                        } else {
                            if (!current.all.includes(tab)) {
                                store.sessionTabs[sessionKey].all = [...current.all, tab]
                            }
                            store.sessionTabs[sessionKey].active = tab
                        }
                    },
                    close(tab: string) {
                        const current = store.sessionTabs[sessionKey]
                        if (!current) return
                        batch(() => {
                            store.sessionTabs[sessionKey].all = current.all.filter((x) => x !== tab)
                            if (current.active === tab) {
                                const index = current.all.findIndex((f) => f === tab)
                                const previous = current.all[Math.max(0, index - 1)]
                                store.sessionTabs[sessionKey].active = previous
                            }
                        })
                    },
                    move(tab: string, to: number) {
                        const current = store.sessionTabs[sessionKey]
                        if (!current) return
                        const index = current.all.findIndex((f) => f === tab)
                        if (index === -1) return
                        store.sessionTabs[sessionKey].all = produce(current.all, (opened: string[]) => {
                            opened.splice(to, 0, opened.splice(index, 1)[0])
                            return opened
                        })
                    },
                }
            },
        }
    },
})
