import z from "zod"
import path from "path"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { NamedError } from "@opencode-ai/util/error"
import { ConfigMarkdown } from "../config/markdown"
import { Log } from "../util/log"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"
import { Flag } from "@/flag/flag"
import { Bus } from "@/bus"
import { Session } from "@/session"

export namespace Skill {
  const log = Log.create({ service: "skill" })
  export const Info = z.object({
    name: z.string(),
    description: z.string(),
    location: z.string(),
  })
  export type Info = z.infer<typeof Info>

  export const InvalidError = NamedError.create(
    "SkillInvalidError",
    z.object({
      path: z.string(),
      message: z.string().optional(),
      issues: z.custom<z.core.$ZodIssue[]>().optional(),
    }),
  )

  export const NameMismatchError = NamedError.create(
    "SkillNameMismatchError",
    z.object({
      path: z.string(),
      expected: z.string(),
      actual: z.string(),
    }),
  )

  const OPENCODE_SKILL_GLOB = new Bun.Glob("{skill,skills}/**/SKILL.md")
  const CLAUDE_SKILL_GLOB = new Bun.Glob("skills/**/SKILL.md")

  export const state = Instance.state(async () => {
    const parseSkill = async (match: string): Promise<Info | undefined> => {
      const md = await ConfigMarkdown.parse(match).catch((err) => {
        const message = ConfigMarkdown.FrontmatterError.isInstance(err)
          ? err.data.message
          : `Failed to parse skill ${match}`
        Bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        log.error("failed to load skill", { skill: match, err })
        return undefined
      })

      return md
        ? (() => {
            const parsed = Info.pick({ name: true, description: true }).safeParse(md.data)
            return parsed.success
              ? {
                  name: parsed.data.name,
                  description: parsed.data.description,
                  location: match.replaceAll(path.sep, "/"),
                }
              : undefined
          })()
        : undefined
    }

    const claudeBaseDirs = await Array.fromAsync(
      Filesystem.up({
        targets: [".claude"],
        start: Instance.directory,
        stop: Instance.worktree,
      }),
    )

    const globalClaude = `${Global.Path.home}/.claude`
    const claudeDirs = (await Filesystem.isDir(globalClaude)) ? [...claudeBaseDirs, globalClaude] : claudeBaseDirs

    const claudeMatches = !Flag.OPENCODE_DISABLE_CLAUDE_CODE_SKILLS
      ? await claudeDirs.reduce(async (accPromise, dir) => {
          const acc = await accPromise
          const matches = await Array.fromAsync(
            CLAUDE_SKILL_GLOB.scan({
              cwd: dir,
              absolute: true,
              onlyFiles: true,
              followSymlinks: true,
              dot: true,
            }),
          ).catch((error) => {
            log.error("failed .claude directory scan for skills", { dir, error })
            return [] as string[]
          })
          return [...acc, ...matches]
        }, Promise.resolve([] as string[]))
      : []

    const opencodeDirs = await Config.directories()
    const opencodeMatches = await opencodeDirs.reduce(async (accPromise, dir) => {
      const acc = await accPromise
      const matches = await Array.fromAsync(
        OPENCODE_SKILL_GLOB.scan({
          cwd: dir,
          absolute: true,
          onlyFiles: true,
          followSymlinks: true,
        }),
      )
      return [...acc, ...matches]
    }, Promise.resolve([] as string[]))

    const allMatches = [...claudeMatches, ...opencodeMatches]
    const skillsList = (await Promise.all(allMatches.map(parseSkill))).filter((s): s is Info => s !== undefined)

    return skillsList.reduce((acc, skill) => {
      const _warn = acc[skill.name]
        ? log.warn("duplicate skill name", {
            name: skill.name,
            existing: acc[skill.name].location,
            duplicate: skill.location,
          })
        : null

      return { ...acc, [skill.name]: skill }
    }, {} as Record<string, Info>)
  })

  export async function get(name: string) {
    return state().then((x) => x[name])
  }

  export async function all() {
    return state().then((x) => Object.values(x))
  }
}
