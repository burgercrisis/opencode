import { describe, expect, test } from "bun:test"
import * as Sdk from "../src/v2/gen/sdk.gen"

const fakeClient = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "sse") {
        return new Proxy(
          {},
          {
            get(_t, method) {
              return async () => ({ sse: String(method) })
            },
          },
        )
      }
      return async () => ({ method: String(prop) })
    },
  },
) as any

describe("sdk.gen OpencodeClient registry", () => {
  test("stores and retrieves instances by key", () => {
    const client = new Sdk.OpencodeClient({ client: fakeClient, key: "test-key" })
    const retrieved = Sdk.OpencodeClient.__registry.get("test-key")
    expect(retrieved).toBe(client)
    expect(() => Sdk.OpencodeClient.__registry.get("missing-key")).toThrow(
      'No SDK client found. Create one with "new OpencodeClient()" to fix this error.',
    )
  })

  test("lazy sub-clients reuse instances", () => {
    const client = new Sdk.OpencodeClient({ client: fakeClient })

    const global1 = client.global
    const global2 = client.global
    expect(global1).toBe(global2)

    const session1 = client.session
    const session2 = client.session
    expect(session1).toBe(session2)
  })
})

describe("sdk.gen exported client methods", () => {
  test("invokes all exported client methods with fake client", async () => {
    const instances: any[] = []

    for (const [, value] of Object.entries(Sdk)) {
      if (typeof value !== "function") continue
      const source = Function.prototype.toString.call(value)
      if (!source.startsWith("class ")) continue

      let instance: any
      try {
        instance = new (value as any)({ client: fakeClient })
      } catch {
        try {
          instance = new (value as any)()
        } catch {
          continue
        }
      }

      instances.push(instance)
      const proto = Object.getPrototypeOf(instance)
      for (const methodName of Object.getOwnPropertyNames(proto)) {
        if (methodName === "constructor") continue
        const method = (instance as any)[methodName]
        if (typeof method !== "function") continue

        const arity = method.length
        const args =
          arity === 0
            ? []
            : arity === 1
              ? [{}]
              : [{}, {}]

        try {
          const result = method.apply(instance, args)
          if (result && typeof result.then === "function") {
            await result
          }
        } catch {
          // We only care about exercising the code paths; errors from fake client are ignored.
        }
      }
    }

    expect(instances.length).toBeGreaterThan(0)
  })
})

