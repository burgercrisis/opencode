import { ParentProps, Show, For } from "solid-js"
import { useLayout } from "../context/layout"
import { useGlobalSync } from "../context/global-sync"
import { Avatar } from "@opencode-ai/ui/avatar"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { DiffChanges } from "@opencode-ai/ui/diff-changes"
import { getFilename } from "@opencode-ai/util/path"
import { usePlatform } from "../context/platform"
import { Header } from "../components/header"

export function Layout(props: ParentProps) {
    const layout = useLayout()
    const globalSync = useGlobalSync()
    const platform = usePlatform()

    return (
        <div class="flex flex-col h-full bg-background-base">
            <Header />

            <div class="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <Collapsible open={layout.sidebar.opened()}>
                    <div class="w-80 bg-surface-base border-r border-border-weak-base flex flex-col">
                        <div class="p-4 border-b border-border-weak-base">
                            <div class="flex items-center justify-between">
                                <h2 class="text-lg font-semibold">Projects</h2>
                                <IconButton
                                    onClick={() => layout.sidebar.toggle()}
                                    variant="ghost"
                                    size="sm"
                                >
                                    <Icon name="sidebar" />
                                </IconButton>
                            </div>
                        </div>

                        <div class="flex-1 overflow-auto p-4">
                            <Show when={layout.projects.list().length === 0}>
                                <div class="text-center text-text-weak-base py-8">
                                    <Icon name="folder" class="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No projects open</p>
                                    <Button
                                        onClick={() => {
                                            // TODO: Implement project opening
                                            console.log("Open project")
                                        }}
                                        class="mt-4"
                                        size="sm"
                                    >
                                        Open Project
                                    </Button>
                                </div>
                            </Show>

                            <div class="space-y-2">
                                <For each={layout.projects.list()}>
                                    {(project) => (
                                        <div class="p-3 bg-surface-raised-base rounded-lg border border-border-weak-base">
                                            <div class="flex items-center space-x-3">
                                                <Avatar
                                                    size="sm"
                                                    src={project.icon?.url}
                                                    fallback={getFilename(project.worktree)}
                                                    color={project.icon?.color}
                                                />
                                                <div class="flex-1 min-w-0">
                                                    <p class="font-medium truncate">{getFilename(project.worktree)}</p>
                                                    <p class="text-sm text-text-weak-base truncate">{project.worktree}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </div>
                    </div>
                </Collapsible>

                {/* Main Content */}
                <div class="flex-1 flex flex-col">
                    {props.children}
                </div>

                {/* Review Panel */}
                <Collapsible open={layout.review.opened()}>
                    <div class="w-96 bg-surface-base border-l border-border-weak-base">
                        <div class="p-4 border-b border-border-weak-base">
                            <div class="flex items-center justify-between">
                                <h2 class="text-lg font-semibold">Review</h2>
                                <IconButton
                                    onClick={() => layout.review.toggle()}
                                    variant="ghost"
                                    size="sm"
                                >
                                    <Icon name="sidebar" />
                                </IconButton>
                            </div>
                        </div>

                        <div class="flex-1 overflow-auto p-4">
                            <div class="text-center text-text-weak-base py-8">
                                <Icon name="diff" class="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>No changes to review</p>
                            </div>
                        </div>
                    </div>
                </Collapsible>
            </div>

            {/* Terminal */}
            <Collapsible open={layout.terminal.opened()}>
                <div class="bg-surface-base border-t border-border-weak-base" style={`height: ${layout.terminal.height()}px`}>
                    <div class="flex items-center justify-between p-2 border-b border-border-weak-base">
                        <h3 class="text-sm font-medium">Terminal</h3>
                        <div class="flex items-center space-x-2">
                            <IconButton
                                onClick={() => layout.terminal.toggle()}
                                variant="ghost"
                                size="sm"
                            >
                                <Icon name="close" />
                            </IconButton>
                        </div>
                    </div>
                    <div class="p-4 font-mono text-sm">
                        <div class="text-text-weak-base">Terminal ready</div>
                    </div>
                </div>
            </Collapsible>
        </div>
    )
}
