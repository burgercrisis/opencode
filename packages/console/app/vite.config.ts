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
    if (id.includes("solidjs") && (id.includes("server-runtime") || id.includes("dist/client/mount") || id.includes("server-fns-runtime"))) {
      const pkgPath = "node_modules/.bun/@solidjs+start@https+++pkg.pr.new+@solidjs+start@dfb2020+813a6f58bb062b5c/node_modules/@solidjs/start"
      let subPath = ""
      if (id.includes("server-runtime")) subPath = "dist/server/server-runtime.js"
      else if (id.includes("dist/client/mount")) subPath = "dist/client/mount.js"
      else if (id.includes("server-fns-runtime")) subPath = "dist/server/server-fns-runtime.js"
      
      const runtimePath = resolve(__dirname, "../../../", pkgPath, subPath).replace(/\\/g, "/")
      return { id: runtimePath }
    }
    return null
  }
})

export default defineConfig({
  plugins: [
    fixWindowsMangledPaths(),
    {
      name: "fix-invalid-define",
      enforce: "post",
      config(config) {
        config.define = config.define || {};
        const appPath = resolve(__dirname, "src/app.tsx").replace(/\\/g, "/");
        config.define["import.meta.env.START_APP_ENTRY"] = JSON.stringify(appPath);
      },
      configResolved(config) {
        if (config.define) {
          for (const key in config.define) {
            const val = config.define[key];
            if (typeof val === "string" && val.includes("\\")) {
              const sanitized = val.replace(/\\/g, "/");
              if (val.startsWith('"') && val.endsWith('"')) {
                config.define[key] = sanitized;
              } else {
                config.define[key] = JSON.stringify(sanitized);
              }
            }
          }
        }
      },
      transform(code, id) {
        if (id.includes("solidjs") && (id.includes("server-runtime") || id.includes("dist/client/mount"))) {
          const appPath = resolve(__dirname, "src/app.tsx").replace(/\\/g, "/")
          const mangledPath = resolve(__dirname, "src/app.tsx")
          return code.split(mangledPath).join(appPath).split(mangledPath.replace(/\\/g, "\\\\")).join(appPath)
        }
      }
    },
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
