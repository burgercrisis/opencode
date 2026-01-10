/**
 * Barrel Export - Tool Module
 *
 * This file provides a unified entry point for all tool exports.
 * It is NOT required for the application to function — files import directly
 * from individual modules (bash.ts, powershell-executor.ts, etc.).
 *
 * Purpose:
 * - Provides a single import point: `import { BashTool, PowerShellExecutor } from "@/tool"`
 * - Exposes a stable public API for potential future consumers (plugins, docs)
 * - Makes exports discoverable via IDE auto-completion
 *
 * Note: If you delete this file, the application will continue to work normally.
 */

// Tool definitions and utilities
export { Tool } from "./tool"
export { BashTool, detectCommandShell, parseCommand } from "./bash"

// Temporary file management for script execution (Windows PowerShell)
/**
 * @platform Windows - Temp file management for PowerShell scripts
 */
export { TempFileManager, TempFilePoolFullError } from "./temp-file-manager"

// PowerShell execution (Windows command execution)
/**
 * @platform Windows - PowerShell command execution via temp files
 */
export { PowerShellExecutor, PowerShellExecutionError } from "./powershell-executor"

// Other tool exports
export { BatchTool } from "./batch"
export { CodeSearchTool } from "./codesearch"
export { EditTool } from "./edit"
export { GlobTool } from "./glob"
export { GrepTool } from "./grep"
export { InvalidTool } from "./invalid"
export { ListTool } from "./ls"
export { LspTool } from "./lsp"
export { MultiEditTool } from "./multiedit"
export { PatchTool } from "./patch"
export { ReadTool } from "./read"
export { SkillTool } from "./skill"
export { TaskTool } from "./task"
export { TodoReadTool, TodoWriteTool } from "./todo"
export { WebFetchTool } from "./webfetch"
export { WebSearchTool } from "./websearch"
export { WriteTool } from "./write"
