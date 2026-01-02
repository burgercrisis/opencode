import { createEffect, createSignal, createResource, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { persisted } from "@/utils/persist"
import { useGlobalSync } from "./global-sync"
import { usePlatform } from "./platform"
import { FileThemeStorage, LocalStorageThemeStorage, type ThemeStorage } from "@/utils/theme-storage"
import type { CustomTheme } from "@/components/dialog-theme-editor"

export interface GUITheme {
  id: string
  name: string
  description: string
  isCustom?: boolean
  previewColors?: {
    primary: string
    secondary: string
    background: string
    surface: string
  }
}

export const GUI_THEMES: GUITheme[] = [
  {
    id: "oc-1",
    name: "OpenCode",
    description: "Default smoke-based theme",
    previewColors: {
      primary: "var(--surface-brand-base)",
      secondary: "var(--surface-info-base)",
      background: "var(--background-base)",
      surface: "var(--surface-base)",
    }
  },
  {
    id: "oc-2-paper",
    name: "Paper",
    description: "Ink-based theme with paper-like colors",
    previewColors: {
      primary: "var(--surface-brand-base)",
      secondary: "var(--surface-info-base)",
      background: "var(--background-base)",
      surface: "var(--surface-base)",
    }
  }
]

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: "Theme",
  init: () => {
    const platform = usePlatform()
    const globalSync = useGlobalSync()

    // Choose storage mechanism based on platform
    const storage: ThemeStorage = platform.platform === "tauri"
      ? new FileThemeStorage(platform, globalSync)
      : new LocalStorageThemeStorage()

    const [store, setStore, _, ready] = persisted(
      "theme.v1",
      createStore<{
        current: string
        mode: "auto" | "light" | "dark"
        customThemes: CustomTheme[]
      }>({
        current: "oc-1",
        mode: "auto",
        customThemes: [],
      })
    )

    // Load custom themes from persistent storage on mount
    const [themesResource] = createResource(async () => {
      if (!ready()) return []
      try {
        return await storage.loadCustomThemes()
      } catch (error) {
        console.warn("Failed to load custom themes from storage:", error)
        return []
      }
    })

    // Sync custom themes between storage and state
    createEffect(() => {
      if (!themesResource() || !ready()) return
      setStore("customThemes", themesResource() || [])
    })

    // Apply theme to document
    createEffect(() => {
      if (!ready()) return

      // Remove existing theme attributes
      document.documentElement.removeAttribute("data-theme")
      document.documentElement.removeAttribute("data-theme-mode")

      // Apply custom theme CSS if needed
      const customTheme = store.customThemes.find((t: CustomTheme) => t.id === store.current)
      if (customTheme) {
        applyCustomTheme(customTheme)
      } else if (store.current !== "oc-1") {
        document.documentElement.setAttribute("data-theme", store.current)
      }

      if (store.mode !== "auto") {
        document.documentElement.setAttribute("data-theme-mode", store.mode)
      }
    })

    const applyCustomTheme = (customTheme: CustomTheme) => {
      // Remove existing custom theme styles
      const existingStyle = document.getElementById("custom-theme-styles")
      if (existingStyle) {
        existingStyle.remove()
      }

      // Generate hover variants by adjusting opacity
      const addAlpha = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        return `rgba(${r}, ${g}, ${b}, ${alpha})`
      }

      // Create custom theme styles
      const style = document.createElement("style")
      style.id = "custom-theme-styles"
      style.textContent = `
        [data-theme="${customTheme.id}"] {
          --surface-brand-base: ${customTheme.colors.primary};
          --surface-info-base: ${customTheme.colors.secondary};
          --surface-brand-hover: ${addAlpha(customTheme.colors.primary, 0.8)};
          --surface-info-hover: ${addAlpha(customTheme.colors.secondary, 0.8)};
          --background-base: ${customTheme.colors.background};
          --surface-base: ${customTheme.colors.surface};
          --text-base: ${customTheme.colors.text};
          --text-weak: ${customTheme.colors.textWeak};
          --border-base: ${customTheme.colors.border};
          --surface-success-base: ${customTheme.colors.success};
          --surface-warning-base: ${customTheme.colors.warning};
          --surface-critical-base: ${customTheme.colors.error};
          --surface-success-hover: ${addAlpha(customTheme.colors.success, 0.8)};
          --surface-warning-hover: ${addAlpha(customTheme.colors.warning, 0.8)};
          --surface-critical-hover: ${addAlpha(customTheme.colors.error, 0.8)};
        }
      `
      document.head.appendChild(style)
      document.documentElement.setAttribute("data-theme", customTheme.id)
    }

    // Detect system preference for auto mode
    const getSystemTheme = () => {
      if (typeof window === "undefined") return "light"
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    }

    // Listen for system theme changes
    if (typeof window !== "undefined") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (store.mode === "auto") {
          document.documentElement.removeAttribute("data-theme-mode")
        }
      })
    }

    return {
      themes() {
        const customThemes = store.customThemes.map((theme: CustomTheme) => ({
          ...theme,
          isCustom: true,
          previewColors: {
            primary: theme.colors.primary,
            secondary: theme.colors.secondary,
            background: theme.colors.background,
            surface: theme.colors.surface,
          }
        }))
        return [...GUI_THEMES, ...customThemes]
      },
      customThemes() {
        return store.customThemes
      },
      current() {
        return store.current
      },
      mode() {
        return store.mode
      },
      effectiveMode() {
        if (store.mode === "auto") {
          return getSystemTheme()
        }
        return store.mode
      },
      setTheme(themeId: string) {
        setStore("current", themeId)
      },
      setMode(mode: "auto" | "light" | "dark") {
        setStore("mode", mode)
      },
      toggleTheme() {
        const allThemes = [...GUI_THEMES, ...store.customThemes]
        const themeIds = allThemes.map(t => t.id)
        const currentIndex = themeIds.indexOf(store.current)
        const nextIndex = (currentIndex + 1) % themeIds.length
        setStore("current", themeIds[nextIndex])
      },
      toggleMode() {
        const modes: ("auto" | "light" | "dark")[] = ["auto", "light", "dark"]
        const currentIndex = modes.indexOf(store.mode)
        const nextIndex = (currentIndex + 1) % modes.length
        setStore("mode", modes[nextIndex])
      },
      saveCustomTheme: async (customTheme: CustomTheme) => {
        try {
          await storage.saveCustomTheme(customTheme)

          // Update local state
          const currentCustomThemes = store.customThemes
          const existingIndex = currentCustomThemes.findIndex((t: CustomTheme) => t.id === customTheme.id)

          if (existingIndex >= 0) {
            setStore("customThemes", existingIndex, customTheme)
          } else {
            setStore("customThemes", [...currentCustomThemes, customTheme])
          }
        } catch (error) {
          console.error("Failed to save custom theme:", error)
          throw error
        }
      },
      deleteCustomTheme: async (themeId: string) => {
        try {
          await storage.deleteCustomTheme(themeId)

          // Update local state
          const currentCustomThemes = store.customThemes
          const filteredThemes = currentCustomThemes.filter((t: CustomTheme) => t.id !== themeId)
          setStore("customThemes", filteredThemes)

          // Switch to default theme if deleting current theme
          if (store.current === themeId) {
            setStore("current", "oc-1")
          }
        } catch (error) {
          console.error("Failed to delete custom theme:", error)
          throw error
        }
      },
      exportCustomTheme: async (themeId: string) => {
        try {
          const theme = store.customThemes.find((t: CustomTheme) => t.id === themeId)
          if (!theme) return null

          return await storage.exportTheme(theme)
        } catch (error) {
          console.error("Failed to export theme:", error)
          return null
        }
      },
      importCustomTheme: async (themeData: any) => {
        try {
          const theme = await storage.importTheme(JSON.stringify(themeData))
          if (!theme) return null

          await storage.saveCustomTheme(theme)

          // Update local state
          setStore("customThemes", [...store.customThemes, theme])
          return theme
        } catch (error) {
          console.error("Failed to import theme:", error)
          return null
        }
      },
    }
  },
})
