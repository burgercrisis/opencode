import { Component, createSignal, Show, For } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { CostQualitySlider } from "./cost-quality-slider"
import { useLocal } from "@/context/local"

interface TaskConfig {
  quality_preference: number
  model_overrides: string[]
  cost_threshold?: number
}

interface DialogSubagentConfigProps {
  initialConfig: {
    enabled: boolean
    global_allowlist: string[]
    default_behavior: "inherit" | "fallback"
    quality_preference: number
    task_specific_overrides: Record<string, TaskConfig>
    performance_learning: {
      enabled: boolean
      adaptation_rate: number
      confidence_threshold: number
    }
  }
  onSave: (config: any) => void
  onCancel: () => void
}

export const DialogSubagentConfig: Component<DialogSubagentConfigProps> = (props) => {
  const local = useLocal()
  const [activeTab, setActiveTab] = createSignal<"general" | "tasks" | "models" | "learning">("general")

  // Configuration state
  const [enabled, setEnabled] = createSignal(props.initialConfig.enabled)
  const [defaultBehavior, setDefaultBehavior] = createSignal(props.initialConfig.default_behavior)
  const [qualityPreference, setQualityPreference] = createSignal(props.initialConfig.quality_preference)
  const [allowlist, setAllowlist] = createSignal(props.initialConfig.global_allowlist || [])
  const [taskOverrides, setTaskOverrides] = createSignal(props.initialConfig.task_specific_overrides || {})
  const [performanceLearning, setPerformanceLearning] = createSignal(props.initialConfig.performance_learning)

  // UI state
  const [showModelSelector, setShowModelSelector] = createSignal(false)
  const [editingTask, setEditingTask] = createSignal<string | null>(null)

  const taskTypes = [
    { id: "file_operations", name: "File Operations", description: "Search, explore, and navigate files" },
    { id: "code_generation", name: "Code Generation", description: "Write and create code" },
    { id: "debugging", name: "Debugging", description: "Fix errors and troubleshoot issues" },
    { id: "documentation", name: "Documentation", description: "Generate and edit documentation" },
    { id: "git_operations", name: "Git Operations", description: "Version control tasks" },
    { id: "analysis", name: "Analysis", description: "Code review and analysis" },
  ]

  const availableModels = () => {
    // Get all available models from local context
    const models = local.model.list()
    return models.map(m => `${m.provider.id}/${m.id}`)
  }

  const updateTaskOverride = (taskId: string, updates: Partial<TaskConfig>) => {
    const current = taskOverrides()
    setTaskOverrides({
      ...current,
      [taskId]: {
        ...current[taskId],
        ...updates
      }
    })
  }

  const addModelToAllowlist = (model: string) => {
    if (!allowlist().includes(model)) {
      setAllowlist([...allowlist(), model])
    }
    setShowModelSelector(false)
  }

  const removeModelFromAllowlist = (model: string) => {
    setAllowlist(allowlist().filter(m => m !== model))
  }

  const resetToDefaults = () => {
    setEnabled(false)
    setDefaultBehavior("inherit")
    setQualityPreference(50)
    setAllowlist([])
    setTaskOverrides({})
    setPerformanceLearning({
      enabled: false,
      adaptation_rate: 0.1,
      confidence_threshold: 0.8
    })
  }

  const handleSave = () => {
    const config = {
      enabled: enabled(),
      default_behavior: defaultBehavior(),
      quality_preference: qualityPreference(),
      global_allowlist: allowlist(),
      task_specific_overrides: taskOverrides(),
      performance_learning: performanceLearning()
    }
    props.onSave(config)
  }

  const costEstimate = (quality: number) => {
    const baseCost = 0.001
    const multiplier = 1 + (quality / 100) * 4
    return baseCost * multiplier
  }

  return (
    <Dialog title="Subagent Model Configuration">
      <div class="space-y-6">
        {/* Tab Navigation */}
        <div class="flex space-x-1 border-b border-border-weak-base">
          {[
            { id: "general", label: "General" },
            { id: "tasks", label: "Task Types" },
            { id: "models", label: "Model Allowlist" },
            { id: "learning", label: "Learning" }
          ].map(tab => (
            <button
              class={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab() === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-text-weak hover:text-text-base"
                }`}
              onClick={() => setActiveTab(tab.id as any)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <Show when={activeTab() === "general"}>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium">Enable Intelligent Subagent Selection</div>
                <div class="text-sm text-text-weak">
                  Automatically select optimal models for subagent tasks based on cost, quality, and performance data
                </div>
              </div>
              <input
                type="checkbox"
                checked={enabled()}
                onChange={(e) => setEnabled(e.target.checked)}
                class="w-4 h-4"
              />
            </div>

            <div class="space-y-2">
              <label class="font-medium">Default Behavior (when disabled)</label>
              <select
                class="w-full bg-surface-weak-base text-text-base border border-border-weak-base rounded px-2 py-1 text-sm"
                value={defaultBehavior()}
                onChange={(e) => setDefaultBehavior(e.target.value as "inherit" | "fallback")}
              >
                <option value="inherit">Inherit parent model</option>
                <option value="fallback">Use fallback model</option>
              </select>
            </div>

            <div class="space-y-2">
              <label class="font-medium">Default Cost vs Quality Preference</label>
              <CostQualitySlider
                value={qualityPreference()}
                onChange={setQualityPreference}
                costEstimate={costEstimate}
              />
            </div>
          </div>
        </Show>

        <Show when={activeTab() === "tasks"}>
          <div class="space-y-4">
            <div class="text-sm text-text-weak">
              Configure model preferences and quality settings for different task types.
            </div>

            <For each={taskTypes}>
              {taskType => (
                <div class="border border-border-weak-base rounded-lg p-4 space-y-3">
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="font-medium">{taskType.name}</div>
                      <div class="text-sm text-text-weak">{taskType.description}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => setEditingTask(editingTask() === taskType.id ? null : taskType.id)}
                    >
                      {editingTask() === taskType.id ? "Hide" : "Configure"}
                    </Button>
                  </div>

                  <Show when={editingTask() === taskType.id}>
                    <div class="space-y-3 pt-3 border-t border-border-weak-base">
                      <div class="space-y-2">
                        <label class="text-sm font-medium">Quality Preference</label>
                        <CostQualitySlider
                          value={taskOverrides()[taskType.id]?.quality_preference || qualityPreference()}
                          onChange={(value) => updateTaskOverride(taskType.id, { quality_preference: value })}
                          costEstimate={costEstimate}
                        />
                      </div>

                      <div class="space-y-2">
                        <label class="text-sm font-medium">Model Overrides</label>
                        <div class="flex flex-wrap gap-2">
                          {(taskOverrides()[taskType.id]?.model_overrides || []).map(model => (
                            <span class="inline-flex items-center px-2 py-1 bg-surface-weak-base border border-border-weak-base rounded text-sm">
                              {model}
                              <button
                                class="ml-1 text-text-weak hover:text-text-base"
                                onClick={() => {
                                  const current = taskOverrides()[taskType.id]?.model_overrides || []
                                  updateTaskOverride(taskType.id, {
                                    model_overrides: current.filter(m => m !== model)
                                  })
                                }}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div class="space-y-2">
                        <label class="text-sm font-medium">Cost Threshold ($)</label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          max="1"
                          value={taskOverrides()[taskType.id]?.cost_threshold || ""}
                          onChange={(e) => updateTaskOverride(taskType.id, {
                            cost_threshold: e.target.value ? parseFloat(e.target.value) : undefined
                          })}
                          class="w-full bg-surface-weak-base text-text-base border border-border-weak-base rounded px-2 py-1 text-sm"
                          placeholder="No limit"
                        />
                      </div>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={activeTab() === "models"}>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium">Model Allowlist</div>
                <div class="text-sm text-text-weak">
                  Restrict subagent model selection to specific models. Leave empty to allow all models.
                </div>
              </div>
              <Button
                onClick={() => setShowModelSelector(true)}
              >
                Add Model
              </Button>
            </div>

            <div class="space-y-2">
              <div class="text-sm font-medium">Allowed Models ({allowlist().length})</div>
              <div class="space-y-2">
                <For each={allowlist()}>
                  {model => (
                    <div class="flex items-center justify-between p-2 bg-surface-weak-base border border-border-weak-base rounded">
                      <span class="text-sm">{model}</span>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => removeModelFromAllowlist(model)}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </For>
                <Show when={allowlist().length === 0}>
                  <div class="text-sm text-text-weak italic p-4 text-center border border-border-weak-base rounded">
                    No models restricted. All available models can be used by subagents.
                  </div>
                </Show>
              </div>
            </div>

            {/* Simple Model Selector */}
            <Show when={showModelSelector()}>
              <div class="space-y-2">
                <div class="text-sm font-medium">Select Model to Add</div>
                <div class="max-h-60 overflow-y-auto border border-border-weak-base rounded">
                  <For each={availableModels()}>
                    {model => (
                      <div
                        class="p-2 hover:bg-surface-hover cursor-pointer border-b border-border-weak-base last:border-b-0"
                        onClick={() => addModelToAllowlist(model)}
                      >
                        <div class="text-sm">{model}</div>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={activeTab() === "learning"}>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium">Performance Learning</div>
                <div class="text-sm text-text-weak">
                  Enable adaptive learning from user feedback to improve model selection over time.
                </div>
              </div>
              <input
                type="checkbox"
                checked={performanceLearning().enabled}
                onChange={(e) => setPerformanceLearning({
                  ...performanceLearning(),
                  enabled: e.target.checked
                })}
                class="w-4 h-4"
              />
            </div>

            <Show when={performanceLearning().enabled}>
              <div class="space-y-4 pt-4 border-t border-border-weak-base">
                <div class="space-y-2">
                  <label class="text-sm font-medium">Adaptation Rate</label>
                  <div class="flex items-center space-x-4">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={performanceLearning().adaptation_rate}
                      onChange={(e) => setPerformanceLearning({
                        ...performanceLearning(),
                        adaptation_rate: parseFloat(e.target.value)
                      })}
                      class="flex-1"
                    />
                    <span class="text-sm text-text-weak w-12">
                      {(performanceLearning().adaptation_rate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div class="text-xs text-text-weak">
                    How quickly the system adapts to feedback. Higher values make faster but potentially unstable adaptations.
                  </div>
                </div>

                <div class="space-y-2">
                  <label class="text-sm font-medium">Confidence Threshold</label>
                  <div class="flex items-center space-x-4">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={performanceLearning().confidence_threshold}
                      onChange={(e) => setPerformanceLearning({
                        ...performanceLearning(),
                        confidence_threshold: parseFloat(e.target.value)
                      })}
                      class="flex-1"
                    />
                    <span class="text-sm text-text-weak w-12">
                      {(performanceLearning().confidence_threshold * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div class="text-xs text-text-weak">
                    Minimum confidence required before making adaptations. Higher values require more data.
                  </div>
                </div>
              </div>
            </Show>

            <div class="pt-4 border-t border-border-weak-base">
              <div class="text-sm text-text-weak">
                Learning data is stored in <code class="bg-surface-weak-base px-1 rounded">.learning/</code> directory.
                Performance profiles are managed as markdown files following the agents.md pattern.
              </div>
            </div>
          </div>
        </Show>

        {/* Actions */}
        <div class="flex items-center justify-between pt-6 border-t border-border-weak-base">
          <Button
            variant="ghost"
            onClick={resetToDefaults}
          >
            Reset to Defaults
          </Button>
          <div class="flex space-x-2">
            <Button
              variant="ghost"
              onClick={props.onCancel}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
            >
              Save Configuration
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
