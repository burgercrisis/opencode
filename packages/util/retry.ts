export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    delay?: number
    backoff?: number
    onRetry?: (error: unknown, attempt: number) => void
  } = {},
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = 2, onRetry } = options
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts) {
        onRetry?.(error, attempt)
        const waitTime = delay * Math.pow(backoff, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
      }
    }
  }

  throw lastError
}
