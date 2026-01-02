// Lazy utilities for OpenCode
export function lazy<T>(factory: () => T): () => T {
    let value: T | undefined
    let computed = false

    return () => {
        if (!computed) {
            value = factory()
            computed = true
        }
        return value!
    }
}
