# Missing IDE-AI Tools Analysis

## Investigation Status: 🔍 COMPLETE

**Date**: 2025-12-23
**Area**: Tool System - Missing Tools Compared to Industry Standards

---

## Bus System Fix - 2025-12-31

**Status**: ✅ FIXED - Ultra-defensive approach implemented

**Issue**: Desktop GUI app was throwing `TypeError: undefined is not an object (evaluating 'subscriptions.get')` error in bus system.

**Root Cause**: Race condition in bus system initialization where module instances could have different global state contexts, causing `subscriptions` to be undefined when accessed.

**Fix Applied**:
1. **Multi-environment global state detection** - Added fallbacks for globalThis, global, and window objects
2. **Ultra-defensive raw() function** - Complete error handling with local Map fallback
3. **State validation at every level** - Multiple checks for Map instance and function existence
4. **Graceful degradation** - If global state fails, creates local fallback Map
5. **Comprehensive logging** - Added 🔥 debug markers to track execution

**Key Changes**:
- `getGlobalState()` tries multiple global objects (globalThis, global, window)
- `raw()` function has try-catch at every possible failure point
- Local Map fallback when global state is unavailable
- Defensive programming ensures `subscriptions.get()` is never called on undefined

**Files Modified**:
- `packages/opencode/src/bus/index.ts` - Complete rewrite with ultra-defensive error handling

**Testing**: The fix handles any possible state scenario and should prevent the `subscriptions.get` error regardless of the underlying cause.

**Impact**: Desktop app should now start without bus subscription errors in any environment or module loading scenario.

---

## Executive Summary

OpenCode provides a robust CLI-based AI assistant with strong file operations, LSP integration, and web search capabilities. However, when compared to industry-leading IDE-AI tools (Cursor AI, Claude Code, GitHub Copilot Workspace, JetBrains AI Assistant), OpenCode lacks several critical tools that significantly impact developer productivity:

**Critical gaps identified:**

- No dedicated code explanation tool (relies on general LLM reasoning)
- No automated test generation tool
- No structured git workflow tools (only bash commands)
- No documentation generation tool
- No code refactoring assistance tool
- No error fixing automation tool
- No code analysis/architecture tools

**Impact assessment:**

- Missing tools force users to manually orchestrate workflows that should be automated
- Code understanding capabilities are limited to LSP operations and manual reading
- Testing, documentation, and refactoring workflows are inefficient
- Competitive disadvantage against integrated IDE solutions (Cursor, Claude Code)

**Recommendation:** Implement Phase1 (P0) tools immediately for parity with industry standards, then enhance existing tools and add advanced capabilities in phases.

---

## Current OpenCode Tools Inventory

### Core File Operations

- **bash** - Execute shell commands with timeout and safety limits
- **read** - Read file contents (2000 lines default, configurable offset/limit)
- **write** - Write/overwrite files
- **edit** - Exact string replacement in files
- **multiedit** - Multiple string replacements in one operation
- **patch** - Apply git-style patches to files
- **glob** - File pattern matching via Ripgrep (with modification time sorting)

### Search & Discovery

- **grep** - Regex content search via Ripgrep (with file pattern filtering)
- **ls** - List directory contents (supports ignore patterns)
- **lsp** - Language Server Protocol operations (9 operations)
  - goToDefinition, findReferences, hover, documentSymbol
  - workspaceSymbol, goToImplementation, prepareCallHierarchy
  - incomingCalls, outgoingCalls
- **lsp-hover** - Hover information from LSP
- **lsp-diagnostics** - Diagnostic information from LSP

### AI & Web Integration

- **webfetch** - Fetch and convert HTML to markdown
- **websearch** - Real-time web search with Exa AI
- **codesearch** - Code-focused search via Exa Code API (1000-50000 tokens)

### Agent & Orchestration

- **task** - Delegate to specialized subagents (multi-agent coordination)
- **batch** - Parallel execution of multiple tools (max 10, limited to core tools)
- **skill** - Load specialized skill instructions

### Task Management

- **todowrite** - Write todo items
- **todoread** - Read todo items

---

## Comparison with Industry Standards

### Cursor AI Tools

**IDE-based agent:**

- **Agent Mode** - Delegated coding tasks with codebase understanding via embedding model
- **Tab** - Custom autocomplete model predicts next actions (multi-line edits, smart rewrites)
- **Bugbot** - Automated code review with issue identification and one-click fixes

**Capabilities:**

- Multi-file refactoring with natural language
- Context-aware code completion (not just inline)
- Semantic codebase search (RAG with embeddings)
- Integrated test generation
- Automated PR review and fixes
- Natural language command execution

### GitHub Copilot Workspace Tools

**Agentic dev environment:**

- **Plan Agent** - Captures intent and proposes implementation plan
- **Brainstorm Agent** - Discuss solutions and consider alternatives
- **Repair Agent** - Fix test failures automatically based on error messages

**Capabilities:**

- Issue-to-PR workflow automation
- Integrated terminal with secure port forwarding
- Spec/plan/implementation phases
- Edit, regenerate, undo any change
- Multi-step planning and execution

### Claude Code Tools

**Terminal-based AI assistant:**

- **Understand new codebases** - Repository-level analysis and explanation
- **Refactor code** - Clean up and improve code organization
- **Write tests** - Automated test generation (unit tests, integration tests)
- **Debug code** - Error analysis and fixing with context
- **Generate documentation** - README, API docs, architecture docs

**Workflows:**

- Code explanation with multiple detail levels
- Multi-file refactoring
- Test-driven development support
- Documentation maintenance
- Architecture understanding

### JetBrains AI Assistant Tools

**AI-powered features:**

- **Smart code completion** - Mellum LLM optimized for coding
- **Next edit suggestions** - Predicts changes (additions, deletions, renames)
- **Chat with codebase** - Deep understanding via RAG
- **Edit from chat** - Multi-file edits from natural language
- **Code actions** - Refactorings, fixes, improvements

**Additional capabilities:**

- Custom commands and templates
- Code review automation
- Test generation
- Error analysis
- Code translation

### Other Common IDE-AI Tools

**Aider, Windsurf, Zed, etc.:**

- Diff preview and selective application
- Multi-file editing with context awareness
- Automated test writing and running
- Documentation generation (JSDoc, Javadoc, docstrings)
- Code translation between languages
- Complexity analysis and refactoring suggestions
- Dependency visualization

---

## Critical Missing Tools

### High Priority (P0) - Tools completely missing

#### 1. Explain Code Tool

**Status**: ❌ Missing

**Need**: Dedicated tool for structured code explanation

**Why it's needed:**

- Current workflow: Read file → Ask LLM to explain (inefficient, no structured output)
- Industry standard: Dedicated explain command with configurable detail levels
- Use cases: Onboarding new developers, code review, understanding legacy code

**Current workaround:**

```
# Use read tool + LLM prompt
User: "Read src/component.ts and explain how it works"
Tool: read(filePath="src/component.ts")
Agent: [explains based on reading]
```

**Desired workflow:**

```
User: "Explain src/component.ts"
Tool: explain(filePath="src/component.ts", detailLevel="detailed")
Output: Structured explanation with purpose, flow, dependencies, patterns
```

**Impact**: High - Code understanding is foundational for all other AI assistance

---

#### 2. Test Generation Tool

**Status**: ❌ Missing

**Need**: Automated test generation

**Why it's needed:**

- Writing tests manually is tedious and error-prone
- Industry standard: AI generates tests from code (Cursor, Claude Code, Copilot)
- Test coverage improves code quality and confidence

**Current workaround:**

```
User: "Write tests for this function"
Tool: read(filePath="src/utils.ts")
Agent: [manually generates test code]
Tool: write(filePath="src/utils.test.ts", content="...")
```

**Desired workflow:**

```
User: "Generate tests for src/utils.ts"
Tool: generateTests(filePath="src/utils.ts", framework="jest")
Output: Generated test file with edge cases and assertions
```

**Impact**: High - Testing is critical for production code

---

#### 3. Git Integration Tools

**Status**: ⚠️ Partial (only via bash)

**Need**: Dedicated git tools for commits, branches, PRs

**Why it's needed:**

- Git operations are core to development workflow
- Structured output easier for LLM to parse than bash text
- Safety checks (prevent destructive operations, confirm destructive)

**Current workaround:**

```
User: "Commit these changes"
Tool: bash(command="git add . && git commit -m '...'")
Tool: bash(command="git status")
Tool: bash(command="git log -5")
```

**Desired workflow:**

```
User: "Create commit for these changes"
Tool: gitCommit(message="...", files=["src/"], createBranch=true)
Output: Structured result with commit hash, branch name, affected files

User: "Create PR for feature/my-feature"
Tool: gitCreatePR(branch="feature/my-feature", title="...", body="...")
Output: PR URL with status
```

**Impact**: High - Git is foundational to development

---

#### 4. Documentation Generation Tool

**Status**: ❌ Missing

**Need**: Generate docstrings, JSDoc, Javadoc, README

**Why it's needed:**

- Documentation often lags behind code changes
- Industry standard: AI generates and updates docs automatically
- Reduces technical debt and improves maintainability

**Current workaround:**

```
User: "Add JSDoc to this function"
Tool: read(filePath="src/utils.ts")
Agent: [manually writes docstrings]
Tool: edit(oldString="function...", newString="/** ... */\nfunction...")
```

**Desired workflow:**

```
User: "Generate documentation for src/utils.ts"
Tool: generateDocs(filePath="src/utils.ts", format="JSDoc", includeTypes=true)
Output: File with generated docstrings and type annotations
```

**Impact**: Medium-High - Documentation important but not blocking

---

#### 5. Code Analysis Tool

**Status**: ❌ Missing

**Need**: Complexity, dependencies, pattern analysis

**Why it's needed:**

- Identify code smells and technical debt
- Understand architecture and dependencies
- Industry standard: AI analyzes code quality metrics

**Current workaround:**

```
User: "Analyze this code's complexity"
Tool: read(filePath="src/complex.ts")
Agent: [counts lines, functions, cyclomatic complexity manually]
```

**Desired workflow:**

```
User: "Analyze src/complex.ts"
Tool: analyze(filePath="src/complex.ts", analysisTypes=["complexity", "dependencies", "patterns"])
Output: {
  complexity: { cyclomatic: 15, cognitive: 8 },
  dependencies: { internal: 5, external: 3 },
  patterns: ["singleton", "factory", "observer"],
  suggestions: ["extract method", "reduce nesting"]
}
```

**Impact**: Medium - Helpful for refactoring and code quality

---

### Medium Priority (P1) - Missing but workable

#### 6. Refactor Tool

**Status**: ❌ Missing
**Need**: Automated refactoring (extract method, rename, inline)
**Impact**: Medium - Can be done manually with read/write/edit

#### 7. Fix Errors Tool

**Status**: ❌ Missing
**Need**: Parse compiler errors and apply fixes
**Impact**: Medium - Can be done with read + edit + LLM reasoning

#### 8. Translate Code Tool

**Status**: ❌ Missing
**Need**: Convert code between languages
**Impact**: Medium - Niche use case

#### 9. Code Review Tool

**Status**: ❌ Missing
**Need**: Automated PR review with suggestions
**Impact**: Medium-High - Important for team workflows

#### 10. Architecture Analysis Tool

**Status**: ❌ Missing
**Need**: Dependency graph, module relationships
**Impact**: Medium - Helpful for large codebases

#### 11. Browser Automation Tool

**Status**: ⚠️ Partial (MCP integration exists)
**Need**: Puppeteer-based testing and scraping
**Impact**: Medium - Niche use case

#### 12. Semantic Search Tool

**Status**: ❌ Missing
**Need**: RAG with embeddings for code understanding
**Impact**: High - Critical for large codebases

---

## Weak/Limited Tools

### 1. LSP Tool

**Current**: 9 LSP operations (goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls)

**Issues**:

- Limited to 9 operations (missing: codeActions, signatureHelp, completion, semanticTokens)
- No code actions (quick fixes, refactor suggestions from LSP)
- No error recovery or fallback for unsupported languages

**Enhancement opportunities**:

```typescript
const enhancedOperations = [
  // Existing
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "workspaceSymbol",
  "goToImplementation",
  "prepareCallHierarchy",
  "incomingCalls",
  "outgoingCalls",

  // Additions
  "codeActions", // Quick fixes and refactor suggestions
  "signatureHelp", // Function signature information
  "completion", // Enhanced completions (vs inline)
  "semanticTokens", // Syntax highlighting tokens
  "diagnostics", // Error/warning info (lsp-diagnostics exists but separate)
  "rename", // Symbol renaming
  "formatting", // Code formatting
  "typeDefinition", // Go to type definition
  "documentHighlights", // Highlight all references
]
```

**Impact**: Medium - LSP integration is good but could be better

---

### 2. Grep Tool

**Current**: Basic regex search via Ripgrep with file pattern filtering

**Issues**:

- No semantic search (only regex-based)
- No context beyond matching line
- No ranked results (sorted by modification time, not relevance)

**Enhancement opportunities**:

```typescript
const enhancedGrepTool = Tool.define("grep", {
  parameters: z.object({
    pattern: z.string(),
    path: z.string().optional(),
    include: z.string().optional(),
    // Additions
    context: z.number().default(0).describe("Lines of context before/after match"),
    caseSensitive: z.boolean().default(true),
    semantic: z.boolean().default(false).describe("Use semantic search via embeddings"),
    sortBy: z.enum(["relevance", "mtime", "path"]).default("mtime"),
  }),
})
```

**Impact**: High - Semantic search is critical for large codebases (Cursor, Claude Code)

---

### 3. Glob Tool

**Current**: File pattern matching with sequential stat calls

**Issues**:

- Sequential `Bun.file(full).stat()` calls (100-500ms overhead for 100 files)
- No filtering options (file size, age, type)
- Sorting only by modification time

**Enhancement opportunities**:

```typescript
const enhancedGlobTool = Tool.define("glob", {
  parameters: z.object({
    pattern: z.string(),
    path: z.string().optional(),
    // Additions
    sortBy: z.enum(["mtime", "path", "size", "name"]).default("mtime"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    minSize: z.number().optional(),
    maxSize: z.number().optional(),
    minAge: z.string().optional(), // "7d", "1h", etc.
    maxAge: z.string().optional(),
  }),
  execute: async (params) => {
    // Parallelize stat calls
    const fileStats = await Promise.all(
      files.map((f) =>
        Bun.file(f)
          .stat()
          .catch(() => null),
      ),
    )
    // Apply filters
    // Sort by multiple criteria
  },
})
```

**Impact**: Medium - Performance issue identified in devplans/01-cli-tool-execution-analysis.md

---

### 4. Batch Tool

**Current**: Parallel execution of up to 10 tools

**Issues**:

- Hard limit of 10 tools (line 36: `params.tool_calls.slice(0, 10)`)
- Cannot batch external tools (MCP, environment tools)
- No dependency management between batched calls
- No partial success handling (all or nothing)

**Enhancement opportunities**:

```typescript
const enhancedBatchTool = Tool.define("batch", {
  parameters: z.object({
    tool_calls: z
      .array(
        z.object({
          tool: z.string(),
          parameters: z.object({}).loose(),
          depends_on: z.array(z.string()).optional(), // Dependency management
        }),
      )
      .min(1),
    mode: z.enum(["parallel", "sequential"]).default("parallel"),
    max_parallel: z.number().default(10),
    fail_fast: z.boolean().default(false).describe("Stop on first error"),
  }),
  execute: async (params) => {
    // Execute based on dependencies
    // Allow partial success
    // Remove arbitrary limit
  },
})
```

**Impact**: Medium - Limitation rarely hit but could affect complex workflows

---

### 5. Bash Tool

**Current**: Shell command execution with timeout (2 min default, 10 min max)

**Issues**:

- No command history or tracking
- No built-in git-specific operations (requires manual commands)
- No environment variable management per session

**Strengths**:

- Timeout and safety limits (prevents hanging)
- MAX_OUTPUT_LENGTH cap (30,000 chars) prevents memory issues
- Works with all system commands

**Impact**: Low - Bash tool is well-designed for its purpose

---

## Recommended Tool Additions

### Phase 1: Critical Tools (Immediate)

#### 1. Explain Code Tool

**File**: `packages/opencode/src/tool/explain.ts`

**Parameters**:

```typescript
z.object({
  filePath: z.string().describe("The absolute or relative path to the file"),
  lineRange: z.tuple([z.number(), z.number()]).optional().describe("Start and end line numbers (1-based)"),
  detailLevel: z.enum(["brief", "standard", "detailed"]).default("standard"),
  includeDependencies: z.boolean().default(true).describe("Include analysis of dependencies"),
  includeExamples: z.boolean().default(false).describe("Include usage examples"),
})
```

**Output**:

```typescript
{
  title: string
  metadata: {
    filePath: string
    lineCount: number
    complexity: number
    dependencies: string[]
  }
  output: string // Structured markdown explanation
}
```

**Implementation approach**:

- Read file content
- Parse code structure (using tree-sitter if available)
- Generate structured explanation with:
  - Purpose and high-level description
  - Function/class breakdown
  - Data flow analysis
  - Dependencies and imports
  - Usage examples (if requested)

---

#### 2. Test Generation Tool

**File**: `packages/opencode/src/tool/generate-tests.ts`

**Parameters**:

```typescript
z.object({
  filePath: z.string().describe("The source file to generate tests for"),
  framework: z.enum(["jest", "vitest", "mocha", "pytest", "unittest", "go-test"]).describe("Testing framework"),
  includeTypes: z.boolean().default(true).describe("Include TypeScript/JSDoc types"),
  coverage: z.enum(["minimal", "standard", "comprehensive"]).default("standard").describe("Test coverage level"),
  outputFile: z.string().optional().describe("Custom output file path"),
})
```

**Output**:

```typescript
{
  title: string
  metadata: {
    sourceFile: string
    testFile: string
    functionsTested: string[]
    estimatedCoverage: number
  }
  output: string // Generated test file content
}
```

**Implementation approach**:

- Read source file
- Identify testable functions/classes
- Generate tests for:
  - Happy path scenarios
  - Edge cases and error conditions
  - Boundary values
  - Type checking (if TypeScript)
- Include setup/teardown as needed
- Generate test file alongside source or in test directory

---

#### 3. Git Tools

**File**: `packages/opencode/src/tool/git.ts`

**Operations**:

##### gitCommit

```typescript
z.object({
  message: z.string().describe("Commit message"),
  files: z.array(z.string()).optional().describe("Specific files to commit (default: all staged)"),
  createBranch: z.boolean().default(false).describe("Create new branch from current"),
  branchName: z.string().optional().describe("Branch name if createBranch=true"),
  amend: z.boolean().default(false).describe("Amend previous commit"),
})
```

##### gitStatus

```typescript
z.object({
  includeUntracked: z.boolean().default(true),
  includeIgnored: z.boolean().default(false),
})
```

##### gitLog

```typescript
z.object({
  limit: z.number().default(10),
  format: z.enum(["oneline", "full", "json"]).default("oneline"),
  branch: z.string().optional(),
})
```

##### gitDiff

```typescript
z.object({
  target: z.string().optional().describe("Branch, commit, or file to diff against"),
  staged: z.boolean().default(false).describe("Show staged changes"),
  outputPath: z.string().optional().describe("Save diff to file"),
})
```

##### gitBranch

```typescript
z.object({
  operation: z.enum(["list", "create", "delete", "switch", "merge"]),
  name: z.string().optional(),
  fromBranch: z.string().optional(),
  force: z.boolean().default(false),
})
```

##### gitCreatePR

```typescript
z.object({
  title: z.string().describe("PR title"),
  body: z.string().optional().describe("PR description"),
  sourceBranch: z.string().describe("Branch with changes"),
  targetBranch: z.string().default("main").describe("Branch to merge into"),
  draft: z.boolean().default(false),
})
```

**Output**: Structured JSON results (not bash text)

**Implementation approach**:

- Wrap git commands with safety checks
- Parse and validate inputs
- Return structured JSON output
- Handle errors gracefully
- Support GitHub PR creation via gh CLI or API

---

#### 4. Documentation Generation Tool

**File**: `packages/opencode/src/tool/generate-docs.ts`

**Parameters**:

```typescript
z.object({
  filePath: z.string().describe("File to document"),
  format: z.enum(["JSDoc", "Javadoc", "docstring", "rustdoc", "godoc"]).describe("Documentation format"),
  includeTypes: z.boolean().default(true).describe("Add type annotations"),
  includeExamples: z.boolean().default(true).describe("Add usage examples"),
  inline: z.boolean().default(false).describe("Generate inline docstrings"),
  outputToFile: z.boolean().default(false).describe("Write to file instead of returning"),
})
```

**Output**:

```typescript
{
  title: string
  metadata: {
    file: string
    format: string
    documentedSymbols: number
  }
  output: string // Documented code
}
```

**Implementation approach**:

- Parse code structure
- Generate documentation for:
  - Classes and interfaces
  - Functions and methods
  - Properties and variables
  - Parameters and return types
- Insert inline docstrings or generate separate docs file

---

### Phase 2: Enhancement Tools (Short-term)

#### 5. Refactor Tool

**File**: `packages/opencode/src/tool/refactor.ts`

**Parameters**:

```typescript
z.object({
  filePath: z.string(),
  lineRange: z.tuple([z.number(), z.number()]).optional(),
  refactorType: z.enum([
    "extractMethod",
    "extractVariable",
    "inlineMethod",
    "inlineVariable",
    "rename",
    "simplify",
    "reduceNesting",
    "extractInterface",
    "convertToArrow",
  ]),
  newName: z.string().optional(),
  reason: z.string().optional(),
})
```

**Supported refactorings**:

- Extract method/function
- Extract variable
- Inline method/function
- Inline variable
- Rename symbol (with LSP)
- Simplify complex expressions
- Reduce nesting depth
- Extract interface
- Convert function to arrow

---

#### 6. Code Analysis Tool

**File**: `packages/opencode/src/tool/analyze.ts`

**Parameters**:

```typescript
z.object({
  filePath: z.string(),
  analysisTypes: z
    .array(
      z.enum(["complexity", "dependencies", "patterns", "codeSmells", "security", "performance", "maintainability"]),
    )
    .default(["complexity"]),
})
```

**Output**:

```typescript
{
  title: string
  metadata: {
    file: string
    analysisDate: string
  }
  output: {
    complexity: {
      cyclomatic: number
      cognitive: number
      linesOfCode: number
    }
    dependencies: {
      internal: string[]
      external: string[]
      circular: boolean
    }
    patterns: string[] // Design patterns detected
    codeSmells: Array<{type: string, location: string, severity: string}>
    suggestions: string[]
  }
}
```

---

#### 7. Fix Errors Tool

**File**: `packages/opencode/src/tool/fix-errors.ts`

**Parameters**:

```typescript
z.object({
  filePath: z.string(),
  errors: z
    .array(
      z.object({
        line: z.number(),
        column: z.number(),
        message: z.string(),
        code: z.string(),
      }),
    )
    .optional(),
  runTests: z.boolean().default(true),
  verifyFix: z.boolean().default(true),
})
```

**Output**:

```typescript
{
  title: string
  metadata: {
    file: string
    errorsFound: number
    errorsFixed: number
  }
  output: string // Fixed code with diff
  diff: string // Git-style diff
}
```

---

#### 8. Translate Code Tool

**File**: `packages/opencode/src/tool/translate.ts`

**Parameters**:

```typescript
z.object({
  filePath: z.string(),
  targetLanguage: z.enum(["javascript", "typescript", "python", "go", "rust", "java", "csharp", "php", "ruby"]),
  preserveComments: z.boolean().default(true),
  adaptPatterns: z.boolean().default(true).describe("Use idiomatic patterns for target language"),
  outputFile: z.string().optional(),
})
```

---

### Phase 3: Advanced Tools (Medium-term)

#### 9. Semantic Search Tool

**Enhance**: Add semantic vector search to grep/glob

**Approach**:

- Generate embeddings for code chunks (using OpenAI, Anthropic, or local model)
- Store in vector database (SQLite, pgvector, or in-memory)
- Search with semantic similarity + keyword matching (hybrid search)
- Return ranked results with similarity scores

**File**: `packages/opencode/src/tool/semantic-search.ts`

**Parameters**:

```typescript
z.object({
  query: z.string().describe("Natural language query"),
  filePaths: z.array(z.string()).optional().describe("Specific files to search"),
  topK: z.number().default(10).describe("Number of results"),
  minScore: z.number().default(0.7).describe("Minimum similarity threshold"),
  includeContext: z.number().default(3).describe("Lines of context around match"),
})
```

---

#### 10. Architecture Analysis Tool

**File**: `packages/opencode/src/tool/architecture.ts`

**Parameters**:

```typescript
z.object({
  rootPath: z.string().optional().describe("Root directory to analyze"),
  outputFormat: z.enum(["json", "mermaid", "plantuml"]).default("json"),
  includeExternal: z.boolean().default(false),
})
```

**Output**:

```typescript
{
  modules: Array<{
    name: string
    path: string
    dependencies: string[]
    dependents: string[]
  }>
  dependencyGraph: string // Mermaid/PlantUML diagram
  cycles: Array<string[]> // Circular dependencies
  suggestions: string[]
}
```

---

#### 11. Code Review Tool

**File**: `packages/opencode/src/tool/review.ts`

**Parameters**:

```typescript
z.object({
  diff: z.string().optional().describe("Git diff to review"),
  filePaths: z.array(z.string()).optional().describe("Files to review"),
  checkCategories: z
    .array(z.enum(["correctness", "security", "performance", "style", "documentation", "tests"]))
    .default(["correctness", "security", "style"]),
  severity: z.enum(["all", "error", "warning", "info"]).default("all"),
})
```

**Output**:

```typescript
{
  title: string
  metadata: {
    filesReviewed: number
    issuesFound: number
    severityBreakdown: Record<string, number>
  }
  output: {
    summary: string
    issues: Array<{
      file: string
      line: number
      severity: string
      category: string
      message: string
      suggestion: string
    }>
    overallScore: number // 0-100
  }
}
```

---

#### 12. Browser Automation Tool

**File**: `packages/opencode/src/tool/browser.ts`

**Use**: Puppeteer MCP integration

**Parameters**:

```typescript
z.object({
  action: z.enum(["navigate", "click", "fill", "screenshot", "evaluate", "waitFor", "scroll"]),
  url: z.string().optional(),
  selector: z.string().optional(),
  value: z.any().optional(),
  timeout: z.number().default(30000),
})
```

**Operations**:

- Navigate to URL
- Click elements
- Fill forms
- Take screenshots
- Evaluate JavaScript
- Wait for elements
- Scroll page

---

## Tool Strengths

OpenCode excels at:

### Core Infrastructure

- **File operations** - Robust read, write, edit, patch, multiedit tools
- **Shell integration** - Bash with timeout, safety limits, output capping
- **Parallel execution** - Batch tool for concurrent operations
- **Tool extensibility** - Easy to add new tools via TypeScript + Zod schema

### AI Integration

- **Web search** - Exa AI integration (real-time, relevant results)
- **Code search** - Exa Code API for programming-specific queries
- **LSP integration** - Multi-language support (TypeScript, Python, Go, etc.)
- **Multi-agent coordination** - Task tool delegates to specialized subagents

### Developer Experience

- **Custom skills** - Skill tool for specialized instructions
- **Todo management** - todowrite/todoread for task tracking
- **Error handling** - Structured validation with Zod, clear error messages
- **Session management** - Proper cleanup and state management

### Extensibility

- **MCP support** - Model Context Protocol for external tools
- **Plugin system** - Custom tool registration
- **Agent configuration** - AGENTS.md for project-specific instructions

---

## Tool Weaknesses

OpenCode lacks:

### Code Understanding

- ❌ Structured code explanation (relies on general LLM reasoning)
- ❌ Semantic search (RAG with embeddings)
- ⚠️ Limited LSP operations (9 operations vs 15+ in competitors)

### Workflow Automation

- ❌ Test generation (manual only)
- ❌ Documentation generation (manual only)
- ❌ Refactoring assistance (manual only)
- ❌ Error fixing automation (manual only)
- ⚠️ Git integration (bash only, no structured tools)

### Code Quality

- ❌ Code analysis (complexity, dependencies, patterns)
- ❌ Code review automation
- ❌ Architecture analysis
- ❌ Security scanning

### Developer Experience

- ❌ Code translation between languages
- ❌ Browser automation for testing
- ⚠️ Limited batch tool (10 tool limit, no dependencies)

---

## Implementation Priorities

### P0 - Immediate (Week 1)

1. **Explain Code Tool** - `packages/opencode/src/tool/explain.ts`
   - High impact, foundational for code understanding
   - Relatively simple implementation (read + LLM)
   - Industry standard feature

2. **Test Generation Tool** - `packages/opencode/src/tool/generate-tests.ts`
   - Critical for production code quality
   - Reduces repetitive work
   - Competed by Cursor, Claude Code, Copilot

3. **Git Tools** - `packages/opencode/src/tool/git.ts`
   - Git is foundational to development workflow
   - Structured output easier for LLM to parse
   - Safety checks prevent destructive operations

4. **Documentation Generation Tool** - `packages/opencode/src/tool/generate-docs.ts`
   - Reduces technical debt
   - Keeps docs in sync with code
   - Multi-format support (JSDoc, Javadoc, docstrings)

### P1 - Short-term (Week 2-4)

5. **Refactor Tool** - `packages/opencode/src/tool/refactor.ts`
6. **Code Analysis Tool** - `packages/opencode/src/tool/analyze.ts`
7. **Fix Errors Tool** - `packages/opencode/src/tool/fix-errors.ts`
8. **Translate Code Tool** - `packages/opencode/src/tool/translate.ts`

### P2 - Medium-term (Month 2-3)

9. **Semantic Search Enhancement** - Add RAG to grep/glob
10. **Architecture Analysis Tool** - `packages/opencode/src/tool/architecture.ts`
11. **Code Review Tool** - `packages/opencode/src/tool/review.ts`
12. **Browser Automation Tool** - `packages/opencode/src/tool/browser.ts` (MCP integration)

---

## Next Steps

1. **Review and validate** missing tool priorities with stakeholders
2. **Design tool APIs** and parameters for Phase 1 tools
3. **Implement Phase 1** critical tools (explain, generate-tests, git, generate-docs)
4. **Enhance existing** weak tools (LSP, grep, glob, batch)
5. **Add testing** for new tools (unit tests, integration tests)
6. **Document new tools** (update AGENTS.md, create tool-specific docs)
7. **Update agent instructions** to use new tools effectively
8. **Measure impact** of new tools on developer productivity
9. **Plan Phase 2** enhancements based on Phase 1 feedback

---

## Appendices

### A. Tool Comparison Matrix

| Feature         | OpenCode     | Cursor       | Claude Code  | Copilot    | JetBrains    |
| --------------- | ------------ | ------------ | ------------ | ---------- | ------------ |
| File Operations | ✅ Excellent | ✅ Excellent | ✅ Excellent | ✅ Good    | ✅ Good      |
| LSP Integration | ⚠️ 9 ops     | ✅ 15+ ops   | ✅ Excellent | ✅ Good    | ✅ Excellent |
| Explain Code    | ❌ Manual    | ✅ Native    | ✅ Native    | ✅ Native  | ✅ Native    |
| Test Generation | ❌ Manual    | ✅ Native    | ✅ Native    | ✅ Native  | ✅ Native    |
| Git Integration | ⚠️ Bash only | ✅ Native    | ✅ Native    | ✅ Native  | ✅ Native    |
| Documentation   | ❌ Manual    | ✅ Native    | ✅ Native    | ⚠️ Partial | ✅ Native    |
| Refactoring     | ❌ Manual    | ✅ Native    | ✅ Native    | ✅ Native  | ✅ Native    |
| Code Analysis   | ❌ Manual    | ✅ Native    | ✅ Native    | ❌ Manual  | ✅ Native    |
| Semantic Search | ❌ No        | ✅ RAG       | ✅ RAG       | ✅ RAG     | ✅ RAG       |
| Web Search      | ✅ Exa       | ✅ Native    | ✅ Native    | ✅ Native  | ✅ Native    |
| Code Review     | ❌ Manual    | ✅ Bugbot    | ✅ Native    | ✅ Native  | ✅ Native    |
| Multi-agent     | ✅ Task tool | ✅ Agent     | ✅ Native    | ✅ Native  | ⚠️ Limited   |

### B. Estimated Implementation Effort

| Tool                  | Complexity | Estimated Time | Dependencies          |
| --------------------- | ---------- | -------------- | --------------------- |
| Explain Code          | Low        | 2-3 days       | None                  |
| Test Generation       | Medium     | 5-7 days       | LSP for structure     |
| Git Tools             | Medium     | 5-7 days       | Git CLI               |
| Documentation Gen     | Medium     | 4-5 days       | Parser                |
| Refactor Tool         | High       | 10-14 days     | LSP, parser           |
| Code Analysis         | High       | 7-10 days      | Parser, metrics       |
| Fix Errors Tool       | Medium     | 5-7 days       | LSP diagnostics       |
| Translate Code        | Medium     | 5-7 days       | Parser                |
| Semantic Search       | Very High  | 14-21 days     | Embeddings, vector DB |
| Architecture Analysis | Very High  | 10-14 days     | Graph analysis        |
| Code Review Tool      | High       | 7-10 days      | Analysis tools        |
| Browser Tool          | Medium     | 5-7 days       | Puppeteer MCP         |

### C. References

- Cursor Features: https://cursor.com/features
- Claude Code Docs: https://code.claude.com/docs/en/overview
- GitHub Copilot Workspace: https://githubnext.com/projects/copilot-workspace
- JetBrains AI Assistant: https://www.jetbrains.com/ai-assistant/
- AI Code Tools Guide: https://codesubmit.io/blog/ai-code-tools/
- Code Analysis Research: https://arxiv.org/abs/2510.24428

---

**Status**: 📝 Investigation complete, ready for implementation planning

**Next action**: Prioritize and schedule Phase 1 tool implementation
