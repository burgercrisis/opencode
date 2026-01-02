import { Component, createSignal, createEffect } from "solid-js"

interface CostQualitySliderProps {
  value: number          // 0-100
  onChange: (value: number) => void
  costEstimate: (value: number) => number
  disabled?: boolean
}

export const CostQualitySlider: Component<CostQualitySliderProps> = (props) => {
  const [currentCost, setCurrentCost] = createSignal(props.costEstimate(props.value))
  const [currentValue, setCurrentValue] = createSignal(props.value)
  
  // Quality levels with color coding
  const qualityBands = [
    { range: [0, 25], label: "Cost-focused", colorClass: "text-green-600" },
    { range: [26, 50], label: "Balanced", colorClass: "text-yellow-600" },
    { range: [51, 75], label: "Quality-focused", colorClass: "text-orange-600" },
    { range: [76, 100], label: "Maximum", colorClass: "text-red-600" }
  ]
  
  const getCurrentBand = () => {
    const val = currentValue()
    return qualityBands.find(band => val >= band.range[0] && val <= band.range[1])
  }
  
  const handleInputChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    const newValue = parseInt(target.value)
    setCurrentValue(newValue)
    setCurrentCost(props.costEstimate(newValue))
  }
  
  const handleInputEnd = () => {
    props.onChange(currentValue())
  }
  
  // Update when props.value changes externally
  createEffect(() => {
    setCurrentValue(props.value)
    setCurrentCost(props.costEstimate(props.value))
  })
  
  const currentBand = getCurrentBand()
  
  return (
    <div class={`flex items-center space-x-4 ${props.disabled ? 'opacity-50' : ''}`}>
      <div class="flex-1">
        <input
          type="range"
          min="0"
          max="100"
          value={currentValue()}
          onInput={handleInputChange}
          onChange={handleInputEnd}
          disabled={props.disabled}
          class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          style={`
            background: linear-gradient(to right, 
              #10b981 0%, 
              #10b981 25%, 
              #eab308 25%, 
              #eab308 50%, 
              #f97316 50%, 
              #f97316 75%, 
              #ef4444 75%, 
              #ef4444 100%);
          `}
        />
        <div class="flex justify-between text-xs text-text-weak mt-1">
          <span>Cost</span>
          <span class={currentBand?.colorClass}>
            {currentBand?.label}
          </span>
          <span>Quality</span>
        </div>
      </div>
      <div class="text-sm text-text-weak min-w-fit">
        ${currentCost().toFixed(4)}/1K tokens
      </div>
    </div>
  )
}