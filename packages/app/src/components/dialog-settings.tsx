import { Component, Show, For, createSignal } from "solid-js"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { CostQualitySlider } from "./cost-quality-slider"
import { DialogSubagentConfig } from "./dialog-subagent-config"
import { useLayout } from "@/context/layout"
import { useLocal } from "@/context/local"
import { useTheme, GUI_THEMES } from "@/context/theme"
import { DialogThemeEditor, type CustomTheme } from "./dialog-theme-editor"

export const DialogSettings: Component = () => {
  const dialog = useDialog()
  const layout = useLayout()
  const local = useLocal()
  const theme = useTheme()
  const [showAdvanced, setShowAdvanced] = createSignal(false)
  const [subagentEnabled, setSubagentEnabled] = createSignal(false)
  const [qualityPreference, setQualityPreference] = createSignal(50)
  const [performanceLearning, setPerformanceLearning] = createSignal(false)

  const openThemeEditor = (themeToEdit?: CustomTheme) => {
    dialog.show(() => (
      <DialogThemeEditor
        theme={themeToEdit}
        onSave={async (savedTheme) => {
          try {
            await theme.saveCustomTheme(savedTheme)
            // Switch to the newly created/updated theme
            theme.setTheme(savedTheme.id)
          } catch (error) {
            alert(`Failed to save theme: ${error}`)
          }
        }}
        onCancel={() => dialog.close()}
      />
    ))
  }

  const deleteTheme = async (themeId: string) => {
    if (confirm("Are you sure you want to delete this custom theme?")) {
      try {
        await theme.deleteCustomTheme(themeId)
      } catch (error) {
        alert(`Failed to delete theme: ${error}`)
      }
    }
  }

  const exportTheme = async (themeId: string) => {
    try {
      const themeData = await theme.exportCustomTheme(themeId)
      if (!themeData) return

      const blob = new Blob([themeData], {
        type: "application/json"
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${(themeData as any).name.replace(/\s+/g, "-").toLowerCase()}-theme.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      alert(`Failed to export theme: ${error}`)
    }
  }

  const importTheme = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const reader = new FileReader()
        reader.onload = async (e) => {
          try {
            const themeData = JSON.parse(e.target?.result as string)
            const importedTheme = await theme.importCustomTheme(themeData)
            if (importedTheme) {
              alert(`Successfully imported theme: ${importedTheme.name}`)
            } else {
              alert("Failed to import theme. Please check the file format.")
            }
          } catch (error) {
            alert("Invalid theme file. Please ensure it's a valid JSON theme.")
          }
        }
        reader.readAsText(file)
      } catch (error) {
        alert(`Failed to read theme file: ${error}`)
      }
    }
    input.click()
  }

  const resetLayout = () => {
    ; (layout as any).setSidebar({ opened: false, width: 280 })
      ; (layout as any).setTerminal({ opened: false, height: 280 })
      ; (layout as any).setReview({ opened: true })
      ; (layout as any).setSession({ width: 600 })
  }

  const clearRecentModels = () => {
    local.model.clearRecent()
  }

  return (
    <Dialog title="Settings">
      <div class="space-y-6">
        <div class="space-y-4">
          <h3 class="text-text-base font-medium">Appearance</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span>Theme</span>
              <div class="flex gap-2">
                <select
                  class="bg-surface-weak-base text-text-base border border-border-weak-base rounded px-2 py-1 text-sm"
                  value={theme.current()}
                  onChange={(e) => theme.setTheme(e.target.value)}
                >
                  <optgroup label="Built-in Themes">
                    {GUI_THEMES.map(t => (
                      <option value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Custom Themes">
                    {theme.customThemes().map(t => (
                      <option value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                </select>
                <Button
                  size="small"
                  onClick={() => openThemeEditor()}
                >
                  <Icon name="plus-small" />
                  Create
                </Button>
              </div>
            </div>

            <Show when={theme.customThemes().length > 0}>
              <div class="space-y-2">
                <div class="text-sm font-medium">Custom Themes</div>
                <div class="space-y-2">
                  <For each={theme.customThemes()}>
                    {customTheme => (
                      <div class="flex items-center justify-between p-2 bg-surface-weak-base rounded">
                        <div class="flex items-center gap-2">
                          <div
                            class="w-4 h-4 rounded border border-border-weak-base"
                            style={`background-color: ${customTheme.colors.primary}`}
                          />
                          <span class="text-sm">{customTheme.name}</span>
                          <Show when={customTheme.description}>
                            <span class="text-xs text-text-weak">{customTheme.description}</span>
                          </Show>
                        </div>
                        <div class="flex gap-1">
                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => openThemeEditor(customTheme)}
                          >
                            <Icon name="edit-small-2" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => exportTheme(customTheme.id)}
                          >
                            <Icon name="arrow-up" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => deleteTheme(customTheme.id)}
                          >
                            <Icon name="close" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <div class="flex items-center justify-between">
              <span>Color Mode</span>
              <select
                class="bg-surface-weak-base text-text-base border border-border-weak-base rounded px-2 py-1 text-sm"
                value={theme.mode()}
                onChange={(e) => theme.setMode(e.target.value as "auto" | "light" | "dark")}
              >
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <span>Effective Mode</span>
              <span class="text-text-weak capitalize">{theme.effectiveMode()}</span>
            </div>

            <div class="flex gap-2">
              <Button
                variant="ghost"
                size="small"
                onClick={importTheme}
              >
                <Icon name="folder-add-left" />
                Import Theme
              </Button>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-text-base font-medium">Layout</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span>Sidebar Width</span>
              <span class="text-text-weak">{layout.sidebar.width()}px</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Terminal Height</span>
              <span class="text-text-weak">{layout.terminal.height()}px</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Session Width</span>
              <span class="text-text-weak">{layout.session.width()}px</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Review Panel</span>
              <span class="text-weak">{layout.review.opened() ? "Visible" : "Hidden"}</span>
            </div>
            <Button
              variant="ghost"
              size="small"
              onClick={resetLayout}
            >
              Reset Layout
            </Button>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-text-base font-medium">Model Preferences</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span>Recent Models</span>
              <span class="text-text-weak">{local.model.recent().length}</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Hidden Models</span>
              <span class="text-text-weak">
                {local.model.user().filter(m => m.visibility === "hide").length}
              </span>
            </div>
            <Button
              variant="ghost"
              size="small"
              onClick={clearRecentModels}
            >
              Clear Recent Models
            </Button>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-text-base font-medium">Agent</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span>Current Agent</span>
              <span class="text-text-weak">{local.agent.current()?.name}</span>
            </div>
            <div class="flex items-center justify-between">
              <span>Available Agents</span>
              <span class="text-text-weak">{local.agent.list().length}</span>
            </div>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-text-base font-medium">Subagent Model Selection</h3>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <div>Intelligent Subagent Models</div>
                <div class="text-xs text-text-weak">Auto-select optimal models for subagent tasks</div>
              </div>
              <input
                type="checkbox"
                checked={subagentEnabled()}
                onChange={(e) => setSubagentEnabled(e.target.checked)}
                class="w-4 h-4"
              />
            </div>

            <Show when={subagentEnabled()}>
              <div class="flex items-center justify-between">
                <span>Cost vs Quality Preference</span>
                <CostQualitySlider
                  value={qualityPreference()}
                  onChange={setQualityPreference}
                  costEstimate={(value) => {
                    // Simple cost estimation: higher quality = higher cost
                    const baseCost = 0.001
                    const multiplier = 1 + (value / 100) * 4 // 1x to 5x cost
                    return baseCost * multiplier
                  }}
                />
              </div>

              <div class="flex items-center justify-between">
                <div>
                  <div>Performance Learning</div>
                  <div class="text-xs text-text-weak">Learn from user feedback to improve model selection</div>
                </div>
                <input
                  type="checkbox"
                  checked={performanceLearning()}
                  onChange={(e) => setPerformanceLearning(e.target.checked)}
                  class="w-4 h-4"
                />
              </div>

              <div class="flex items-center justify-between">
                <span>Advanced Configuration</span>
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => {
                    const currentConfig = {
                      enabled: subagentEnabled(),
                      global_allowlist: [],
                      default_behavior: "inherit" as const,
                      quality_preference: qualityPreference(),
                      task_specific_overrides: {},
                      performance_learning: {
                        enabled: performanceLearning(),
                        adaptation_rate: 0.1,
                        confidence_threshold: 0.8
                      }
                    }

                    dialog.show(() => (
                      <DialogSubagentConfig
                        initialConfig={currentConfig}
                        onSave={(config) => {
                          setSubagentEnabled(config.enabled)
                          setQualityPreference(config.quality_preference)
                          setPerformanceLearning(config.performance_learning.enabled)
                          dialog.close()
                        }}
                        onCancel={() => dialog.close()}
                      />
                    ))
                  }}
                >
                  Configure
                </Button>
              </div>
            </Show>
          </div>
        </div>

        <div class="space-y-4">
          <h3 class="text-text-base font-medium">Advanced</h3>
          <div class="space-y-3">
            <Button
              variant="ghost"
              size="small"
              onClick={() => setShowAdvanced(!showAdvanced())}
            >
              {showAdvanced() ? "Hide" : "Show"} Advanced Options
            </Button>

            <Show when={showAdvanced()}>
              <div class="space-y-3 text-sm">
                <div class="text-text-weak">
                  Configuration is primarily managed through:
                </div>
                <ul class="list-disc list-inside space-y-1 text-text-weak">
                  <li>Global config: <code class="bg-surface-weak-base px-1 rounded">.opencode/opencode.jsonc</code></li>
                  <li>Theme files: <code class="bg-surface-weak-base px-1 rounded">.opencode/themes/</code></li>
                  <li>Keybinds: Configured in global config</li>
                  <li>Provider settings: API keys and models in global config</li>
                </ul>
                <div class="pt-2">
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => dialog.show(() => (
                      <Dialog title="Advanced Settings">
                        <div class="space-y-4">
                          <h3 class="text-text-base font-medium">Storage Info</h3>
                          <div class="space-y-2 text-sm">
                            <div>Layout preferences stored in: <code class="bg-surface-weak-base px-1 rounded">layout.v3</code></div>
                            <div>Model preferences stored in: <code class="bg-surface-weak-base px-1 rounded">model.v1</code></div>
                          </div>
                        </div>
                      </Dialog>
                    ))}
                  >
                    Storage Details
                  </Button>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
