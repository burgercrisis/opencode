// Utilities for OpenCode
export function formatError(error: any): string {
    return error?.message || String(error)
}
