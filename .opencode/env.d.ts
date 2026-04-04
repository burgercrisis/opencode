declare module "*.txt" {
  const content: string
  export default content
}

// Bun test types
declare module "bun:test" {
  // Test runner functions
  export const describe: (name: string, fn: () => void) => void
  export const it: (name: string, fn: () => void | Promise<void>) => void
  export const test: (name: string, fn: () => void | Promise<void>) => void

  // Setup/teardown functions
  export const beforeAll: (fn: () => void | Promise<void>) => void
  export const beforeEach: (fn: () => void | Promise<void>) => void
  export const afterAll: (fn: () => void | Promise<void>) => void
  export const afterEach: (fn: () => void | Promise<void>) => void

  // Assertion library - using any for now as Bun's expect API is complex
  // Consider importing from @types/bun when available for better type safety
  export const expect: any

  // Mocking utilities
  export const mock: {
    <T>(module: string, factory?: () => T): void
    module: <T>(module: string, factory?: () => T) => void
  }
}

// Node.js process global
declare const process: {
  env: Record<string, string | undefined>
  cwd: () => string
  memoryUsage: () => { heapUsed: number; heapTotal: number; external: number; rss: number }
}
