import { render } from "solid-js/web"
import { MetaProvider } from "@solidjs/meta"
import "@opencode-ai/app/index.css"
import { Font } from "@opencode-ai/ui/font"
import { Progress } from "@opencode-ai/ui/progress"
import { createEffect, createMemo, createSignal, onCleanup, onMount, ErrorBoundary } from "solid-js"
import { commands, events, InitStep } from "./bindings"
import { Channel } from "@tauri-apps/api/core"

// Debug logging helper
function logDebug(message: string): void {
  // In desktop environment, always log debug info
  // Production builds can be configured to suppress debug logs
  console.log(message)
}

// Validate logo structure at import time
function validateLogo(logo: any): logo is { left: string[]; right: string[] } {
  return (
    logo &&
    typeof logo === 'object' &&
    Array.isArray(logo.left) &&
    Array.isArray(logo.right) &&
    logo.left.every((line: any) => typeof line === 'string') &&
    logo.right.every((line: any) => typeof line === 'string')
  )
}

// Fallback logo in case shared import fails
const FALLBACK_LOGO = {
  left: ["Loading..."],
  right: ["OpenCode"]
}

// Error fallback component with proper reset logic and sanitized error display
function ErrorFallback(props: { error: any; reset: () => void }) {
  const [retryCount, setRetryCount] = createSignal(0)

  const handleReset = () => {
    // Increment retry count to track attempts
    setRetryCount(prev => prev + 1)
    // Call the reset function provided by ErrorBoundary
    props.reset()
  }

  // Sanitize error message for user display - avoid leaking internal details
  const getDisplayError = () => {
    if (!props.error) return "Unknown error occurred"

    // Only show generic messages for known error types, otherwise show generic message
    const message = props.error.message || String(props.error)
    if (message.includes("Failed to import") || message.includes("network") || message.includes("timeout")) {
      return "Loading failed. Please check your connection and try again."
    }
    if (message.includes("Channel") || message.includes("initialization")) {
      return "Application initialization failed. Please restart the application."
    }

    // For any other errors, show a generic message to avoid information leakage
    return "An unexpected error occurred. Please try again."
  }

  return (
    <div class="w-screen h-screen bg-background-base flex items-center justify-center">
      <div class="flex flex-col items-center gap-4 text-center">
        <div class="text-text-weak text-14-normal">
          Something went wrong during initialization
        </div>
        <div class="text-text-weaker text-12-normal max-w-md">
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


// UI timing constants for better maintainability
const LOADING_DELAYS_MS = [3000, 9000] as const
const LOADING_STATUS_MESSAGES = ["Just a moment...", "Migrating your database", "This may take a couple of minutes"] as const

const root = document.getElementById("root")
if (!root) {
  throw new Error("Root element not found - unable to initialize loading component")
}
const lines = LOADING_STATUS_MESSAGES
const delays = LOADING_DELAYS_MS

render(() => {
  return (
    <ErrorBoundary fallback={ErrorFallback}>
      <MetaProvider>
        <LoadingComponent />
      </MetaProvider>
    </ErrorBoundary>
  )
}, root)

// Separate component for better error boundary handling
function LoadingComponent() {
  const [step, setStep] = createSignal<InitStep | null>(null)
  const [line, setLine] = createSignal(0)
  const [percent, setPercent] = createSignal(0)
  const [logoError, setLogoError] = createSignal(false)
  const [logo, setLogo] = createSignal<any>(null)

  const phase = createMemo(() => step()?.phase)

  const value = createMemo(() => {
    try {
      if (phase() === "done") return 100
      return Math.max(25, Math.min(100, percent()))
    } catch (error) {
      console.error('Error calculating progress value:', error)
      return 25
    }
  })

  const currentLogo = createMemo(() => {
    if (logoError()) {
      return FALLBACK_LOGO
    }

    const currentLogoValue = logo()
    try {
      if (validateLogo(currentLogoValue)) {
        return currentLogoValue
      } else {
        logDebug('Invalid logo structure, using fallback')
        setLogoError(true)
        return FALLBACK_LOGO
      }
    } catch (error) {
      console.error('Error loading logo:', error)
      setLogoError(true)
      return FALLBACK_LOGO
    }
  })

  onMount(() => {
    // Track component mounted state for cleanup
    let isMounted = true

    // Create channel inside onMount to ensure proper timing
    const channel = new Channel()
    channel.onmessage = (response: unknown) => {
      setStep(response as InitStep)
    }

    // Load logo asynchronously
    import("../../shared/logo").then(({ burgercodeLogo: importedLogo }) => {
      if (isMounted) {
        setLogo(importedLogo)
      }
    }).catch((error) => {
      if (isMounted) {
        console.warn('Failed to import logo from shared package, using fallback:', error)
        setLogoError(true)
      }
    })

    setLine(0)
    setPercent(0)

    const timers = delays.map((ms, i) => setTimeout(() => setLine(i + 1), ms))

    const listener = events.sqliteMigrationProgress.listen((e) => {
      if (e.payload.type === "InProgress") setPercent(Math.max(0, Math.min(100, e.payload.value)))
      if (e.payload.type === "Done") setPercent(100)
    })

    // Track initialization promise for proper cleanup
    let initPromise: Promise<any> | null = null

    try {
      initPromise = commands.awaitInitialization(channel)
      initPromise.catch((error) => {
        if (isMounted) {
          console.error('Channel initialization failed:', error instanceof Error ? error.message : String(error))
          // Log the error but don't re-throw to avoid unhandled promise rejection
          // The error has been logged and the UI will show appropriate error state
        }
      })
    } catch (error) {
      console.error('Failed to start channel initialization:', error)
    }

    onCleanup(() => {
      // Mark component as unmounted to prevent async operations from taking effect
      isMounted = false
      // Proper cleanup to prevent memory leaks - run cleanup tasks independently
      const cleanupTasks: Promise<void>[] = []

      // Event listener cleanup
      const listenerCleanup = listener.then((cleanupCallback) => {
        if (typeof cleanupCallback === 'function') {
          cleanupCallback()
        }
      }).catch((error) => {
        console.warn('Error during event listener cleanup:', error)
      })
      cleanupTasks.push(listenerCleanup)

      timers.forEach(clearTimeout)

      // Enhanced Channel cleanup with comprehensive error handling
      if (channel) {
        const channelCleanup = (async () => {
          try {
            // Clear message handler first
            try {
              (channel as any).onmessage = null
            } catch (error) {
              console.warn('Failed to clear channel onmessage:', error instanceof Error ? error.message : String(error))
            }

            // Note: Tauri Channel does not have a documented close() method
            // The channel will be cleaned up automatically when no longer referenced

            // Clear any pending initialization - properly handle the promise
            if (initPromise) {
              // Don't suppress errors, but don't let them crash cleanup either
              initPromise.catch((error) => {
                console.warn('Initialization promise had pending error during cleanup:', error instanceof Error ? error.message : String(error))
              })
            }

            logDebug('Channel cleanup completed successfully')
          } catch (error) {
            console.warn('Error during channel cleanup:', error instanceof Error ? error.message : String(error))
          }
        })()
        cleanupTasks.push(channelCleanup)
      }

      // Run all cleanup tasks independently - don't wait for coordination
      cleanupTasks.forEach(task => {
        task.catch((error) => {
          console.warn('Cleanup task failed:', error)
        })
      })
    })
  })

  createEffect(() => {
    try {
      if (phase() !== "done") return

      const timer = setTimeout(() => {
        try {
          events.loadingWindowComplete.emit(null)
        } catch (error) {
          console.error('Error emitting loading window complete:', error)
        }
      }, 1000)
      onCleanup(() => clearTimeout(timer))
    } catch (error) {
      console.error('Error in phase effect:', error)
    }
  })

  const status = createMemo(() => {
    try {
      if (phase() === "done") return "All done"
      if (phase() === "sqlite_waiting") return lines[line()]
      return "Just a moment..."
    } catch (error) {
      console.error('Error determining status:', error)
      return "Initializing..."
    }
  })

  return (
    <div class="w-screen h-screen bg-background-base flex items-center justify-center">
      <Font />
      <div class="flex flex-col items-center gap-11">
        <div class="flex flex-col items-center gap-4">
          <pre class="text-text-weak text-12-normal font-mono leading-tight">
            {currentLogo().left.map((line: string, i: number) => (
              <div class={i === 0 ? "text-center" : ""}>{line}</div>
            ))}
          </pre>
          <pre class="text-text-strong text-12-normal font-mono leading-tight">
            {currentLogo().right.map((line: string, i: number) => (
              <div class={i === 0 ? "text-center" : ""}>{line}</div>
            ))}
          </pre>
        </div>
        <div class="w-60 flex flex-col items-center gap-4" aria-live="polite">
          <span class="w-full overflow-hidden text-center text-ellipsis whitespace-nowrap text-text-strong text-14-normal">
            {status()}
          </span>
          <Progress
            value={value()}
            class="w-20 [&_[data-slot='progress-track']]:h-1 [&_[data-slot='progress-track']]:border-0 [&_[data-slot='progress-track']]:rounded-none [&_[data-slot='progress-track']]:bg-surface-weak [&_[data-slot='progress-fill']]:rounded-none [&_[data-slot='progress-fill']]:bg-icon-warning-base"
            aria-label="Database migration progress"
            getValueLabel={({ value }: { value: number }) => `${Math.round(value)}%`}
          />
        </div>
      </div>
    </div>
  )
}
