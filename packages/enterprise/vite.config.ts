import { defineConfig, PluginOption } from "vite"
import { solidStart } from "@solidjs/start/config"
import { nitro } from "nitro/vite"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename).replace(/\\/g, "/")

import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

const fixWindowsMangledPaths = (): PluginOption => ({
  name: "fix-windows-mangled-paths",
  enforce: "pre",
  resolveId(id) {
    if (id.includes("solidjs") && (id.includes("server-runtime") || id.includes("dist/client/mount"))) {
      const pkgPath = "node_modules/.bun/@solidjs+start@https+++pkg.pr.new+@solidjs+start@dfb2020+813a6f58bb062b5c/node_modules/@solidjs/start"
      const subPath = id.includes("server-runtime") ? "dist/server/server-runtime.js" : "dist/client/mount.js"
      const runtimePath = resolve(__dirname, "../../", pkgPath, subPath).replace(/\\/g, "/")
      return { id: runtimePath }
    }
    return null
  }
})

const nitroConfig: any = (() => {
  const target = process.env.OPENCODE_DEPLOYMENT_TARGET
  if (target === "cloudflare") {
    return {
      compatibilityDate: "2024-09-19",
      preset: "cloudflare_module",
      cloudflare: {
        nodeCompat: true,
      },
    }
  }
  return {}
})()

export default defineConfig({
  plugins: [
    fixWindowsMangledPaths(),
    tailwindcss(),
    solidStart({
      ssr: true,
    }) as PluginOption,
    nitro({
      ...nitroConfig,
      baseURL: process.env.OPENCODE_BASE_URL,
    }),
  ],
  resolve: {
    alias: {
      "~": resolve(__dirname, "src").replace(/\\/g, "/"),
      "@solidjs/start/server-runtime": resolve(__dirname, "../../node_modules/@solidjs/start/dist/server/server-runtime.js").replace(/\\/g, "/"),
    },
  },
  ssr: {
    noExternal: ["@solidjs/start"],
  },
  build: {
    rollupOptions: {
      external: [
        "cloudflare:workers",
        "node:path",
        "node:url",
        "node:fs",
        "node:os",
        "node:crypto",
        "node:events",
        "node:stream",
        "node:util",
        "node:buffer",
        "solid-js/web",
      ],
      onwarn(warning, warn) {
        if (warning.code === "CIRCULAR_DEPENDENCY") return
        warn(warning)
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  worker: {
    format: "es",
  },
})
