import { render } from "solid-js/web"
import { MetaProvider } from "@solidjs/meta"
import "@opencode-ai/app/index.css"
import { Font } from "@opencode-ai/ui/font"
import { Progress } from "@opencode-ai/ui/progress"
import { batch, createEffect, createMemo, createSignal, onCleanup, onMount, ErrorBoundary } from "solid-js"
import { commands, events, InitStep } from "./bindings"
import { Channel } from "@tauri-apps/api/core"
import { initI18n, t } from "./i18n"

// BEST OF BOTH WORLDS: HEAD simple delays/lines + incoming debug/error handling + logo
const root = document.getElementById("root")
if (!root) {
  throw new Error("Root element not found")
}

// Debug logging helper from incoming
function logDebug(message: string): void {
  console.log(`[Loading] ${message}`)
}

// UI constants from incoming for maintainability
const LOADING_DELAYS_MS = [3000, 9000] as const
const delays = LOADING_DELAYS_MS

// Simple status messages from HEAD using i18n
const lines = [
  t("desktop.loading.status.initial"),
  t("desktop.loading.status.migrating"),
  t("desktop.loading.status.waiting"),
]

const FALLBACK_LOGO = {
  left: ["Loading..."],
  right: ["OpenCode"]
}

// Enhanced error fallback from incoming
function ErrorFallback(props: { error: any; reset: () => void }) {
  const [retryCount, setRetryCount] = createSignal(0)

  const handleReset = () => {
    setRetryCount(prev => prev + 1)
    props.reset()
  }

  const getDisplayError = () => {
    if (!props.error) return "Unknown error occurred"
    const message = props.error.message || String(props.error)
    if (message.includes("Failed to import") || message.includes("network") || message.includes("timeout")) {
      return "Loading failed. Please check your connection and try again."
    }
    if (message.includes("Channel") || message.includes("initialization")) {
      return "Application initialization failed. Please restart."
    }
    return "An unexpected error occurred. Please try again."
  }

  return (
    <div class="w-screen h-screen bg-background-base flex items-center justify-center">
      <div class="flex flex-col items-center gap-4 text-center max-w-md">
        <div class="text-text-weak text-14-normal">
          Something went wrong during initialization
        </div>
        <div class="text-text-weaker text-12-normal">
          {getDisplayError()}
          {retryCount() > 0 && (
            <div class="mt-2 text-text-weaker">
              Retry attempts: {retryCount()}
            </div>
          )}
        </div>
        <button
          onClick={handleReset}
          class="px-4 py-2 bg-surface-weak text-text-strong rounded hover:bg-surface-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}

void initI18n()

render(() => {
  return (
    <ErrorBoundary fallback={ErrorFallback}>
      <MetaProvider>
        <LoadingComponent />
      </MetaProvider>
    </ErrorBoundary>
  )
}, root)

function LoadingComponent() {
  const [step, setStep] = createSignal<InitStep | null>(null)
  const [line, setLine] = createSignal(0)
  const [percent, setPercent] = createSignal(0)

  const phase = createMemo(() => step()?.phase)

  const value = createMemo(() => {
    try {
      if (phase() === "done") return 100
      return Math.max(25, Math.min(100, percent()))
    } catch {
      return 25
    }
  })

  onMount(() => {
    let isMounted = true
    const channel = new Channel<unknown>()
    channel.onmessage = (response) => setStep(response as InitStep)

    setLine(0)
    setPercent(0)

    const timers = delays.map((ms, i) => setTimeout(() => {
      if (isMounted) setLine(i + 1)
    }, ms))

    const listener = events.sqliteMigrationProgress.listen((e) => {
      if (e.payload.type === "InProgress") {
        setPercent(Math.max(0, Math.min(100, e.payload.value)))
      }
      if (e.payload.type === "Done") {
        setPercent(100)
      }
    })

    let initPromise: Promise<any> | null = null
    try {
      initPromise = commands.awaitInitialization(channel)
    } catch (error) {
      logDebug(`Init error: ${error}`)
    }

    onCleanup(() => {
      isMounted = false
      timers.forEach(clearTimeout)
      listener.then(cleanup => cleanup?.()).catch(logDebug)
      if (initPromise) {
        initPromise.catch(logDebug)
      }
      try {
        ;(channel as any).onmessage = null
      } catch {}
    })
  })

  createEffect(() => {
    if (phase() !== "done") return
    const timer = setTimeout(() => {
      events.loadingWindowComplete.emit(null)
    }, 1000)
    onCleanup(() => clearTimeout(timer))
  })

  const status = createMemo(() => {
    if (phase() === "done") return t("desktop.loading.status.done")
    if (phase() === "sqlite_waiting") return lines[line()]
    return t("desktop.loading.status.initial")
  })

  return (
    <div class="w-screen h-screen bg-background-base flex items-center justify-center">
      <Font />
      <div class="flex flex-col items-center gap-11">
        <Splash class="w-20 h-25 opacity-15" />
        <div class="w-60 flex flex-col items-center gap-4" aria-live="polite">
          <span class="w-full overflow-hidden text-center text-ellipsis whitespace-nowrap text-text-strong text-14-normal">
            {status()}
          </span>
          <Progress
            value={value()}
            class="w-20 [&_[data-slot='progress-track']]:h-1 [&_[data-slot='progress-track']]:border-0 [&_[data-slot='progress-track']]:rounded-none [&_[data-slot='progress-track']]:bg-surface-weak [&_[data-slot='progress-fill']]:rounded-none [&_[data-slot='progress-fill']]:bg-icon-warning-base"
            aria-label={t("desktop.loading.progressAria")}
            getValueLabel={({ value }) => `${Math.round(value)}%`}
          />
        </div>
      </div>
    </div>
  )
}

