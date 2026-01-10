import path from "path"
import { Global } from "../global"
import fs from "fs/promises"
import z from "zod"

export namespace Auth {
  export const Oauth = z
    .object({
      type: z.literal("oauth"),
      refresh: z.string(),
      access: z.string(),
      expires: z.number(),
      enterpriseUrl: z.string().optional(),
    })
    .meta({ ref: "OAuth" })

  export const Api = z
    .object({
      type: z.literal("api"),
      key: z.string(),
    })
    .meta({ ref: "ApiAuth" })

  export const WellKnown = z
    .object({
      type: z.literal("wellknown"),
      key: z.string(),
      token: z.string(),
    })
    .meta({ ref: "WellKnownAuth" })

  export const Info = z.discriminatedUnion("type", [Oauth, Api, WellKnown]).meta({ ref: "Auth" })
  export type Info = z.infer<typeof Info>

  const filepath = path.join(Global.Path.data, "auth.json")

  export async function get(providerID: string) {
    const auth = await all()
    return auth[providerID]
  }

  export async function all(): Promise<Record<string, Info>> {
    const isBunRuntime = typeof Bun !== "undefined" && Bun.file !== undefined
    let data: Record<string, unknown> = {}
    if (isBunRuntime) {
      const file = Bun.file(filepath)
      data = await file.json().catch(() => ({}))
    } else {
      try {
        const content = await fs.readFile(filepath, "utf-8")
        data = JSON.parse(content)
      } catch {
        data = {}
      }
    }
    return Object.entries(data).reduce(
      (acc, [key, value]) => {
        const parsed = Info.safeParse(value)
        if (!parsed.success) return acc
        acc[key] = parsed.data
        return acc
      },
      {} as Record<string, Info>,
    )
  }

  export async function set(key: string, info: Info) {
    const isBunRuntime = typeof Bun !== "undefined" && Bun.file !== undefined
    const data = await all()
    const content = JSON.stringify({ ...data, [key]: info }, null, 2)
    if (isBunRuntime) {
      const file = Bun.file(filepath)
      await Bun.write(file, content)
    } else {
      await fs.writeFile(filepath, content, "utf-8")
    }
    await fs.chmod(filepath, 0o600)
  }

  export async function remove(key: string) {
    const isBunRuntime = typeof Bun !== "undefined" && Bun.file !== undefined
    const data = await all()
    delete data[key]
    const content = JSON.stringify(data, null, 2)
    if (isBunRuntime) {
      const file = Bun.file(filepath)
      await Bun.write(file, content)
    } else {
      await fs.writeFile(filepath, content, "utf-8")
    }
    await fs.chmod(filepath, 0o600)
  }
}
