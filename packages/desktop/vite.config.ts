import { defineConfig } from "vite"
import appPlugin from "@opencode-ai/app/vite"
<<<<<<< HEAD
import { fileURLToPath } from "url"
import path from "path"
=======
>>>>>>> upstream/dev

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig({
<<<<<<< HEAD
  plugins: [
    appPlugin,
    {
      name: "desktop:ui-resolve",
      config() {
        return {
          resolve: {
            alias: {
              "@": fileURLToPath(new URL("./src", import.meta.url)),
              // Add direct path aliases for UI package modules
              "@opencode-ai/ui/context/diff": fileURLToPath(new URL("../ui/src/context/diff.tsx", import.meta.url)),
              "@opencode-ai/ui/context/code": fileURLToPath(new URL("../ui/src/context/code.tsx", import.meta.url)),
              "@opencode-ai/ui/diff": fileURLToPath(new URL("../ui/src/components/diff.tsx", import.meta.url)),
              "@opencode-ai/ui/code": fileURLToPath(new URL("../ui/src/components/code.tsx", import.meta.url)),
              "@opencode-ai/ui/font": fileURLToPath(new URL("../ui/src/components/font.tsx", import.meta.url)),
              "@opencode-ai/ui/theme": fileURLToPath(new URL("../ui/src/theme/index.ts", import.meta.url)),
              "@opencode-ai/ui/context/dialog": fileURLToPath(new URL("../ui/src/context/dialog.tsx", import.meta.url)),
              "@opencode-ai/ui/context": fileURLToPath(new URL("../ui/src/context/index.ts", import.meta.url)),
            },
          },
        }
      },
    },
  ],
=======
  plugins: [appPlugin],
>>>>>>> upstream/dev
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
<<<<<<< HEAD
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 8081,
=======
  esbuild: {
    // Improves production stack traces
    keepNames: true,
  },
  // build: {
  // sourcemap: true,
  // },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
>>>>>>> upstream/dev
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
<<<<<<< HEAD
        protocol: "ws",
        host,
        port: 1423,
      }
=======
          protocol: "ws",
          host,
          port: 1421,
        }
>>>>>>> upstream/dev
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
})
