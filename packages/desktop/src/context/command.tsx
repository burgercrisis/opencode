import { createMemo, createSignal, onCleanup, onMount, Show, type Accessor } from "solid-js"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { useDialog } from "@opencode-ai/ui/context/dialog"

const IS_MAC = typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform)

export type KeybindConfig = string

export interface Keybind {
    key: string
    ctrl: boolean
    meta: boolean
    shift: boolean
    alt: boolean
}

export interface CommandOption {
    id: string
    title: string
    description?: string
    category?: string
    keybind?: KeybindConfig
    slash?: string
    suggested?: boolean
    disabled?: boolean
    onSelect?: (source?: "palette" | "keybind" | "slash") => void
    onHighlight?: () => (() => void) | void
}

export function parseKeybind(config: string): Keybind[] {
    if (!config || config === "none") return []

    return config.split(",").map((combo) => {
        const parts = combo.trim().toLowerCase().split("+")
        const keybind: Keybind = {
            key: "",
            ctrl: false,
            meta: false,
            shift: false,
            alt: false,
        }

        for (const part of parts) {
            switch (part) {
                case "ctrl":
                case "control":
                    keybind.ctrl = true
                    break
                case "meta":
                case "cmd":
                case "command":
                    keybind.meta = true
                    break
                case "shift":
                    keybind.shift = true
                    break
                case "alt":
                case "option":
                    keybind.alt = true
                    break
                default:
                    keybind.key = part
                    break
            }
        }

        return keybind
    })
}

export function formatKeybind(keybind: Keybind): string {
    const parts: string[] = []

    if (keybind.ctrl) parts.push(IS_MAC ? "⌃" : "Ctrl")
    if (keybind.meta) parts.push(IS_MAC ? "⌘" : "Win")
    if (keybind.alt) parts.push(IS_MAC ? "⌥" : "Alt")
    if (keybind.shift) parts.push(IS_MAC ? "⇧" : "Shift")

    parts.push(keybind.key.toUpperCase())

    return parts.join(IS_MAC ? "" : "+")
}

export const { use: useCommand, provider: CommandProvider } = createSimpleContext({
    name: "Command",
    init: () => {
        const [search, setSearch] = createSignal("")
        const [isOpen, setIsOpen] = createSignal(false)
        const dialog = useDialog()

        const commands = createMemo(() => [] as CommandOption[])

        function open() {
            setIsOpen(true)
            setSearch("")
        }

        function close() {
            setIsOpen(false)
            setSearch("")
        }

        function register(command: CommandOption) {
            commands().push(command)
        }

        function execute(id: string, source?: "palette" | "keybind" | "slash") {
            const command = commands().find(cmd => cmd.id === id)
            if (command && !command.disabled) {
                command.onSelect?.(source)
            }
        }

        // Handle global keybinds
        function handleKeyDown(event: KeyboardEvent) {
            const keybind: Keybind = {
                key: event.key.toLowerCase(),
                ctrl: event.ctrlKey,
                meta: event.metaKey,
                shift: event.shiftKey,
                alt: event.altKey,
            }

            for (const command of commands()) {
                if (!command.keybind) continue

                const keybinds = parseKeybind(command.keybind)
                for (const kb of keybinds) {
                    if (
                        kb.key === keybind.key &&
                        kb.ctrl === keybind.ctrl &&
                        kb.meta === keybind.meta &&
                        kb.shift === keybind.shift &&
                        kb.alt === keybind.alt
                    ) {
                        event.preventDefault()
                        execute(command.id, "keybind")
                        return
                    }
                }
            }
        }

        onMount(() => {
            document.addEventListener("keydown", handleKeyDown)
        })

        onCleanup(() => {
            document.removeEventListener("keydown", handleKeyDown)
        })

        return {
            search,
            setSearch,
            isOpen,
            open,
            close,
            register,
            execute,
            commands,
        }
    },
})
