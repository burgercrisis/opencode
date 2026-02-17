import { marked } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import { bundledLanguages, type BundledLanguage } from "shiki"
import { createSimpleContext } from "./helper"
import { getSharedHighlighter, registerCustomTheme, ThemeRegistrationResolved } from "@pierre/diffs"
import MarkedWorkerUrl from "./marked-worker?worker&url"
import { WorkerMessage, WorkerResponse, WorkerState, WorkerMetrics, MarkdownConfig, validateWorkerResponse } from "./marked-types"

registerCustomTheme("OpenCode", () => {
  return Promise.resolve({
    name: "OpenCode",
    colors: {
      "editor.background": "var(--color-background-stronger)",
      "editor.foreground": "var(--text-base)",
      "gitDecoration.addedResourceForeground": "var(--syntax-diff-add)",
      "gitDecoration.deletedResourceForeground": "var(--syntax-diff-delete)",
      // "gitDecoration.conflictingResourceForeground": "#ffca00",
      // "gitDecoration.modifiedResourceForeground": "#1a76d4",
      // "gitDecoration.untrackedResourceForeground": "#00cab1",
      // "gitDecoration.ignoredResourceForeground": "#84848A",
      // "terminal.titleForeground": "#adadb1",
      // "terminal.titleInactiveForeground": "#84848A",
      // "terminal.background": "#141415",
      // "terminal.foreground": "#adadb1",
      // "terminal.ansiBlack": "#141415",
      // "terminal.ansiRed": "#ff2e3f",
      // "terminal.ansiGreen": "#0dbe4e",
      // "terminal.ansiYellow": "#ffca00",
      // "terminal.ansiBlue": "#008cff",
      // "terminal.ansiMagenta": "#c635e4",
      // "terminal.ansiCyan": "#08c0ef",
      // "terminal.ansiWhite": "#c6c6c8",
      // "terminal.ansiBrightBlack": "#141415",
      // "terminal.ansiBrightRed": "#ff2e3f",
      // "terminal.ansiBrightGreen": "#0dbe4e",
      // "terminal.ansiBrightYellow": "#ffca00",
      // "terminal.ansiBrightBlue": "#008cff",
      // "terminal.ansiBrightMagenta": "#c635e4",
      // "terminal.ansiBrightCyan": "#08c0ef",
      // "terminal.ansiBrightWhite": "#c6c6c8",
    },
    tokenColors: [
      {
        scope: ["comment", "punctuation.definition.comment", "string.comment"],
        settings: {
          foreground: "var(--syntax-comment)",
        },
      },
      {
        scope: ["entity.other.attribute-name"],
        settings: {
          foreground: "var(--syntax-property)", // maybe attribute
        },
      },
      {
        scope: ["constant", "entity.name.constant", "variable.other.constant", "variable.language", "entity"],
        settings: {
          foreground: "var(--syntax-constant)",
        },
      },
      {
        scope: ["entity.name", "meta.export.default", "meta.definition.variable"],
        settings: {
          foreground: "var(--syntax-type)",
        },
      },
      {
        scope: ["meta.object.member"],
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: [
          "variable.parameter.function",
          "meta.jsx.children",
          "meta.block",
          "meta.tag.attributes",
          "entity.name.constant",
          "meta.embedded.expression",
          "meta.template.expression",
          "string.other.begin.yaml",
          "string.other.end.yaml",
        ],
        settings: {
          foreground: "var(--syntax-punctuation)",
        },
      },
      {
        scope: ["entity.name.function", "support.type.primitive"],
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: ["support.class.component"],
        settings: {
          foreground: "var(--syntax-type)",
        },
      },
      {
        scope: "keyword",
        settings: {
          foreground: "var(--syntax-keyword)",
        },
      },
      {
        scope: [
          "keyword.operator",
          "storage.type.function.arrow",
          "punctuation.separator.key-value.css",
          "entity.name.tag.yaml",
          "punctuation.separator.key-value.mapping.yaml",
        ],
        settings: {
          foreground: "var(--syntax-operator)",
        },
      },
      {
        scope: ["storage", "storage.type"],
        settings: {
          foreground: "var(--syntax-keyword)",
        },
      },
      {
        scope: ["storage.modifier.package", "storage.modifier.import", "storage.type.java"],
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: [
          "string",
          "punctuation.definition.string",
          "string punctuation.section.embedded source",
          "entity.name.tag",
        ],
        settings: {
          foreground: "var(--syntax-string)",
        },
      },
      {
        scope: "support",
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: ["support.type.object.module", "variable.other.object", "support.type.property-name.css"],
        settings: {
          foreground: "var(--syntax-object)",
        },
      },
      {
        scope: "meta.property-name",
        settings: {
          foreground: "var(--syntax-property)",
        },
      },
      {
        scope: "variable",
        settings: {
          foreground: "var(--syntax-variable)",
        },
      },
      {
        scope: "variable.other",
        settings: {
          foreground: "var(--syntax-variable)",
        },
      },
      {
        scope: [
          "invalid.broken",
          "invalid.illegal",
          "invalid.unimplemented",
          "invalid.deprecated",
          "message.error",
          "markup.deleted",
          "meta.diff.header.from-file",
          "punctuation.definition.deleted",
          "brackethighlighter.unmatched",
          "token.error-token",
        ],
        settings: {
          foreground: "var(--syntax-critical)",
        },
      },
      {
        scope: "carriage-return",
        settings: {
          foreground: "var(--syntax-keyword)",
        },
      },
      {
        scope: "string source",
        settings: {
          foreground: "var(--syntax-variable)",
        },
      },
      {
        scope: "string variable",
        settings: {
          foreground: "var(--syntax-constant)",
        },
      },
      {
        scope: [
          "source.regexp",
          "string.regexp",
          "string.regexp.character-class",
          "string.regexp constant.character.escape",
          "string.regexp source.ruby.embedded",
          "string.regexp string.regexp.arbitrary-repitition",
          "string.regexp constant.character.escape",
        ],
        settings: {
          foreground: "var(--syntax-regexp)",
        },
      },
      {
        scope: "support.constant",
        settings: {
          foreground: "var(--syntax-primitive)",
        },
      },
      {
        scope: "support.variable",
        settings: {
          foreground: "var(--syntax-variable)",
        },
      },
      {
        scope: "meta.module-reference",
        settings: {
          foreground: "var(--syntax-info)",
        },
      },
      {
        scope: "punctuation.definition.list.begin.markdown",
        settings: {
          foreground: "var(--syntax-punctuation)",
        },
      },
      {
        scope: ["markup.heading", "markup.heading entity.name"],
        settings: {
          fontStyle: "bold",
          foreground: "var(--syntax-info)",
        },
      },
      {
        scope: "markup.quote",
        settings: {
          foreground: "var(--syntax-info)",
        },
      },
      {
        scope: "markup.italic",
        settings: {
          fontStyle: "italic",
          // foreground: "",
        },
      },
      {
        scope: "markup.bold",
        settings: {
          fontStyle: "bold",
          foreground: "var(--text-strong)",
        },
      },
      {
        scope: [
          "markup.raw",
          "markup.inserted",
          "meta.diff.header.to-file",
          "punctuation.definition.inserted",
          "markup.changed",
          "punctuation.definition.changed",
          "markup.ignored",
          "markup.untracked",
        ],
        settings: {
          foreground: "var(--text-base)",
        },
      },
      {
        scope: "meta.diff.range",
        settings: {
          fontStyle: "bold",
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: "meta.diff.header",
        settings: {
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: "meta.separator",
        settings: {
          fontStyle: "bold",
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: "meta.output",
        settings: {
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: "meta.export.default",
        settings: {
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: [
          "brackethighlighter.tag",
          "brackethighlighter.curly",
          "brackethighlighter.round",
          "brackethighlighter.square",
          "brackethighlighter.angle",
          "brackethighlighter.quote",
        ],
        settings: {
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: ["constant.other.reference.link", "string.other.link"],
        settings: {
          fontStyle: "underline",
          foreground: "var(--syntax-unknown)",
        },
      },
      {
        scope: "token.info-token",
        settings: {
          foreground: "var(--syntax-info)",
        },
      },
      {
        scope: "token.warn-token",
        settings: {
          foreground: "var(--syntax-warning)",
        },
      },
      {
        scope: "token.debug-token",
        settings: {
          foreground: "var(--syntax-info)",
        },
      },
    ],
    semanticTokenColors: {
      comment: "var(--syntax-comment)",
      string: "var(--syntax-string)",
      number: "var(--syntax-constant)",
      regexp: "var(--syntax-regexp)",
      keyword: "var(--syntax-keyword)",
      variable: "var(--syntax-variable)",
      parameter: "var(--syntax-variable)",
      property: "var(--syntax-property)",
      function: "var(--syntax-primitive)",
      method: "var(--syntax-primitive)",
      type: "var(--syntax-type)",
      class: "var(--syntax-type)",
      namespace: "var(--syntax-type)",
      enumMember: "var(--syntax-primitive)",
      "variable.constant": "var(--syntax-constant)",
      "variable.defaultLibrary": "var(--syntax-unknown)",
    },
  } as unknown as ThemeRegistrationResolved)
})

export type NativeMarkdownParser = (markdown: string) => Promise<string>

export interface MarkedContextValue {
  parse(markdown: string): Promise<string>
  fastParse?(markdown: string): Promise<string>
  enhance?(html: string): Promise<string>
}


/**
 * Manages Web Worker lifecycle for markdown processing with proper state management,
 * error handling, and performance monitoring.
 * 
 * State Machine:
 * - INITIALIZING: Worker is being created and initialized
 * - READY: Worker is ready to process requests
 * - ERROR: Worker encountered an error and needs reset
 * - TERMINATED: Worker has been terminated and cannot be used
 */
class WorkerManager {
  private config: MarkdownConfig = {
    maxHtmlSize: 1000000, // 1MB default
    workerTimeout: 10000, // 10 seconds default
    enableMetrics: true
  }

  private metrics: WorkerMetrics = {
    totalOperations: 0,
    averageEnhancementTime: 0,
    errorCount: 0
  }

  private worker: Worker | undefined
  private pending = new Map<number, { resolve: (value: any) => void; reject: (err: any) => void }>()
  private nextId = 0
  private state: WorkerState = WorkerState.INITIALIZING
  private initializationPromise: Promise<void> | null = null

  /**
   * Get current worker metrics
   */
  getMetrics(): WorkerMetrics {
    return { ...this.metrics }
  }

  /**
   * Update worker configuration
   */
  updateConfig(newConfig: Partial<MarkdownConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  getState(): WorkerState {
    return this.state
  }

  /**
   * Reset worker to ERROR state and clean up resources
   */
  reset(): void {
    if (this.worker) {
      this.worker.terminate()
    }
    this.worker = undefined
    this.state = WorkerState.INITIALIZING
    this.initializationPromise = null

    // Clear all pending requests immediately to avoid memory leaks
    this.pending.forEach((promise, id) => {
      try {
        promise.reject(new Error('Worker reset'))
      } catch (e) {
        console.warn(`Failed to reject pending promise ${id}:`, e)
      }
    })
    this.pending.clear()
  }

  /**
   * Initialize worker with proper timeout and state management
   */
  async initialize(): Promise<void> {
    if (this.state === WorkerState.READY) {
      return Promise.resolve()
    }

    if (this.state === WorkerState.INITIALIZING && this.initializationPromise) {
      return this.initializationPromise
    }

    if (this.state === WorkerState.ERROR) {
      this.reset()
    }

    // Set promise immediately to prevent race conditions
    this.initializationPromise = new Promise((resolve, reject) => {
      this.state = WorkerState.INITIALIZING

      const initId = this.nextId++
      const startTime = performance.now()

      const timeout = setTimeout(() => {
        const promise = this.pending.get(initId)
        if (promise) {
          this.pending.delete(initId)
          this.state = WorkerState.ERROR
          this.initializationPromise = null
          this.metrics.errorCount++
          reject(new Error('Worker initialization timeout'))
        }
      }, this.config.workerTimeout)

      this.pending.set(initId, {
        resolve: () => {
          clearTimeout(timeout)
          this.pending.delete(initId)
          this.state = WorkerState.READY
          this.initializationPromise = null

          // Record initialization metrics
          if (this.config.enableMetrics) {
            this.metrics.initializationTime = performance.now() - startTime
          }

          resolve()
        },
        reject: (err) => {
          clearTimeout(timeout)
          this.pending.delete(initId)
          this.state = WorkerState.ERROR
          this.initializationPromise = null
          reject(err)
        }
      })

      const w = this.getWorker()
      if (w) {
        w.postMessage({ type: "init", id: initId, theme: null })
      } else {
        clearTimeout(timeout)
        this.pending.delete(initId)
        this.state = WorkerState.ERROR
        this.initializationPromise = null
        reject(new Error('Failed to create worker'))
      }
    })

    return this.initializationPromise
  }

  private getWorker(): Worker | undefined {
    if (typeof window === "undefined") return undefined
    if (!this.worker) {
      this.worker = new Worker(MarkedWorkerUrl, { type: "module" })
      this.worker.onmessage = (e) => {
        if (!validateWorkerResponse(e.data)) {
          console.error('Invalid worker response received:', e.data)
          return
        }

        const { id, type, html, error } = e.data
        const promise = this.pending.get(id)
        if (!promise) return
        this.pending.delete(id)

        if (type === "enhanced") {
          promise.resolve(html || "")
        } else if (type === "theme-initialized") {
          // Don't set state here - let initializeWorker handle state changes
          promise.resolve(html || "")
        } else if (type === "error") {
          const errorMessage = typeof error === 'string' ? error :
            (error && typeof error === 'object' && 'message' in error) ? String(error.message) :
              'Unknown worker error'
          promise.reject(new Error(errorMessage))
        }
      }

      this.worker.onerror = (error) => {
        console.error('Worker error:', error)
        this.state = WorkerState.ERROR
        // Reject all pending promises on worker error
        this.pending.forEach((promise, id) => {
          promise.reject(new Error('Worker encountered an error'))
          this.pending.delete(id)
        })
      }
    }
    return this.worker
  }

  /**
   * Send message to worker with timeout and metrics collection
   */
  async sendMessageWithTimeout<T>(message: Omit<WorkerMessage, 'id'>, timeoutMs?: number): Promise<T> {
    const id = this.nextId++
    const messageType = message.type
    const startTime = performance.now()
    const actualTimeout = timeoutMs || this.config.workerTimeout

    const cleanup = () => {
      if (this.pending.has(id)) {
        this.pending.delete(id)
      }
    }

    return Promise.race([
      new Promise<T>((resolve, reject) => {
        this.pending.set(id, {
          resolve: (value) => {
            cleanup()

            // Record metrics for enhancement operations
            if (this.config.enableMetrics && messageType === 'enhance') {
              const duration = performance.now() - startTime
              this.metrics.totalOperations++
              this.metrics.averageEnhancementTime = this.metrics.totalOperations === 1 ?
                duration :
                (this.metrics.averageEnhancementTime * (this.metrics.totalOperations - 1) + duration) / this.metrics.totalOperations
            }

            resolve(value)
          },
          reject: (err) => {
            cleanup()
            if (this.config.enableMetrics) {
              this.metrics.errorCount++
            }
            reject(err)
          }
        })
        const w = this.getWorker()
        if (w) {
          w.postMessage({ ...message, id })
        } else {
          cleanup()
          reject(new Error('Worker not available'))
        }
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          if (this.pending.has(id)) {
            cleanup()
            if (this.config.enableMetrics) {
              this.metrics.errorCount++
            }
            reject(new Error(`Worker request timeout: ${messageType}`))
          }
        }, actualTimeout)
      })
    ]).finally(cleanup)
  }
}

// Global worker manager instance
const workerManager = new WorkerManager()

// Performance monitoring for main thread syntax highlighting
const syntaxHighlightingMetrics = {
  totalOperations: 0,
  totalTime: 0,
  averageTime: 0,
  errorCount: 0
}

/**
 * Get performance metrics for both worker and main thread operations
 */
export function getMarkdownMetrics() {
  return {
    worker: workerManager.getMetrics(),
    syntaxHighlighting: { ...syntaxHighlightingMetrics }
  }
}

/**
 * Update markdown processing configuration
 */
export function updateMarkdownConfig(config: Partial<MarkdownConfig>) {
  workerManager.updateConfig(config)
}

async function enhanceInWorker(html: string): Promise<string> {
  try {
    await workerManager.initialize()
    return await workerManager.sendMessageWithTimeout<string>({ type: "enhance", html })
  } catch (error) {
    console.error('Worker enhancement failed:', error)
    return html // Fallback to original HTML
  }
}

const context = createSimpleContext<MarkedContextValue, { nativeParser?: NativeMarkdownParser }>({
  name: "Marked",
  init: (props) => {
    const jsParser = marked.use(
      {
        renderer: {
          link({ href, title, text }) {
            const titleAttr = title ? ` title="${title}"` : ""
            return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
          },
        },
      },
      markedKatex({
        throwOnError: false,
        nonStandard: true,
      }),
      markedShiki({
        async highlight(code, lang) {
          const startTime = performance.now()

          try {
            const highlighter = await getSharedHighlighter({ themes: ["OpenCode"], langs: [] })
            if (!(lang in bundledLanguages)) {
              lang = "text"
            }
            if (!highlighter.getLoadedLanguages().includes(lang)) {
              await highlighter.loadLanguage(lang as BundledLanguage)
            }

            const result = highlighter.codeToHtml(code, {
              lang: lang || "text",
              theme: "OpenCode",
              tabindex: false,
            })

            // Record performance metrics
            const duration = performance.now() - startTime
            syntaxHighlightingMetrics.totalOperations++
            syntaxHighlightingMetrics.totalTime += duration
            syntaxHighlightingMetrics.averageTime =
              syntaxHighlightingMetrics.totalTime / syntaxHighlightingMetrics.totalOperations

            return result
          } catch (error) {
            syntaxHighlightingMetrics.errorCount++
            console.error('Syntax highlighting failed:', error)
            throw error
          }
        },
      }),
    )

    if (props.nativeParser) {
      const nativeParser = props.nativeParser
      return {
        async parse(markdown: string): Promise<string> {
          const html = await nativeParser(markdown)
          return enhanceInWorker(html)
        },
        async fastParse(markdown: string): Promise<string> {
          return nativeParser(markdown)
        },
        async enhance(html: string): Promise<string> {
          return enhanceInWorker(html)
        },
      }
    }

    return {
      async parse(markdown: string) {
        return jsParser.parse(markdown)
      },
    }
  },
})

export const { use: useMarked, provider: MarkedProvider, ctx: MarkedContext } = context

