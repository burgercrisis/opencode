import { createVirtualizer } from "@tanstack/solid-virtual"
import { For, createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import { Button } from "./button"
import { Icon } from "./icon"
import { type FileDiff } from "@opencode-ai/sdk/v2"
import { useDiffComponent } from "../context/diff"

interface VirtualDiffProps {
  diff: FileDiff
  class?: string
  maxLines?: number
}

export function VirtualDiff(props: VirtualDiffProps) {
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement>()
  const [textareaRef, setTextareaRef] = createSignal<HTMLTextAreaElement>()
  const [isScrolling, setIsScrolling] = createSignal(false)
  const [showFullWarning, setShowFullWarning] = createSignal(false)

  const diffComponent = useDiffComponent()

  // Parse diff content into lines
  const lines = createMemo(() => {
    const content = props.diff.after || props.diff.before || ""
    const lineCount = content.split('\n').length

    // Show warning for very large files
    if (lineCount > (props.maxLines || 50000)) {
      setShowFullWarning(true)
    }

    return content.split('\n')
  })

  // Create virtualizer for lines
  const virtualizer = createMemo(() => {
    if (!containerRef()) return null

    return createVirtualizer({
      count: lines().length,
      getScrollElement: () => containerRef() || null,
      estimateSize: () => 24, // Line height in pixels
      overscan: 45, // Render 45 extra lines for smooth scrolling
      scrollMargin: 0,
    })
  })

  // Handle scroll synchronization between textarea and virtual content
  createEffect(() => {
    const textarea = textareaRef()
    const container = containerRef()
    const virt = virtualizer()

    if (!textarea || !container || !virt) return

    const handleScroll = () => {
      setIsScrolling(true)
      // Sync horizontal scroll
      container.scrollLeft = textarea.scrollLeft

      // Clear scrolling state after timeout
      setTimeout(() => setIsScrolling(false), 150)
    }

    textarea.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      textarea.removeEventListener("scroll", handleScroll)
    }
  })

  // Handle line number clicks for URL hash updates
  const handleLineClick = (lineNumber: number) => {
    window.location.hash = `L${lineNumber}`
  }

  // Scroll to specific line if hash is present
  createEffect(() => {
    const hash = window.location.hash
    const match = hash.match(/L(\d+)/)

    if (match && virtualizer()) {
      const lineNumber = parseInt(match[1], 10)
      if (lineNumber > 0 && lineNumber <= lines().length) {
        virtualizer()?.scrollToIndex(lineNumber - 1, { align: "center" })
      }
    }
  })

  // Calculate max width for consistent scrolling
  const maxWidth = createMemo(() => {
    const lines = props.diff.after || props.diff.before || ""
    const longestLine = lines.split('\n').reduce((longest, line) =>
      line.length > longest.length ? line : longest, ""
    )
    // Approximate character width
    return longestLine.length * 8.4 + 100 // Add padding for line numbers
  })

  return (
    <div class="virtual-diff-container">
      <Show when={showFullWarning()}>
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div class="flex items-center gap-2">
            <Icon name="circle-ban-sign" class="text-yellow-600" size="small" />
            <div class="text-sm">
              <span class="font-medium text-yellow-800">Large File Detected</span>
              <p class="text-yellow-700 mt-1">
                This file has {lines().length.toLocaleString()} lines. Virtual scrolling is enabled for optimal performance.
              </p>
            </div>
          </div>
        </div>
      </Show>

      <div
        ref={setContainerRef}
        class={`relative overflow-auto border border-gray-200 rounded-lg ${props.class || ""}`}
        style={{
          height: "600px",
          "pointer-events": isScrolling() ? "none" : "auto"
        }}
      >
        {/* Hidden textarea for native search functionality */}
        <textarea
          ref={setTextareaRef}
          value={props.diff.after || props.diff.before || ""}
          readonly
          class="absolute inset-0 w-full h-full resize-none bg-transparent text-transparent whitespace-pre font-mono text-sm p-0 z-10"
          style={{
            "padding-left": "4rem", // Match line numbers width
            "padding-top": "1rem",
            "padding-bottom": "1rem",
            "padding-right": "1rem",
          }}
        />

        {/* Virtualized content */}
        <div
          class="relative"
          style={{
            width: `${maxWidth()}px`,
            "min-height": `${(virtualizer() as any)?.getTotalSize() || 0}px`
          }}
        >
          <Show when={virtualizer()}>
            {(virt) => (
              <For each={(virt as any).getVirtualItems()}>
                {(item) => (
                  <div
                    class="absolute left-0 top-0 flex w-full"
                    style={{
                      transform: `translateY(${item.start}px)`,
                      height: `${item.size}px`,
                    }}
                  >
                    {/* Line number */}
                    <div
                      class="flex-shrink-0 w-16 px-2 text-right text-gray-500 text-sm font-mono border-r border-gray-200 cursor-pointer hover:bg-gray-50 z-20"
                      onClick={() => handleLineClick(item.index + 1)}
                      style={{ "pointer-events": "auto" }}
                    >
                      {item.index + 1}
                    </div>

                    {/* Code content */}
                    <div
                      class="flex-1 px-3 font-mono text-sm whitespace-pre z-0"
                      style={{ "pointer-events": "auto" }}
                    >
                      <Dynamic
                        component={diffComponent}
                        diffStyle="unified"
                        before={{
                          name: props.diff.file!,
                          contents: lines()[item.index],
                          cacheKey: `${props.diff.file}-${item.index}`,
                        }}
                        after={{
                          name: props.diff.file!,
                          contents: lines()[item.index],
                          cacheKey: `${props.diff.file}-${item.index}`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </For>
            )}
          </Show>
        </div>
      </div>

      {/* Performance indicator */}
      <div class="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>Showing {Math.min(virtualizer()?.getVirtualItems().length || 0, lines().length)} of {lines().length.toLocaleString()} lines</span>
        <Show when={isScrolling()}>
          <span class="flex items-center gap-1">
            <Icon name="circle-check" class="animate-spin" size="small" />
            Scrolling...
          </span>
        </Show>
      </div>
    </div>
  )
}
