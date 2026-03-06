
// COORDINATED GLOBAL TEST SETUP - Works WITH preload.ts
import { beforeAll, beforeEach, afterEach } from "bun:test"

// Import preload to ensure it runs first
import "./preload"

console.log("[coordinated-protection] Loading coordinated global setup")

// Wait for preload to complete its setup
let isPreloadReady = false
let preloadInstance: any = null
let preloadFilesystem: any = null

// Get references from preload after it's ready
const getPreloadReferences = () => {
  try {
    // Check if preload has set up its protected instance
    if ((globalThis as any).protectedInstance) {
      preloadInstance = (globalThis as any).protectedInstance
      preloadFilesystem = (globalThis as any).Filesystem
      
      if (preloadInstance && typeof preloadInstance.provide === 'function') {
        isPreloadReady = true
        console.log("[coordinated-protection] Got references from preload")
        return true
      }
    }
    
    // Fallback to direct Instance if protected instance not available
    const directInstance = (globalThis as any).Instance
    if (directInstance && typeof directInstance.provide === 'function') {
      preloadInstance = directInstance
      preloadFilesystem = (globalThis as any).Filesystem
      isPreloadReady = true
      console.log("[coordinated-protection] Got direct Instance references")
      return true
    }
    
    console.log("[coordinated-protection] Preload not ready yet, will retry")
    return false
  } catch (error) {
    console.log("[coordinated-protection] Error getting preload references:", error.message)
    return false
  }
}

// Try to get preload references immediately
getPreloadReferences()

// Coordinated protection that respects preload's work
const coordinatedProtection = () => {
  // Ensure we have preload references
  if (!isPreloadReady) {
    getPreloadReferences()
  }
  
  if (!isPreloadReady) {
    console.log("[coordinated-protection] WARNING: Preload references not available")
    return false
  }
  
  // Verify Instance is working
  const currentInstance = (globalThis as any).Instance
  if (currentInstance && typeof currentInstance.provide === 'function') {
    console.log("[coordinated-protection] Instance is working correctly")
    return true
  }
  
  // Try to restore using preload's references
  if (preloadInstance) {
    console.log("[coordinated-protection] Restoring Instance from preload references")
    
    // Let preload handle the restoration - don't fight it
    if (typeof (globalThis as any).restoreInstance === 'function') {
      (globalThis as any).restoreInstance()
    } else {
      // Fallback: set Instance directly
      (globalThis as any).Instance = preloadInstance
      if (preloadFilesystem) {
        (globalThis as any).Filesystem = preloadFilesystem
      }
    }
    
    return true
  }
  
  return false
}

beforeAll(() => {
  console.log("[coordinated-protection] beforeAll: Ensuring preload coordination")
  coordinatedProtection()
})

beforeEach(() => {
  console.log("[coordinated-protection] beforeEach: Coordinating with preload")
  coordinatedProtection()
})

afterEach(() => {
  console.log("[coordinated-protection] afterEach: Coordinated cleanup")
  
  // Clean up any mocks
  try {
    if (typeof (globalThis as any).mock !== 'undefined' && (globalThis as any).mock.unmock) {
      (globalThis as any).mock.unmock()
    }
  } catch (e) {
    // Ignore mock cleanup errors
  }
  
  // Let preload handle restoration - don't interfere
  coordinatedProtection()
})

console.log("[coordinated-protection] Coordinated global test setup loaded")
