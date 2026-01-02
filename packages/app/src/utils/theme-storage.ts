import { createSignal, createEffect, onMount } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useGlobalSync } from "@/context/global-sync"
import type { CustomTheme } from "@/components/dialog-theme-editor"

export interface ThemeStorage {
  loadCustomThemes(): Promise<CustomTheme[]>
  saveCustomThemes(themes: CustomTheme[]): Promise<void>
  saveCustomTheme(theme: CustomTheme): Promise<void>
  deleteCustomTheme(themeId: string): Promise<void>
  exportTheme(theme: CustomTheme): Promise<string>
  importTheme(jsonData: string): Promise<CustomTheme | null>
}

export class FileThemeStorage implements ThemeStorage {
  private platform: ReturnType<typeof usePlatform>
  private globalSync: ReturnType<typeof useGlobalSync>
  private customThemesPath = ".opencode/themes"
  private customThemesFile = "custom-gui-themes.json"

  constructor(platform: ReturnType<typeof usePlatform>, globalSync: ReturnType<typeof useGlobalSync>) {
    this.platform = platform
    this.globalSync = globalSync
  }

  private async getCustomThemesFile(): Promise<string> {
    try {
      // Try to read from project .opencode directory first
      const projectThemes = await this.readThemesFile(this.customThemesPath)
      if (projectThemes) return projectThemes

      // Fallback to user config directory
      const configPath = await this.getConfigDir()
      if (configPath) {
        const userThemes = await this.readThemesFile(`${configPath}/themes`)
        if (userThemes) return userThemes
      }

      return "[]"
    } catch (error) {
      console.warn("Failed to load custom themes file:", error)
      return "[]"
    }
  }

  private async readThemesFile(dirPath: string): Promise<string | null> {
    try {
      const sdk = this.globalSync.sdk
      const result = await sdk.file.read({
        path: `${dirPath}/${this.customThemesFile}`
      })
      return result.data?.content || null
    } catch (error) {
      return null
    }
  }

  private async writeThemesFile(dirPath: string, content: string): Promise<void> {
    try {
      const sdk = this.globalSync.sdk

      // Ensure directory exists
      // TODO: Implement directory creation when SDK supports it
      // try {
      //   await sdk.file.mkdir({ path: dirPath, recursive: true })
      // } catch (error) {
      //   // Directory might already exist
      // }

      // Write themes file
      // TODO: Implement file write when SDK supports it
      // await sdk.file.write({
      //   path: `${dirPath}/${this.customThemesFile}`,
      //   content
      // })

      // For now, just log the content
      console.log('Would write themes file:', content)
    } catch (error) {
      console.error("Failed to write themes file:", error)
    }
  }

  private async getConfigDir(): Promise<string | null> {
    try {
      const sdk = this.globalSync.sdk
      // TODO: Implement config directory retrieval when SDK supports it
      // const configResult = await sdk.app.config()
      // return configResult.data?.configDir || null

      // For now, return a default path
      return ".opencode"
    } catch (error) {
      console.warn("Failed to get config directory:", error)
      return null
    }
  }

  async loadCustomThemes(): Promise<CustomTheme[]> {
    try {
      const fileContent = await this.getCustomThemesFile()
      const themes = JSON.parse(fileContent)
      return Array.isArray(themes) ? themes : []
    } catch (error) {
      console.warn("Failed to parse custom themes:", error)
      return []
    }
  }

  async saveCustomThemes(themes: CustomTheme[]): Promise<void> {
    const fileContent = JSON.stringify(themes, null, 2)

    // Try to save to project directory first
    try {
      await this.writeThemesFile(this.customThemesPath, fileContent)
      return
    } catch (error) {
      console.warn("Failed to save to project directory, trying user config:", error)
    }

    // Fallback to user config directory
    const configDir = await this.getConfigDir()
    if (configDir) {
      await this.writeThemesFile(`${configDir}/themes`, fileContent)
    } else {
      throw new Error("No suitable directory found for saving themes")
    }
  }

  async saveCustomTheme(theme: CustomTheme): Promise<void> {
    const themes = await this.loadCustomThemes()
    const existingIndex = themes.findIndex(t => t.id === theme.id)

    if (existingIndex >= 0) {
      themes[existingIndex] = theme
    } else {
      themes.push(theme)
    }

    await this.saveCustomThemes(themes)
  }

  async deleteCustomTheme(themeId: string): Promise<void> {
    const themes = await this.loadCustomThemes()
    const filteredThemes = themes.filter(t => t.id !== themeId)
    await this.saveCustomThemes(filteredThemes)
  }

  async exportTheme(theme: CustomTheme): Promise<string> {
    return JSON.stringify({
      ...theme,
      version: "1.0",
      exportedAt: new Date().toISOString(),
      exportedBy: "OpenCode GUI Theme Editor"
    }, null, 2)
  }

  async importTheme(jsonData: string): Promise<CustomTheme | null> {
    try {
      const parsed = JSON.parse(jsonData)

      // Validate basic structure
      if (!parsed.id || !parsed.name || !parsed.colors) {
        throw new Error("Invalid theme format")
      }

      const theme: CustomTheme = {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description || "",
        colors: {
          primary: parsed.colors.primary || "#3b82f6",
          secondary: parsed.colors.secondary || "#64748b",
          accent: parsed.colors.accent || "#f59e0b",
          background: parsed.colors.background || "#ffffff",
          surface: parsed.colors.surface || "#f8fafc",
          text: parsed.colors.text || "#0f172a",
          textWeak: parsed.colors.textWeak || "#64748b",
          border: parsed.colors.border || "#e2e8f0",
          success: parsed.colors.success || "#10b981",
          warning: parsed.colors.warning || "#f59e0b",
          error: parsed.colors.error || "#ef4444",
          info: parsed.colors.info || "#3b82f6",
        }
      }

      return theme
    } catch (error) {
      console.error("Failed to import theme:", error)
      return null
    }
  }
}

export class LocalStorageThemeStorage implements ThemeStorage {
  private storageKey = "opencode-custom-themes"

  async loadCustomThemes(): Promise<CustomTheme[]> {
    try {
      const stored = localStorage.getItem(this.storageKey)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.warn("Failed to load themes from localStorage:", error)
      return []
    }
  }

  async saveCustomThemes(themes: CustomTheme[]): Promise<void> {
    localStorage.setItem(this.storageKey, JSON.stringify(themes))
  }

  async saveCustomTheme(theme: CustomTheme): Promise<void> {
    const themes = await this.loadCustomThemes()
    const existingIndex = themes.findIndex(t => t.id === theme.id)

    if (existingIndex >= 0) {
      themes[existingIndex] = theme
    } else {
      themes.push(theme)
    }

    await this.saveCustomThemes(themes)
  }

  async deleteCustomTheme(themeId: string): Promise<void> {
    const themes = await this.loadCustomThemes()
    const filteredThemes = themes.filter(t => t.id !== themeId)
    await this.saveCustomThemes(filteredThemes)
  }

  async exportTheme(theme: CustomTheme): Promise<string> {
    return JSON.stringify({
      ...theme,
      version: "1.0",
      exportedAt: new Date().toISOString(),
      exportedBy: "OpenCode GUI Theme Editor"
    }, null, 2)
  }

  async importTheme(jsonData: string): Promise<CustomTheme | null> {
    try {
      const parsed = JSON.parse(jsonData)

      if (!parsed.id || !parsed.name || !parsed.colors) {
        throw new Error("Invalid theme format")
      }

      const theme: CustomTheme = {
        id: parsed.id,
        name: parsed.name,
        description: parsed.description || "",
        colors: {
          primary: parsed.colors.primary || "#3b82f6",
          secondary: parsed.colors.secondary || "#64748b",
          accent: parsed.colors.accent || "#f59e0b",
          background: parsed.colors.background || "#ffffff",
          surface: parsed.colors.surface || "#f8fafc",
          text: parsed.colors.text || "#0f172a",
          textWeak: parsed.colors.textWeak || "#64748b",
          border: parsed.colors.border || "#e2e8f0",
          success: parsed.colors.success || "#10b981",
          warning: parsed.colors.warning || "#f59e0b",
          error: parsed.colors.error || "#ef4444",
          info: parsed.colors.info || "#3b82f6",
        }
      }

      return theme
    } catch (error) {
      console.error("Failed to import theme:", error)
      return null
    }
  }
}
