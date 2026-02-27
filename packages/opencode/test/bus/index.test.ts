import z from "zod"
import { expect, test, describe, beforeEach, afterEach } from "bun:test"
import { Bus } from "../../src/bus/index"
import { Instance } from "../../src/project/instance"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { $ } from "bun"

describe("Bus", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), "opencode-bus-test-" + Math.random().toString(36).slice(2))
    await fs.mkdir(testDir, { recursive: true })
    await $`git init`.cwd(testDir).quiet()
    await $`git commit --allow-empty -m "initial"`.cwd(testDir).quiet()
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {})
  })

  test("publish sends event to subscribers", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const received: any[] = []
        const unsub = Bus.subscribe(Bus.InstanceDisposed, (event) => {
          received.push(event)
        })

        await Bus.publish(Bus.InstanceDisposed, {
          directory: testDir,
        })

        unsub()
      },
    })
  })

  test("subscribe returns unsubscribe function", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        let callCount = 0
        const unsub = Bus.subscribe(Bus.InstanceDisposed, () => {
          callCount++
        })

        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })
        unsub()
        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })

        expect(callCount).toBe(1)
      },
    })
  })

  test("once calls callback exactly once", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        let callCount = 0
        Bus.once(Bus.InstanceDisposed, () => {
          callCount++
          return "done"
        })

        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })
        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })

        expect(callCount).toBe(1)
      },
    })
  })

  test("subscribeAll receives all events", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const received: any[] = []
        const unsub = Bus.subscribeAll((event) => {
          received.push(event)
        })

        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })

        unsub()
      },
    })
  })

  test("multiple subscribers can receive same event", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        let count1 = 0
        let count2 = 0

        Bus.subscribe(Bus.InstanceDisposed, () => count1++)
        Bus.subscribe(Bus.InstanceDisposed, () => count2++)

        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })

        expect(count1).toBe(1)
        expect(count2).toBe(1)
      },
    })
  })

  test("wildcard subscriber receives all events", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const received: any[] = []
        const unsub = Bus.subscribeAll((event) => {
          received.push(event)
        })

        await Bus.publish(Bus.InstanceDisposed, { directory: testDir })

        unsub()
      },
    })
  })
})
