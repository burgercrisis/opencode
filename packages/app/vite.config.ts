import { defineConfig } from "vite"
import desktopPlugin from "./vite"

export default defineConfig({
  plugins: [desktopPlugin] as any,
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    port: 3000,
  },
  build: {
    target: "esnext",
    rollupOptions: {
      external: [
        "@opencode-ai/core/util/binary",
        "@opencode-ai/core/util/encode",
        "@opencode-ai/core/util/path",
        "@opencode-ai/core/util/array",
        "@opencode-ai/core/util/retry",
      ]
    }
  },
})
