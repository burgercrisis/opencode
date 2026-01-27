import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js"
import { createSimpleContext } from "@opencode-ai/ui/context"

export interface ThemeContextValue {
  theme: string | undefined
  isDark: boolean
  setTheme: (themeName: string) => void
  setDarkMode: (isDark: boolean) => void
}

const themes = ["opencode", "tokyonight", "ayu", "nord", "catppuccin"]

export const { use: useTheme, provider: ThemeProvider, _init, ctx: ThemeContext } = createSimpleContext({
  name: "Theme",
  init: (props: { defaultTheme?: string; defaultDarkMode?: boolean }) => {
    const [theme, setThemeSignal] = createSignal<string | undefined>()
    const [isDark, setIsDark] = createSignal(props.defaultDarkMode ?? false)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "t" && event.ctrlKey) {
        event.preventDefault()
        const current = theme()
        if (!current) return
        const index = themes.indexOf(current)
        const next = themes[(index + 1) % themes.length]
        setTheme(next)
      }
    }

    onMount(() => {
      window.addEventListener("keydown", handleKeyDown)
    })

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown)
    })

    onMount(() => {
      const savedTheme = localStorage.getItem("theme") ?? "opencode"
      const savedDarkMode = localStorage.getItem("darkMode") ?? "true"
      setIsDark(savedDarkMode === "true")
      setTheme(savedTheme)
    })

    createEffect(() => {
      const currentTheme = theme()
      const darkMode = isDark()
      if (currentTheme) {
        document.documentElement.setAttribute("data-theme", currentTheme)
        document.documentElement.setAttribute("data-dark", darkMode.toString())
      }
    })

    const setTheme = async (theme: string) => {
      setThemeSignal(theme)
      localStorage.setItem("theme", theme)
    }

    const setDarkMode = (dark: boolean) => {
      setIsDark(dark)
      localStorage.setItem("darkMode", dark.toString())
    }

    return {
      get theme() { return theme() },
      get isDark() { return isDark() },
      setTheme,
      setDarkMode,
    }
  }
})
