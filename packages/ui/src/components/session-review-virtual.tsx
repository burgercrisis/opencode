import { Accordion } from "./accordion"
import { Button } from "./button"
import { DiffChanges } from "./diff-changes"
import { FileIcon } from "./file-icon"
import { Icon } from "./icon"
import { StickyAccordionHeader } from "./sticky-accordion-header"
import { useDiffComponent } from "../context/diff"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { For, Match, Show, Switch, type JSX, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { type FileDiff } from "@opencode-ai/sdk/v2"
import { PreloadMultiFileDiffResult } from "@pierre/diffs/ssr"
import { Dynamic } from "solid-js/web"
import { checksum } from "@opencode-ai/util/encode"
import { VirtualDiff } from "./virtual-diff"

// Threshold for using virtualization (lines)
const VIRTUALIZATION_THRESHOLD = 1000

// Estimate line count from diff content
const estimateLineCount = (diff: FileDiff): number => {
  const content = diff.after || diff.before || ""
  return content.split('\n').length
}

export interface SessionReviewProps {
  split?: boolean
  class?: string
  classList?: Record<string, boolean | undefined>
  classes?: { root?: string; header?: string; container?: string }
  actions?: JSX.Element
  diffs: (FileDiff & { preloaded?: PreloadMultiFileDiffResult<any> })[]
  onRevertFile?: (filePath: string) => Promise<void>
  sessionID?: string
}

export const SessionReview = (props: SessionReviewProps) => {
  const diffComponent = useDiffComponent()
  const [store, setStore] = createStore({
    open: props.diffs.length > 10 ? [] : props.diffs.map((d) => d.file),
  })

  // Memoize which files need virtualization
  const virtualizedFiles = createMemo(() => {
    const result = new Map<string, boolean>()
    for (const diff of props.diffs) {
      result.set(diff.file, estimateLineCount(diff) > VIRTUALIZATION_THRESHOLD)
    }
    return result
  })

  // Performance metrics
  const performanceMetrics = createMemo(() => {
    const totalLines = props.diffs.reduce((sum, diff) => sum + estimateLineCount(diff), 0)
    const virtualizedCount = Array.from(virtualizedFiles().values()).filter(Boolean).length

    return {
      totalLines,
      virtualizedCount,
      regularCount: props.diffs.length - virtualizedCount,
      estimatedMemoryUsage: totalLines * 100, // Rough estimate in bytes
    }
  })

  const handleChange = (open: string[]) => {
    setStore("open", open)
  }

  const handleExpandOrCollapseAll = () => {
    if (store.open.length > 0) {
      setStore("open", [])
    } else {
      setStore(
        "open",
        props.diffs.map((d) => d.file),
      )
    }
  }

  const handleRevertFile = async (filePath: string) => {
    if (!props.onRevertFile) return

    const confirmed = confirm(`Are you sure you want to revert changes to ${filePath}? This will restore the file to its previous state.`)
    if (!confirmed) return

    try {
      await props.onRevertFile(filePath)
    } catch (error) {
      alert(`Failed to revert ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Render individual diff line with appropriate component
  const renderDiffContent = (diff: FileDiff & { preloaded?: PreloadMultiFileDiffResult<any> }) => {
    const needsVirtualization = virtualizedFiles().get(diff.file)

    if (needsVirtualization) {
      return (
        <VirtualDiff
          diff={diff}
          maxLines={50000} // Safety limit
        />
      )
    }

    // Use original Pierre Diffs for smaller files
    return (
      <Dynamic
        component={diffComponent}
        preloadedDiff={diff.preloaded}
        diffStyle={props.split ? "split" : "unified"}
        before={{
          name: diff.file!,
          contents: diff.before!,
          cacheKey: checksum(diff.before),
        }}
        after={{
          name: diff.file!,
          contents: diff.after!,
          cacheKey: checksum(diff.after),
        }}
      />
    )
  }

  return (
    <div
      data-component="session-review"
      classList={{
        ...(props.classList ?? {}),
        [props.classes?.root ?? ""]: !!props.classes?.root,
        [props.class ?? ""]: !!props.class,
      }}
    >
      <div
        data-slot="session-review-header"
        classList={{
          [props.classes?.header ?? ""]: !!props.classes?.header,
        }}
      >
        <div data-slot="session-review-title">Session changes</div>
        <div data-slot="session-review-actions">
          <Button size="normal" icon="chevron-grabber-vertical" onClick={handleExpandOrCollapseAll}>
            <Switch>
              <Match when={store.open.length > 0}>Collapse all</Match>
              <Match when={true}>Expand all</Match>
            </Switch>
          </Button>
          {props.actions}
        </div>
      </div>

      {/* Performance metrics for debugging */}
      <Show when={performanceMetrics().virtualizedCount > 0}>
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div class="flex items-center gap-2 text-sm">
            <Icon name="circle-check" class="text-blue-600" size="small" />
            <div class="text-blue-800">
              <span class="font-medium">Performance Mode Active</span>
              <div class="text-blue-700 mt-1">
                {performanceMetrics().virtualizedCount} large files using virtual scrolling •
                {performanceMetrics().totalLines.toLocaleString()} total lines •
                ~{(performanceMetrics().estimatedMemoryUsage / 1024 / 1024).toFixed(1)}MB estimated memory usage
              </div>
            </div>
          </div>
        </div>
      </Show>

      <div
        data-slot="session-review-container"
        classList={{
          [props.classes?.container ?? ""]: !!props.classes?.container,
        }}
      >
        <Accordion multiple value={store.open} onChange={handleChange}>
          <For each={props.diffs}>
            {(diff) => (
              <Accordion.Item value={diff.file} data-slot="session-review-accordion-item">
                <StickyAccordionHeader>
                  <Accordion.Trigger>
                    <div data-slot="session-review-trigger-content">
                      <div data-slot="session-review-file-info">
                        <FileIcon node={{ path: diff.file, type: "file" }} />
                        <div data-slot="session-review-file-name-container">
                          <Show when={diff.file.includes("/")}>
                            <span data-slot="session-review-directory">{getDirectory(diff.file)}&lrm;</span>
                          </Show>
                          <span data-slot="session-review-filename">{getFilename(diff.file)}</span>
                        </div>
                      </div>
                      <div data-slot="session-review-trigger-actions">
                        <Show when={props.onRevertFile}>
                          <Button
                            size="small"
                            variant="ghost"
                            icon="arrow-left"
                            onClick={() => handleRevertFile(diff.file)}
                            title="Revert this file"
                          />
                        </Show>
                        <DiffChanges changes={diff} />
                        <Show when={virtualizedFiles().get(diff.file)}>
                          <div class="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            <Icon name="check" size="small" />
                            Virtual
                          </div>
                        </Show>
                        <Icon name="chevron-grabber-vertical" size="small" />
                      </div>
                    </div>
                  </Accordion.Trigger>
                </StickyAccordionHeader>
                <Accordion.Content data-slot="session-review-accordion-content">
                  {renderDiffContent(diff)}
                </Accordion.Content>
              </Accordion.Item>
            )}
          </For>
        </Accordion>
      </div>
    </div>
  )
}
