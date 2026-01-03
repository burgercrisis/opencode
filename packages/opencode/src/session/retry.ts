<<<<<<< HEAD
import { NamedError, type NamedErrorInstance } from "@opencode-ai/util/error"
=======
import type { NamedError } from "@opencode-ai/util/error"
>>>>>>> upstream/dev
import { MessageV2 } from "./message-v2"

export namespace SessionRetry {
  export const RETRY_INITIAL_DELAY = 2000
  export const RETRY_BACKOFF_FACTOR = 2
  export const RETRY_MAX_DELAY_NO_HEADERS = 30_000 // 30 seconds
<<<<<<< HEAD

  export async function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms)
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout)
          reject(new DOMException("Aborted", "AbortError"))
        },
        { once: true },
      )
=======
  export const RETRY_MAX_DELAY = 2_147_483_647 // max 32-bit signed integer for setTimeout

  export async function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const abortHandler = () => {
        clearTimeout(timeout)
        reject(new DOMException("Aborted", "AbortError"))
      }
      const timeout = setTimeout(
        () => {
          signal.removeEventListener("abort", abortHandler)
          resolve()
        },
        Math.min(ms, RETRY_MAX_DELAY),
      )
      signal.addEventListener("abort", abortHandler, { once: true })
>>>>>>> upstream/dev
    })
  }

  export function delay(attempt: number, error?: MessageV2.APIError) {
    if (error) {
      const headers = error.data.responseHeaders
      if (headers) {
        const retryAfterMs = headers["retry-after-ms"]
        if (retryAfterMs) {
          const parsedMs = Number.parseFloat(retryAfterMs)
          if (!Number.isNaN(parsedMs)) {
            return parsedMs
          }
        }

        const retryAfter = headers["retry-after"]
        if (retryAfter) {
          const parsedSeconds = Number.parseFloat(retryAfter)
          if (!Number.isNaN(parsedSeconds)) {
            // convert seconds to milliseconds
            return Math.ceil(parsedSeconds * 1000)
          }
          // Try parsing as HTTP date format
          const parsed = Date.parse(retryAfter) - Date.now()
          if (!Number.isNaN(parsed) && parsed > 0) {
            return Math.ceil(parsed)
          }
        }

        return RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1)
      }
    }

    return Math.min(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1), RETRY_MAX_DELAY_NO_HEADERS)
  }

<<<<<<< HEAD
  export function retryable(error: any): string | undefined {
    // Handle null/undefined first to avoid 'never' type inference
    if (!error) return undefined;

    // Use type assertion immediately to avoid 'never' inference
    const errorObj = error as any;

    if (MessageV2.APIError.isInstance(errorObj)) {
      if (!errorObj.data.isRetryable) return undefined
      return errorObj.data.message.includes("Overloaded") ? "Provider is overloaded" : errorObj.data.message
    }

    // Add type guard to handle cases where error might be 'never'
    // @ts-ignore - TypeScript has trouble with type inference here
    if (errorObj && typeof errorObj === 'object' && 'data' in errorObj && errorObj.data) {
      // @ts-ignore - TypeScript has trouble with type inference here
      const errorData = errorObj.data as any
      if (typeof errorData.message === "string") {
        try {
          const json = JSON.parse(errorData.message)
          if (json.type === "error" && json.error?.type === "too_many_requests") {
            return "Too Many Requests"
          }
          if (json.code?.includes("exhausted") || json.code?.includes("unavailable")) {
            return "Provider is overloaded"
          }
          if (json.type === "error" && json.error?.code?.includes("rate_limit")) {
            return "Rate Limited"
          }
          if (
            json.error?.message?.includes("no_kv_space") ||
            (json.type === "error" && json.error?.type === "server_error") ||
            !!json.error
          ) {
            return "Provider Server Error"
          }
        } catch { }
      }
=======
  export function retryable(error: ReturnType<NamedError["toObject"]>) {
    if (MessageV2.APIError.isInstance(error)) {
      if (!error.data.isRetryable) return undefined
      return error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message
    }

    if (typeof error.data?.message === "string") {
      try {
        const json = JSON.parse(error.data.message)
        if (json.type === "error" && json.error?.type === "too_many_requests") {
          return "Too Many Requests"
        }
        if (json.code.includes("exhausted") || json.code.includes("unavailable")) {
          return "Provider is overloaded"
        }
        if (json.type === "error" && json.error?.code?.includes("rate_limit")) {
          return "Rate Limited"
        }
        if (
          json.error?.message?.includes("no_kv_space") ||
          (json.type === "error" && json.error?.type === "server_error") ||
          !!json.error
        ) {
          return "Provider Server Error"
        }
      } catch {}
>>>>>>> upstream/dev
    }

    return undefined
  }
}
