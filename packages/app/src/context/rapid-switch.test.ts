import { GlobalRegistrator } from "@happy-dom/global-registrator"
try {
  GlobalRegistrator.register()
} catch (e) {
  // Already registered
}

import { describe, expect, test, mock } from "bun:test"
import { createRoot, createSignal, untrack } from "solid-js"

// 1. Define signals/state used in mocks
const [mockDirectory, setMockDirectory] = createSignal("dir1")

// 2. Mock dependencies BEFORE importing the file under test
mock.module("./sdk", () => ({
  useSDK: () => ({
    get directory() { return mockDirectory() },
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
    data: { path: { get directory() { return mockDirectory() } } }
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
  useParams: () => ({ dir: mockDirectory(), id: undefined }),
  createBranch: () => ({}),
  createRoute: () => ({}),
  useLocation: () => ({ pathname: "/" }),
  useNavigate: () => () => {},
}))

// 3. Now import the file under test
import { FileProvider } from "./file"

describe("Rapid Workspace Switching stress test", () => {
  test("file store maintains integrity during rapid scope changes", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot(async (dispose) => {
        try {
          // Manual initialization - this gives us the same object useFile() would return
          // but without needing to be inside a Provider component.
          const file = (FileProvider as any)._init()

          const testLogic = async () => {
            console.log("Starting testLogic...")
            
            const paths = ["fileA.ts", "fileB.ts", "fileC.ts"]
            const dirs = ["dir1", "dir2", "dir3", "dir4", "dir5", "dir6", "dir7"]
            
            const results: { dir: string; path: string; content: string }[] = []
            const promises: Promise<void>[] = []
            
            // Rapidly switch directories and trigger loads
            const iterations = 50
            for (let i = 0; i < iterations; i++) {
              const dir = dirs[i % dirs.length]
              const path = paths[i % paths.length]
              
              // Use untrack to prevent reactive loops during the stress test
              untrack(() => {
                setMockDirectory(dir)
              })
              
              // Trigger load - don't await yet to simulate concurrency
              const p = file.load(path).then(() => {
                const state = file.get(path)
                if (state?.loaded) {
                  results.push({ dir, path, content: state.content as string })
                }
              })
              promises.push(p)
              
              // Small delay to let microtasks process
              await new Promise(r => setTimeout(r, 2))
            }

            console.log("Waiting for promises to settle...")
            await Promise.all(promises)
            console.log(`All ${promises.length} promises settled. Results: ${results.length}`)

            // Verify integrity
            expect(results.length).toBeGreaterThan(0)
            for (const res of results) {
              // The content should match the directory it was loaded in
              if (!res.content.includes(`content for ${res.path} in ${res.dir}`)) {
                console.error(`Integrity check failed for ${res.path} in ${res.dir}: expected content to include 'content for ${res.path} in ${res.dir}', got '${res.content}'`)
              }
              expect(res.content).toContain(`content for ${res.path} in ${res.dir}`)
            }

            // Verify Cache Eviction (Fine-grained)
            // We expect only MAX_STORE_DIRECTORIES (5) to be kept
            const storeState = (file as any)._store?.file || {}
            const activeDirs = Object.keys(storeState)
            console.log(`Active directories in store: ${activeDirs.join(", ")}`)
            expect(activeDirs.length).toBeLessThanOrEqual(5)

            console.log(`Verified ${results.length} loads during rapid switching and cache eviction.`)
            resolve()
          }

          testLogic().catch(reject).finally(dispose)
        } catch (e) {
          console.error("Error in test execution:", e)
          reject(e)
        }
      })
    })
  }, 10000)
})
