import { describe, it, expect, beforeEach, mock } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createRoot, createComponent, createEffect, type ParentProps } from "solid-js"
import { render } from "solid-js/web"

// Register Happy DOM
try {
  GlobalRegistrator.register()
} catch (e) {
  // Ignore already registered
}

// Mock browser APIs
const storage: Record<string, string> = {}
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, value: string) => (storage[key] = value),
    removeItem: (key: string) => delete storage[key],
    clear: () => {
      for (const key in storage) delete storage[key]
    },
  },
  writable: true,
})

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
})

// Import providers directly to avoid index.ts which imports everything
import { LanguageProvider, useLanguage } from "./language"
import { ThemeProvider, useTheme } from "./theme"
import { PlatformProvider, type Platform, usePlatform } from "./platform"

mock.module("./platform", () => ({
  PlatformProvider: PlatformProvider,
  usePlatform: () => ({
    platform: "web",
    openLink: () => {},
    restart: async () => {},
    notify: async () => {},
  })
}))

function TestComponent() {
  const language = useLanguage()
  const theme = useTheme()

  const container = document.createElement("div")
  
  const localeDisplay = document.createElement("div")
  localeDisplay.id = "locale-display"
  container.appendChild(localeDisplay)

  const themeDisplay = document.createElement("div")
  themeDisplay.id = "theme-display"
  container.appendChild(themeDisplay)

  const setZhBtn = document.createElement("button")
  setZhBtn.id = "set-zh"
  setZhBtn.onclick = () => language.setLocale("zh")
  container.appendChild(setZhBtn)

  const setTokyoBtn = document.createElement("button")
  setTokyoBtn.id = "set-tokyo"
  setTokyoBtn.onclick = () => theme.setTheme("tokyonight")
  container.appendChild(setTokyoBtn)

  // Update displays reactively
  createEffect(() => {
    localeDisplay.textContent = language.locale()
    themeDisplay.textContent = theme.theme || ""
  })

  return container
}

describe("UI Provider Stack Smoke Test (Isolated, No JSX)", () => {
  beforeEach(() => {
    document.documentElement.lang = "en"
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.colorScheme
    window.localStorage.clear()
    document.body.innerHTML = '<div id="root"></div>'
  })

  it("should sync language and theme across the provider stack", async () => {
    const root = document.getElementById("root")!
    
    const dispose = render(() => {
      const platformValue: Platform = {
        platform: "web",
        openLink: () => {},
        restart: async () => {},
        notify: async () => {},
      }
      const platformInit = PlatformProvider._init({ value: platformValue })
      const themeValue = ThemeProvider._init({ defaultTheme: "oc-1" })
      const languageValue = LanguageProvider._init()

      return createComponent(PlatformProvider.ctx.Provider, {
        value: platformInit,
        get children() {
          return createComponent(ThemeProvider.ctx.Provider, {
            value: themeValue,
            get children() {
              return createComponent(LanguageProvider.ctx.Provider, {
                value: languageValue,
                get children() {
                  return createComponent(TestComponent, {})
                }
              })
            }
          })
        }
      })
    }, root)

    // Check initial state
    expect(document.documentElement.lang).toBe("en")
    
    // Switch language
    const langBtn = document.getElementById("set-zh")
    langBtn?.click()

    // Language provider updates document.documentElement.lang
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(document.documentElement.lang).toBe("zh")
    expect(document.getElementById("locale-display")?.textContent).toBe("zh")

    // Theme switching
    const themeBtn = document.getElementById("set-tokyo")
    themeBtn?.click()

    await new Promise(resolve => setTimeout(resolve, 100))
    expect(document.documentElement.getAttribute("data-theme")).toBe("tokyonight")
    expect(document.getElementById("theme-display")?.textContent).toBe("tokyonight")

    dispose()
  })
})
