/**
 * Error Processors Index
 * Exports all shell-specific error processors and factory functions
 */

export * from '../error-processor'

// Shell-specific processors
export * from './powershell'
export * from './cmd'
export * from './unix'

import { UnifiedErrorProcessor, ErrorProcessorMonitor, ShellType } from '../error-processor'
import { PowerShellErrorProcessor } from './powershell'
import { CmdErrorProcessor } from './cmd'
import { BashErrorProcessor, ZshErrorProcessor, FishErrorProcessor } from './unix'

/**
 * Factory function to create a pre-configured unified error processor
 */
export function createUnifiedErrorProcessor(): UnifiedErrorProcessor {
  const processor = new UnifiedErrorProcessor()

  // Register all shell-specific processors
  processor.register(new PowerShellErrorProcessor())
  processor.register(new CmdErrorProcessor())
  processor.register(new BashErrorProcessor())
  processor.register(new ZshErrorProcessor())
  processor.register(new FishErrorProcessor())

  return processor
}

/**
 * Factory function to create a unified error processor with monitoring
 */
export function createMonitoredErrorProcessor(): {
  processor: UnifiedErrorProcessor
  monitor: ErrorProcessorMonitor
} {
  const processor = createUnifiedErrorProcessor()
  const monitor = new ErrorProcessorMonitor()

  return { processor, monitor }
}

/**
 * Detect shell type from command string
 */
export function detectShellType(command: string, platform: string = process.platform): ShellType {
  const lowerCommand = command.toLowerCase().trim()

  // Explicit shell commands
  if (lowerCommand.startsWith('powershell') || lowerCommand.startsWith('pwsh')) {
    return 'powershell'
  }

  if (lowerCommand.startsWith('cmd')) {
    return 'cmd'
  }

  // Platform-specific defaults
  if (platform === 'win32') {
    // On Windows, default to PowerShell unless CMD is explicitly detected
    return 'powershell'
  }

  // Unix-like systems - default to bash
  return 'bash'
}

/**
 * Process command output using the unified framework
 */
export function processCommandOutput(
  output: string,
  command: string,
  shellType?: ShellType,
  processor?: UnifiedErrorProcessor
): {
  output: string
  hasErrors: boolean
  exitCode?: number
  shellType: ShellType
} {
  // Detect shell type if not provided
  const detectedShellType = shellType || detectShellType(command)

  // Use provided processor or create default one
  const errorProcessor = processor || createUnifiedErrorProcessor()

  // Process the output
  const startTime = Date.now()
  const result = errorProcessor.process(output, command, detectedShellType)
  const processingTime = Date.now() - startTime

  return {
    ...result,
    shellType: detectedShellType
  }
}
