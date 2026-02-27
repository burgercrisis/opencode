// Helper function to safely check production mode
const isProductionMode = (): boolean => {
  try {
    // Dynamic import to avoid module resolution issues in test environment
    const Resource = require("@opencode-ai/console-resource")
    return Resource?.App?.stage === "production"
  } catch {
    // Handle SST environment errors gracefully - default to non-production
    return false
  }
}

export const logger = {
  metric: (values: Record<string, any>) => {
    console.log(`_metric:${JSON.stringify(values)}`)
  },
  log: (message: any, ...args: any[]) => {
    console.log(message, ...args)
  },
  debug: (message: string) => {
    if (!isProductionMode()) {
      console.debug(message)
    }
  },
}
