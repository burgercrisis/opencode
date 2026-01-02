import { Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { usePlatform } from "../context/platform"

export function HomePage() {
    const platform = usePlatform()

    return (
        <div class="flex flex-col items-center justify-center min-h-screen p-8 bg-background-base">
            <div class="max-w-md w-full text-center">
                <div class="mb-8">
                    <Icon name="opencode" class="w-16 h-16 mx-auto mb-4 text-brand-base" />
                    <h1 class="text-2xl font-bold text-text-base mb-2">Welcome to OpenCode</h1>
                    <p class="text-text-weak-base">AI-powered development tool</p>
                </div>

                <div class="space-y-4">
                    <Button
                        onClick={() => {
                            // TODO: Implement project opening
                            console.log("Open project")
                        }}
                        class="w-full"
                        size="large"
                    >
                        <Icon name="folder-open" class="mr-2" />
                        Open Project
                    </Button>

                    <Button
                        onClick={() => {
                            // TODO: Implement new project creation
                            console.log("New project")
                        }}
                        variant="outline"
                        class="w-full"
                        size="large"
                    >
                        <Icon name="plus" class="mr-2" />
                        New Project
                    </Button>
                </div>

                <div class="mt-8 text-sm text-text-weak-base">
                    <Show when={platform.platform === "tauri"}>
                        <p>Desktop version with Pierre diffs integration</p>
                    </Show>
                    <Show when={platform.platform === "web"}>
                        <p>Web version</p>
                    </Show>
                </div>
            </div>
        </div>
    )
}
