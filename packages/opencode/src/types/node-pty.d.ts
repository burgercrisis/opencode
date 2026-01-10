/**
 * Type declarations for node-pty module (Node.js only)
 * These are used for typechecking on non-Bun runtimes
 */
declare module "node-pty" {
  interface IPty {
    pid: number
    process: string
    resize(cols: number, rows: number): void
    write(data: string): void
    kill(signal?: string): void
    onData(callback: (data: string) => void): void
    onExit(callback: (event: { exitCode: number }) => void): void
  }

  interface SpawnOptions {
    name?: string
    cwd?: string
    env?: Record<string, string>
    rows?: number
    cols?: number
  }

  export function spawn(file: string, args: string[], options: SpawnOptions): IPty
}
