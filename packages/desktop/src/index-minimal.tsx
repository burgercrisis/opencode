// @refresh reload
import { render } from "solid-js/web"
import { App, PlatformProvider, Platform } from "@opencode-ai/app"
import { Font } from "@opencode-ai/ui/font"
import { DiffComponentProvider } from "@opencode-ai/ui/context/diff"
import { CodeComponentProvider } from "@opencode-ai/ui/context/code"
import { Diff } from "@opencode-ai/ui/diff"
import { Code } from "@opencode-ai/ui/code"
import { ThemeProvider } from "@opencode-ai/ui/theme"
import { open, save } from "@tauri-apps/plugin-dialog"
import { open as shellOpen } from "@tauri-apps/plugin-shell"
import { type as ostype } from "@tauri-apps/plugin-os"
import { AsyncStorage } from "@solid-primitives/storage"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { Store } from "@tauri-apps/plugin-store"
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"

// Create platform implementation
const platform: Platform = {
    platform: "tauri",
    openLink: shellOpen,
    restart: async () => {
        await invoke("plugin:process|relaunch")
    },
    notify: async (title, description, href) => {
        let permissionGranted = await isPermissionGranted()
        if (!permissionGranted) {
            const permission = await requestPermission()
            permissionGranted = permission === "granted"
        }
        if (permissionGranted) {
            await invoke("plugin:notification|notify", {
                title,
                body: description,
            })
        }
    },
    openDirectoryPickerDialog: open,
    openFilePickerDialog: open,
    saveFilePickerDialog: save,
    storage: (name) => new AsyncStorage(new Store(name)),
    checkUpdate: async () => {
        try {
            const result = await invoke("plugin:updater|check")
            return { updateAvailable: result, version: result?.version }
        } catch {
            return { updateAvailable: false }
        }
    },
    update: async () => {
        await invoke("plugin:updater|install")
    },
    fetch: tauriFetch,
}

// Simple root element
const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
    throw new Error(
        "Root element not found. Did you forget to add it to your index.html? Or maybe the custom element name is incorrect?"
    )
}

// Create menu
createMenu()

// Stops mousewheel events from reaching Tauri's pinch-to-zoom handler
root?.addEventListener("mousewheel", (e) => {
    e.stopPropagation()
})

// Minimal render with Pierre diffs integration
render(() => {
    return (
        <PlatformProvider value={platform}>
            <Font>
                <ThemeProvider>
                    <DiffComponentProvider component={Diff}>
                        <CodeComponentProvider component={Code}>
                            {ostype() === "macos" && (
                                <div class="bg-background-base border-b border-border-weak-base h-8" data-tauri-drag-region />
                            )}
                            <App />
                        </CodeComponentProvider>
                    </DiffComponentProvider>
                </ThemeProvider>
            </Font>
        </PlatformProvider>
    )
}, root!)

function createMenu() {
    getCurrentWindow().setDecorations(true)
}
