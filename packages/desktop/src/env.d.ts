// Bun test types for desktop package tests
declare module "bun:test" {
  export const describe: (name: string, fn: () => void) => void
  export const it: (name: string, fn: () => void | Promise<void>) => void
  export const expect: any
  export const beforeEach: (fn: () => void | Promise<void>) => void
  export const afterEach: (fn: () => void | Promise<void>) => void
  export const spyOn: any
}

// Node.js process global for tests
declare const process: {
  env: Record<string, string | undefined>
  cwd: () => string
}
