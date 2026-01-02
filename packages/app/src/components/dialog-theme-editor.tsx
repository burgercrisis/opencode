import { Component, createSignal, For, Show } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { Icon } from "@opencode-ai/ui/icon"

export interface CustomTheme {
  id: string
  name: string
  description?: string
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    surface: string
    text: string
    textWeak: string
    border: string
    success: string
    warning: string
    error: string
    info: string
  }
}

interface DialogThemeEditorProps {
  theme?: CustomTheme
  onSave: (theme: CustomTheme) => void
  onCancel: () => void
}

export const DialogThemeEditor: Component<DialogThemeEditorProps> = (props) => {
  const [theme, setTheme] = createSignal<CustomTheme>(
    props.theme || {
      id: `custom-${Date.now()}`,
      name: "Custom Theme",
      description: "",
      colors: {
        primary: "#3b82f6",
        secondary: "#64748b",
        accent: "#f59e0b",
        background: "#ffffff",
        surface: "#f8fafc",
        text: "#0f172a",
        textWeak: "#64748b",
        border: "#e2e8f0",
        success: "#10b981",
        warning: "#f59e0b",
        error: "#ef4444",
        info: "#3b82f6",
      }
    }
  )

  const updateColor = (colorKey: keyof CustomTheme["colors"], value: string) => {
    setTheme(prev => ({
      ...prev,
      colors: {
        ...prev.colors,
        [colorKey]: value
      }
    }))
  }

  const updateField = (field: keyof CustomTheme, value: string) => {
    setTheme(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null
  }

  const getLuminance = (hex: string) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return 0

    const { r, g, b } = rgb
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }

  const getContrastRatio = (color1: string, color2: string) => {
    const lum1 = getLuminance(color1)
    const lum2 = getLuminance(color2)
    const brightest = Math.max(lum1, lum2)
    const darkest = Math.min(lum1, lum2)
    return (brightest + 0.05) / (darkest + 0.05)
  }

  const getContrastScore = (contrast: number) => {
    if (contrast >= 7) return { text: "AAA", color: "text-success-strong" }
    if (contrast >= 4.5) return { text: "AA", color: "text-warning-strong" }
    return { text: "Fail", color: "text-critical-strong" }
  }

  const colorGroups = [
    {
      title: "Primary Colors",
      colors: [
        { key: "primary" as keyof CustomTheme["colors"], label: "Primary", description: "Main brand color" },
        { key: "secondary" as keyof CustomTheme["colors"], label: "Secondary", description: "Supporting color" },
        { key: "accent" as keyof CustomTheme["colors"], label: "Accent", description: "Highlight color" },
      ]
    },
    {
      title: "Surface Colors",
      colors: [
        { key: "background" as keyof CustomTheme["colors"], label: "Background", description: "Page background" },
        { key: "surface" as keyof CustomTheme["colors"], label: "Surface", description: "Cards and panels" },
        { key: "border" as keyof CustomTheme["colors"], label: "Border", description: "Dividers and borders" },
      ]
    },
    {
      title: "Text Colors",
      colors: [
        { key: "text" as keyof CustomTheme["colors"], label: "Primary Text", description: "Main text color" },
        { key: "textWeak" as keyof CustomTheme["colors"], label: "Secondary Text", description: "Muted text" },
      ]
    },
    {
      title: "Status Colors",
      colors: [
        { key: "success" as keyof CustomTheme["colors"], label: "Success", description: "Success states" },
        { key: "warning" as keyof CustomTheme["colors"], label: "Warning", description: "Warning states" },
        { key: "error" as keyof CustomTheme["colors"], label: "Error", description: "Error states" },
        { key: "info" as keyof CustomTheme["colors"], label: "Info", description: "Information states" },
      ]
    }
  ]

  return (
    <Dialog title={props.theme ? "Edit Theme" : "Create Theme"}>
      <div class="space-y-6 max-h-[80vh] overflow-y-auto">
        {/* Basic Info */}
        <div class="space-y-4">
          <h3 class="text-text-base font-medium">Theme Information</h3>
          <div class="grid grid-cols-2 gap-4">
            <TextField
              label="Theme Name"
              value={theme().name}
              onChange={(value) => updateField("name", value)}
              placeholder="Enter theme name"
            />
            <TextField
              label="Theme ID"
              value={theme().id}
              onChange={(value) => updateField("id", value)}
              placeholder="unique-theme-id"
            />
          </div>
          <TextField
            label="Description"
            value={theme().description || ""}
            onChange={(value) => updateField("description", value)}
            placeholder="Optional theme description"
          />
        </div>

        {/* Color Editor */}
        <div class="space-y-6">
          <For each={colorGroups}>
            {group => (
              <div class="space-y-3">
                <h4 class="text-text-base font-medium">{group.title}</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <For each={group.colors}>
                    {colorConfig => {
                      const currentTheme = theme()
                      const currentColor = currentTheme.colors[colorConfig.key]
                      const bgContrast = getContrastRatio(currentColor, currentTheme.colors.background)
                      const textContrast = getContrastRatio(currentTheme.colors.background, currentColor)
                      const bgScore = getContrastScore(bgContrast)
                      const textScore = getContrastScore(textContrast)

                      return (
                        <div class="space-y-2">
                          <div class="flex items-center justify-between">
                            <label class="text-sm font-medium">{colorConfig.label}</label>
                            <div class="flex items-center gap-2">
                              <div
                                class="w-6 h-6 rounded border border-border-weak-base"
                                style={`background-color: ${currentColor}`}
                              />
                              <span class="text-xs text-text-weak">{currentColor}</span>
                            </div>
                          </div>
                          <input
                            type="color"
                            value={currentColor}
                            onChange={(e) => updateColor(colorConfig.key, e.target.value)}
                            class="w-full h-10 rounded cursor-pointer"
                          />
                          <div class="text-xs text-text-weak">{colorConfig.description}</div>

                          {/* Accessibility Checks */}
                          <Show when={colorConfig.key === "text" || colorConfig.key === "textWeak"}>
                            <div class="flex items-center justify-between text-xs">
                              <span>Contrast vs Background:</span>
                              <span class={`font-medium ${textScore.color}`}>
                                {textScore.text} ({textContrast.toFixed(2)}:1)
                              </span>
                            </div>
                          </Show>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>

        {/* Live Preview */}
        <div class="space-y-3">
          <h4 class="text-text-base font-medium">Live Preview</h4>
          <div
            class="p-4 rounded-lg border"
            style={{
              "background-color": theme().colors.background,
              "border-color": theme().colors.border,
              "color": theme().colors.text
            }}
          >
            <div class="space-y-3">
              <h5 style={{ color: theme().colors.text }}>Sample Content</h5>
              <div style={{ color: theme().colors.textWeak }}>
                This is secondary text that should be less prominent.
              </div>
              <div class="flex gap-2">
                <Button
                  size="small"
                  style={{
                    "background-color": theme().colors.primary,
                    "color": getLuminance(theme().colors.primary) > 0.5 ? "#000" : "#fff"
                  }}
                >
                  Primary Button
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  style={{
                    "color": theme().colors.secondary,
                    "border-color": theme().colors.border
                  }}
                >
                  Secondary
                </Button>
              </div>
              <div class="grid grid-cols-4 gap-2">
                <div
                  class="p-2 rounded text-xs text-center"
                  style={{
                    "background-color": theme().colors.success,
                    "color": getLuminance(theme().colors.success) > 0.5 ? "#000" : "#fff"
                  }}
                >
                  Success
                </div>
                <div
                  class="p-2 rounded text-xs text-center"
                  style={{
                    "background-color": theme().colors.warning,
                    "color": getLuminance(theme().colors.warning) > 0.5 ? "#000" : "#fff"
                  }}
                >
                  Warning
                </div>
                <div
                  class="p-2 rounded text-xs text-center"
                  style={{
                    "background-color": theme().colors.error,
                    "color": getLuminance(theme().colors.error) > 0.5 ? "#000" : "#fff"
                  }}
                >
                  Error
                </div>
                <div
                  class="p-2 rounded text-xs text-center"
                  style={{
                    "background-color": theme().colors.info,
                    "color": getLuminance(theme().colors.info) > 0.5 ? "#000" : "#fff"
                  }}
                >
                  Info
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div class="flex justify-end gap-3 pt-4 border-t border-border-weak-base">
          <Button variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button onClick={() => props.onSave(theme())}>
            {props.theme ? "Update Theme" : "Save Theme"}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
