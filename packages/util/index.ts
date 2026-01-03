// Utilities for OpenCode
import { z } from "zod"

export function formatError(error: any): string {
    return error?.message || String(error)
}

// Re-export zod for convenience
export { z } from "zod"
export type { ZodSchema } from "zod"
export type { infer as infer } from "zod"
