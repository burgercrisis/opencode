import z from "zod"
import { Global } from "../global"
import { Log } from "../util/log"
import path from "path"
import { Filesystem } from "../util/filesystem"
import { NamedError } from "@opencode-ai/util/error"
import { readableStreamToText } from "bun"
import { createRequire } from "module"
import { Lock } from "../util/lock"

export namespace BunProc {
  const log = Log.create({ service: "bun" })
  const req = createRequire(import.meta.url)

  export async function run(cmd: string[], options?: Bun.SpawnOptions.OptionsObject<any, any, any>) {
    log.info("running", {
      cmd: [which(), ...cmd],
      ...options,
    })
    const result = Bun.spawn([which(), ...cmd], {
      ...options,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        ...options?.env,
        BUN_BE_BUN: "1",
      },
    })
    const code = await result.exited
    const stdout = result.stdout
      ? typeof result.stdout === "number"
        ? result.stdout
        : await readableStreamToText(result.stdout)
      : undefined
    const stderr = result.stderr
      ? typeof result.stderr === "number"
        ? result.stderr
        : await readableStreamToText(result.stderr)
      : undefined
    log.info("done", {
      code,
      stdout,
      stderr,
    })
    if (code !== 0) {
      throw new Error(`Command failed with exit code ${result.exitCode}`)
    }
    return result
  }

  export function which() {
    return process.execPath
  }

  export const InstallFailedError = NamedError.create(
    "BunInstallFailedError",
    z.object({
      pkg: z.string(),
      version: z.string(),
    }),
  )

  export async function install(pkg: string, version = "latest") {
    using _ = await Lock.write("bun-install")

    const mod = path.join(Global.Path.cache, "node_modules", pkg)
    const bundledDir = path.join(Global.Path.cache, "bundled")
    const bundledFile = path.join(bundledDir, `${pkg.replace(/\//g, "-")}.js`)
    const pkgjson = Bun.file(path.join(Global.Path.cache, "package.json"))
    const parsed = await pkgjson.json().catch(async () => {
      const result = { dependencies: {}, bundled: {} }
      await Bun.write(pkgjson.name!, JSON.stringify(result, null, 2))
      return result
    })

    const proxied = !!(
      process.env.HTTP_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.http_proxy ||
      process.env.https_proxy
    )

    const dependencies = parsed.dependencies ?? {}
    if (!parsed.dependencies) parsed.dependencies = dependencies
    const modExists = await Filesystem.exists(mod)

    // Check if already installed and bundled
    const bundledExists = await Bun.file(bundledFile).exists()
    if (dependencies[pkg] === version && bundledExists) {
      return bundledFile
    }

    // Build command arguments
    const args = [
      "add",
      "--force",
      "--exact",
      ...(proxied ? ["--no-cache"] : []),
      "--cwd",
      Global.Path.cache,
      pkg + "@" + version,
    ]

    log.info("installing package using Bun's default registry resolution", {
      pkg,
      version,
    })

    await BunProc.run(args, {
      cwd: Global.Path.cache,
    }).catch((e) => {
      throw new InstallFailedError(
        { pkg, version },
        {
          cause: e,
        },
      )
    })

    let resolvedVersion = version
    if (version === "latest") {
      const installedPkgJson = Bun.file(path.join(mod, "package.json"))
      const installedPkg = await installedPkgJson.json().catch(() => null)
      if (installedPkg?.version) {
        resolvedVersion = installedPkg.version
      }
    }

    await Bun.file(bundledDir)
      .exists()
      .then(async (exists) => {
        if (!exists) await Bun.$`mkdir -p ${bundledDir}`
      })

    const installedPkgJson = Bun.file(path.join(mod, "package.json"))
    const installedPkg = await installedPkgJson.json().catch(() => ({}))
    const entryPoint = installedPkg.main || "index.js"
    const entryPath = path.join(mod, entryPoint)

    log.info("bundling plugin for compiled binary compatibility", {
      pkg,
      entryPath,
      bundledFile,
    })

    try {
      const result = await Bun.build({
        entrypoints: [entryPath],
        outdir: bundledDir,
        naming: `${pkg.replace(/\//g, "-")}.js`,
        target: "bun",
        format: "esm",
        packages: "bundle",
      })

      if (!result.success) {
        log.error("failed to bundle plugin", {
          pkg,
          logs: result.logs,
        })
        return mod
      }

      await copyPluginAssets(mod, bundledDir)
      await copyPluginAssets(mod, Global.Path.cache)
    } catch (e) {
      log.error("failed to bundle plugin", {
        pkg,
        error: (e as Error).message,
      })
      return mod
    }

    parsed.dependencies[pkg] = resolvedVersion
    if (!parsed.bundled) parsed.bundled = {}
    parsed.bundled[pkg] = bundledFile
    await Bun.write(pkgjson.name!, JSON.stringify(parsed, null, 2))
    return bundledFile
  }

  async function copyPluginAssets(pluginDir: string, targetDir: string) {
    const assetExtensions = [".html", ".css", ".json", ".txt", ".svg", ".png", ".jpg", ".gif"]

    async function copyAssetsRecursive(srcDir: string, destDir: string) {
      const entries = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: srcDir, dot: false }))

      for (const entry of entries) {
        const ext = path.extname(entry).toLowerCase()
        if (assetExtensions.includes(ext)) {
          const srcPath = path.join(srcDir, entry)
          const destPath = path.join(destDir, path.basename(entry))

          try {
            const content = await Bun.file(srcPath).arrayBuffer()
            await Bun.write(destPath, content)
            log.info("copied plugin asset", { src: entry, dest: destPath })
          } catch (e) {
            log.error("failed to copy plugin asset", {
              src: srcPath,
              dest: destPath,
              error: (e as Error).message,
            })
          }
        }
      }
    }

    await copyAssetsRecursive(pluginDir, targetDir)
  }
}
