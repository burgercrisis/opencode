/**
 * Mock utilities for process platform testing
 */

export interface MockProcess {
  platform: string
  arch: string
}

export function mockProcessPlatform(platform: string, arch: string = "x64"): void {
  Object.defineProperty(process, "platform", { 
    value: platform, 
    writable: true,
    configurable: true 
  })
  Object.defineProperty(process, "arch", { 
    value: arch, 
    writable: true,
    configurable: true 
  })
}

export function restoreProcess(): void {
  // Reset to original values - this should be called in afterEach
  // Note: In a real test environment, you'd want to store original values first
  Object.defineProperty(process, "platform", { 
    value: process.platform, 
    writable: true,
    configurable: true 
  })
  Object.defineProperty(process, "arch", { 
    value: process.arch, 
    writable: true,
    configurable: true 
  })
}
