import { describe, expect, test, mock } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { FileProvider, useFile } from "./file"

// Mock dependencies
mock.module("./sdk", () => ({
  useSDK: () => ({
    directory: mockDirectory(),
    client: {
      file: {
        read: async ({ path }: { path: string }) => {
          // Simulate network delay
          await new Promise(r => setTimeout(r, Math.random() * 10))
          return { data: `content for ${path} in ${mockDirectory()}` }
        }
      },
      find: {
        files: async () => ({ data: [] })
      }
    },
    event: { listen: () => () => {} }
  })
}))

mock.module("./sync", () => ({
  useSync: () => ({
    data: { path: { directory: mockDirectory() } }
  })
}))

mock.module("@/context/language", () => ({
  useLanguage: () => ({ t: (key: string) => key })
}))

mock.module("./layout", () => ({
  useLayout: () => ({
    tabs: () => ({
      active: () => null
    })
  })
}))

mock.module("@/context/platform", () => ({
  usePlatform: () => ({ platform: "web" })
}))

mock.module("@solidjs/router", () => ({
  useParams: () => ({ dir: mockDirectory(), id: undefined })
}))

const [mockDirectory, setMockDirectory] = createSignal("dir1")

describe("Rapid Workspace Switching stress test", () => {
  test("file store maintains integrity during rapid scope changes", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot(async (dispose) => {
        try {
          const testLogic = async () => {
            const file = useFile()
            
            const paths = ["fileA.ts", "fileB.ts", "fileC.ts"]
            const dirs = ["dir1", "dir2", "dir3", "dir4", "dir5"]
            
            const results: { dir: string; path: string; content: string }[] = []
            const promises: Promise<void>[] = []
            
            // Rapidly switch directories and trigger loads
            const iterations = 100
            for (let i = 0; i < iterations; i++) {
              const dir = dirs[i % dirs.length]
              const path = paths[i % paths.length]
              
              setMockDirectory(dir)
              
              // Trigger load - don't await yet to simulate concurrency
              const p = file.load(path).then(() => {
                const state = file.get(path)
                if (state?.loaded) {
                  results.push({ dir, path, content: state.content as string })
                }
              })
              promises.push(p)
              
              // Very small delay to allow microtasks but still be "rapid"
              await new Promise(r => setTimeout(r, 1))
            }

            // Wait for all loads to settle
            await Promise.all(promises)

            // Verify integrity
            expect(results.length).toBeGreaterThan(0)
            for (const res of results) {
              // The content should match the directory it was loaded in
              expect(res.content).toContain(`content for ${res.path} in ${res.dir}`)
            }

            console.log(`Verified ${results.length} loads during rapid switching.`)
            resolve()
          }

          // Wrap in provider
          const [Provider] = FileProvider as any
          Provider({
            get children() {
              testLogic().catch(reject)
              return null
            }
          })
        } catch (e) {
          reject(e)
        } finally {
          // We can't dispose immediately because of the async testLogic
          // dispose() 
        }
      })
    })
  })
})
