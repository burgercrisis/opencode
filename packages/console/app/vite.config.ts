import { defineConfig, PluginOption } from "vite"
import { solidStart } from "@solidjs/start/config"
import { nitro } from "nitro/vite"
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
    if (id.includes("solidjs") && id.includes("server-runtime")) {
      const runtimePath = resolve(__dirname, "../../../node_modules/.bun/@solidjs+start@https+++pkg.pr.new+@solidjs+start@dfb2020+813a6f58bb062b5c/node_modules/@solidjs/start/dist/server/server-runtime.js").replace(/\\/g, "/")
      return runtimePath
    }
    return null
  },
})

export default defineConfig({
  plugins: [
    fixWindowsMangledPaths(),
    solidStart({
      ssr: true,
    }) as PluginOption,
    nitro({
      compatibilityDate: "2024-09-19",
      preset: "cloudflare_module",
      cloudflare: {
        nodeCompat: true,
      },
    }),
  ],
  server: {
    allowedHosts: true,
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
      ],
    },
    minify: false,
  },
  resolve: {
    alias: {
      "~": resolve(__dirname, "src").replace(/\\/g, "/"),
      "@solidjs/start/server-runtime": resolve(__dirname, "../../../node_modules/@solidjs/start/dist/server/server-runtime.js").replace(/\\/g, "/"),
    },
  },
  ssr: {
    noExternal: ["@solidjs/start"],
  },
})
