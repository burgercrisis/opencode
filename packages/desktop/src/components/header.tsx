import { Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Button } from "@opencode-ai/ui/button"
import { usePlatform } from "../context/platform"

export function Header() {
    const platform = usePlatform()

    return (
        <div class="flex items-center justify-between px-4 py-2 bg-surface-base border-b border-border-weak-base">
            <div class="flex items-center space-x-4">
                <div class="flex items-center space-x-2">
                    <Icon name="opencode" class="w-6 h-6" />
                    <span class="font-semibold">OpenCode</span>
                </div>
            </div>

            <div class="flex items-center space-x-2">
                <Show when={platform.platform === "tauri"}>
                    <IconButton
                        onClick={() => {
                            // TODO: Implement minimize
                            console.log("Minimize")
                        }}
                        variant="ghost"
                        size="small"
                    >
                        <Icon name="minus" />
                    </IconButton>

                    <IconButton
                        onClick={() => {
                            // TODO: Implement maximize/restore
                            console.log("Maximize")
                        }}
                        variant="ghost"
                        size="small"
                    >
                        <Icon name="square" />
                    </IconButton>

                    <IconButton
                        onClick={() => {
                            // TODO: Implement close
                            console.log("Close")
                        }}
                        variant="ghost"
                        size="small"
                    >
                        <Icon name="close" />
                    </IconButton>
                </Show>
            </div>
        </div>
    )
}
