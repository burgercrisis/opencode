import { Tool } from "./tool"
import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"

type Kind = "file" | "directory"

type Options = {
  bypass?: boolean
  kind?: Kind
}

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options) {
  const nativeTarget = target ? Filesystem.nativePath(target) : undefined

  return !nativeTarget || options?.bypass || Instance.containsPath(nativeTarget)
    ? undefined
    : (async () => {
        const kind = options?.kind ?? "file"
        const parentDir = kind === "directory" ? nativeTarget : Filesystem.dirname(nativeTarget)
        const glob = Filesystem.join(parentDir, "*").replaceAll("\\", "/")

        await ctx.ask({
          permission: "external_directory",
          patterns: [glob],
          always: [glob],
          metadata: {
            filepath: nativeTarget,
            parentDir,
          },
        })
      })()
}
