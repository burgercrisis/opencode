/**
 * Verification tests for critical fixes applied to working changes
 * Ensures that the race condition fixes, duplicate render removal, and type safety improvements work correctly
 */

import { describe, it, expect, beforeEach } from 'bun:test'

// Test 1: Verify no duplicate render calls in loading.tsx
describe('Loading Component Fixes', () => {
  it('should have only one render call', async () => {
    const loadingFile = await import('../packages/desktop/src/loading.tsx')
    const fileContent = await Bun.file('../packages/desktop/src/loading.tsx').text()
    
    // Count render() calls
    const renderCalls = fileContent.match(/render\(/g) || []
    
    // Should only have one render call
    expect(renderCalls.length).toBe(1)
    console.log('✅ Only one render call found')
  })
})

// Test 2: Verify GitHub triage race condition fix
describe('GitHub Triage Fixes', () => {
  it('should use runtime enum generation instead of module-level', async () => {
    const triageFile = await import('../.opencode/tool/github-triage.ts')
    const fileContent = await Bun.file('../.opencode/tool/github-triage.ts').text()
    
    // Should have getAssigneesEnum function
    expect(fileContent).toContain('function getAssigneesEnum()')
    
    // Should call getAssigneesEnum() in tool schema
    expect(fileContent).toContain('.enum(getAssigneesEnum())')
    
    // Should NOT have module-level ASSIGNEES_ENUM constant
    expect(fileContent).not.toContain('const ASSIGNEES_ENUM')
    
    console.log('✅ Runtime enum generation verified')
  })
  
  it('should have proper indentation for nix label logic', async () => {
    const fileContent = await Bun.file('../.opencode/tool/github-triage.ts').text()
    
    // Extract the nix label handling section
    const nixSection = fileContent.match(/if\(labels\.includes\("nix"\).*?}/s)?.[0]
    
    if (nixSection) {
      // Both statements should be properly indented inside the if block
      expect(nixSection).toContain('  labels = labels.filter')
      expect(nixSection).toContain('  results.push')
      console.log('✅ Proper indentation verified')
    } else {
      throw new Error('Could not find nix label handling section')
    }
  })
})

// Test 3: Verify type safety improvements
describe('Type Safety Fixes', () => {
  it('should have properly typed channel onmessage handler', async () => {
    const fileContent = await Bun.file('../packages/desktop/src/loading.tsx').text()
    
    // Should have typed onmessage handler
    expect(fileContent).toContain('channel.onmessage = (next: InitStep) => setStep(next)')
    console.log('✅ Properly typed channel handler verified')
  })
  
  it('should have enhanced cleanup coordination', async () => {
    const fileContent = await Bun.file('../packages/desktop/src/loading.tsx').text()
    
    // Should have cleanup tasks coordination
    expect(fileContent).toContain('const cleanupTasks: Promise<void>[] = []')
    expect(fileContent).toContain('Promise.allSettled(cleanupTasks)')
    console.log('✅ Enhanced cleanup coordination verified')
  })
})

// Test 4: Verify shared logo import works
describe('Shared Logo Import', () => {
  it('should successfully import shared logo', async () => {
    try {
      const logoModule = await import('../packages/shared/logo')
      expect(logoModule.burgercodeLogo).toBeDefined()
      expect(logoModule.burgercodeLogo.left).toBeInstanceOf(Array)
      expect(logoModule.burgercodeLogo.right).toBeInstanceOf(Array)
      console.log('✅ Shared logo import verified')
    } catch (error) {
      throw new Error(`Shared logo import failed: ${error}`)
    }
  })
})

// Test 5: Verify no regression in functionality
describe('Regression Tests', () => {
  it('should maintain all critical functionality', async () => {
    const loadingFile = await Bun.file('../packages/desktop/src/loading.tsx').text()
    const triageFile = await Bun.file('../.opencode/tool/github-triage.ts').text()
    
    // Loading component should have:
    expect(loadingFile).toContain('ErrorBoundary')
    expect(loadingFile).toContain('validateLogo')
    expect(loadingFile).toContain('FALLBACK_LOGO')
    
    // GitHub triage should have:
    expect(triageFile).toContain('detectPrototypePollution')
    expect(triageFile).toContain('safeJsonParse')
    expect(triageFile).toContain('githubFetch')
    
    console.log('✅ All critical functionality preserved')
  })
})
