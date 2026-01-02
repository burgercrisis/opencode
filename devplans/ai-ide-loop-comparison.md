# Agentic Loops in Major AI IDEs: Accurate Technical Analysis

> December 2025

---

## Quick Comparison Table

| IDE                    | Loop Type                      | Model            | Architecture     | Complexity  | Key Differentiator      |
| ---------------------- | ------------------------------ | ---------------- | ---------------- | ----------- | ----------------------- |
| **OpenCode**           | Session-based streaming        | Multiple         | Message-driven   | Medium      | Open-source, extensible |
| **Claude Code**        | Single-threaded Master Loop    | Claude 4         | CLI-first        | Low         | Radical simplicity      |
| **Cursor**             | Multi-mode (Agent/Chat)        | Claude + GPT     | Hybrid           | Medium      | Rules, Planning mode    |
| **Kiro**               | Spec-driven Multi-Agent        | Claude           | AWS-integrated   | High        | EARS specs, MCP, Hooks  |
| **Windsurf Cascade**   | Flow-aware with Planning Agent | Claude + Codeium | Context tracking | Medium      | IDE-native, Memories    |
| **Google Antigravity** | Three-Surface Architecture     | Gemini 3         | Browser-native   | Medium-High | Artifact transparency   |
| **Trae**               | Context-first                  | Claude + Gemini  | Free tier focus  | Medium      | Vietnamese market       |

---

## 1. Claude Code (Anthropic)

### Accurate Loop Type: Single-Threaded Master Loop with Todo Lists

**Source: Claude Code System Prompt & Tool Definitions (GitHub Gist, Claude Docs)**

```
┌─────────────────────────────────────────────────────────────┐
│              CLAUDE CODE MASTER LOOP                        │
│           (Single-threaded, tool-driven)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  System Prompt defines:                                     │
│  - Role: CLI assistant for software engineering             │
│  - TodoWrite/TodoRead: Planning mechanism                   │
│  - Tool calling: Bash, Glob, Grep, Read, Edit, Write, etc. │
│  - Subagent: Task tool (stateless, concurrent possible)    │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Planning   │    │  Execution   │    │  Iteration   │
│   (TodoWrite)│    │  (Tool Call)│    │  (Loop back) │
└──────────────┘    └──────────────┘    └──────────────┘
                              │
                              ↓
                    User approval / Continue
```

### Claude Code Tools (Exact List)

| Tool          | Purpose               | Key Feature                              |
| ------------- | --------------------- | ---------------------------------------- |
| **Bash**      | Shell commands        | Persistent session, 2min timeout default |
| **Glob**      | File pattern matching | Fast, sorted by modification             |
| **Grep**      | Content search        | Regex, file filtering                    |
| **LS**        | Directory listing     | Absolute paths only                      |
| **Read**      | File reading          | Multiline, image support                 |
| **Edit**      | String replacement    | Exact match required                     |
| **MultiEdit** | Multiple edits        | Atomic (all or nothing)                  |
| **Write**     | File creation         | Overwrites existing                      |
| **Task**      | Sub-agent spawning    | Stateless, concurrent capable            |
| **TodoRead**  | Read task list        | No parameters                            |
| **TodoWrite** | Create/manage tasks   | Tracks progress                          |
| **WebFetch**  | URL content           | AI-processed                             |
| **WebSearch** | Web search            | US only                                  |

### Claude Code Subagent Implementation

**Task Tool (from system prompt):**

```
- Launch a new agent with access to: Bash, Glob, Grep, LS, Read, Edit, MultiEdit, Write, Task, WebFetch
- When to use: Keyword searches, file discovery, multi-step research
- When NOT: Specific file paths, specific class definitions
- IMPORTANT: Agent is STATELESS - cannot send additional messages
- Can launch MULTIPLE agents concurrently for performance
```

### Accurate Claude Code Characteristics

| Aspect              | Description                                     |
| ------------------- | ----------------------------------------------- |
| **Loop Type**       | Single-threaded with tool calls                 |
| **Planning**        | Explicit via TodoWrite/TodoRead                 |
| **Self-correction** | Via tool result feedback                        |
| **Branching**       | None (linear execution)                         |
| **Parallelism**     | Sequential only (but subagents can be parallel) |
| **Context**         | Working directory, conversation history         |

### What Makes Claude Code Unique

1. **Radical simplicity** - No complex frameworks
2. **Stateless subagents** - Task tool spawns independent agents
3. **CLI-first** - No GUI overhead
4. **Todo list integration** - First-class planning
5. **Claude 4 capabilities** - Interleaved thinking

---

## 2. Cursor IDE

### Accurate Loop Type: Multi-Mode with Planning Agent

**Source: Cursor Agent Mode System Prompt, Docs**

```
┌─────────────────────────────────────────────────────────────┐
│                    CURSOR ARCHITECTURE                      │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   CHAT MODE      │ │  AGENT MODE     │ │  PLANNING MODE  │
│  (Conversational)│ │ (Autonomous)    │ │ (Sequential)    │
└──────────────────┘ └──────────────────┘ └──────────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              SHARED CONTEXT (RULES & MEMORY)                │
│  • AGENTS.md - Agent behavior config                       │
│  • CLAUDE.md - Model instructions                          │
│  • .cursor/rules/ - File-specific rules                   │
│  • Workflows - Multi-step patterns                        │
└─────────────────────────────────────────────────────────────┘
```

### Cursor Rules System

| File               | Purpose              | Scope            |
| ------------------ | -------------------- | ---------------- |
| **CLAUDE.md**      | General instructions | Project-wide     |
| **AGENTS.md**      | Agent behavior       | Agent-specific   |
| **.cursor/rules/** | File patterns        | Pattern-specific |

### Cursor Agent Mode System Prompt (Accurate)

```
"You are a powerful agentic AI coding assistant, powered by Claude 3.5 Sonnet.
You operate exclusively in Cursor, the world's best IDE.
You are pair programming with a USER to solve their coding task.
The task may require creating a new codebase, modifying or debugging, or answering questions.
Each time the USER sends a message, we may automatically attach:
- What files they have open
- Where their cursor is
- Recently viewed files
- Edit history in their session
- Linter errors"
```

### Accurate Cursor Characteristics

| Aspect              | Description                             |
| ------------------- | --------------------------------------- |
| **Loop Type**       | Multi-mode (Chat/Agent/Planning)        |
| **Planning**        | AGENTS.md + Planning Mode               |
| **Self-correction** | Approval gates + tool feedback          |
| **Branching**       | None                                    |
| **Parallelism**     | Sequential                              |
| **Context**         | IDE state (open files, cursor, history) |

### What Makes Cursor Unique

1. **IDE integration** - Deep VS Code integration
2. **Rules system** - Configurable agent behavior
3. **Planning mode** - Sequential step execution
4. **Edit history** - Context awareness

---

## 3. AWS Kiro

### Accurate Loop Type: Spec-Driven Multi-Agent with MCP Integration

**Source: Kiro Directory Architecture Documentation**

```
┌─────────────────────────────────────────────────────────────┐
│                  KIRO ARCHITECTURE                          │
│                    (4-Layer Stack)                         │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ LAYER 4:         │ │ LAYER 3:         │ │ LAYER 2:         │
│ VS Code Interface│ │ Agent Hooks &    │ │ Claude 4.0 AI    │
│ & Developer      │ │ Automation       │ │ Engine & MCP     │
│ Experience       │ │ System           │ │ Integration      │
└──────────────────┘ └──────────────────┘ └──────────────────┘
          ↑                   ↑                   ↑
          └───────────────────┴───────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: SPEC-DRIVEN DEVELOPMENT CORE                     │
│  • EARS Format Specifications                             │
│  • Automatic Task Decomposition                           │
│  • Testable, Traceable, Maintainable                     │
└─────────────────────────────────────────────────────────────┘
```

### Kiro Agent Hooks (Accurate)

```javascript
// Example from Kiro documentation
module.exports = {
  trigger: "onFileSave",
  pattern: "src/**/*.{ts,js}",
  agent: async (context) => {
    const { file, changes, projectContext } = context;

    // Analyze changes
    const analysis = await analyzeChanges(changes);

    if (analysis.hasNewPublicMethods) {
      await generateTests(file, analysis.newMethods);
    }

    if (analysis.hasBreakingChanges) {
      await updateDependents(file, analysis.breakingChanges);
      await notifyTeam({ type: "breaking-change", ... });
    }

    await runSmartTests(file, analysis);
  }
};
```

### Kiro MCP Integration (Accurate)

```json
{
  "mcpServers": {
    "aws-services": {
      "command": "kiro-mcp-aws",
      "args": ["--region", "us-east-1"],
      "capabilities": ["lambda", "rds", "s3", "cloudformation"]
    },
    "database": {
      "command": "kiro-mcp-postgres",
      "args": ["--connection", "prod"],
      "capabilities": ["schema", "migrations", "performance"]
    }
  }
}
```

### Accurate Kiro Characteristics

| Aspect              | Description                           |
| ------------------- | ------------------------------------- |
| **Loop Type**       | Spec-driven with event hooks          |
| **Planning**        | EARS format + automatic decomposition |
| **Self-correction** | Spec validation, hook feedback        |
| **Branching**       | Multiple agents possible              |
| **Parallelism**     | Event-driven, configurable            |
| **Context**         | AWS services, database, monitoring    |

### What Makes Kiro Unique

1. **Spec-first approach** - EARS format requirements
2. **AWS integration** - Native cloud services
3. **MCP servers** - Extensible tool integration
4. **Event hooks** - Automated workflows

---

## 4. Windsurf Cascade (Codeium)

### Accurate Loop Type: Flow-Aware with Planning Agent

**Source: Windsurf Cascade Official Documentation**

```
┌─────────────────────────────────────────────────────────────┐
│                 CASCADE ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              PLANNING AGENT (Background)                    │
│  - Specialized agent refines long-term plan                │
│  - Main model focuses on short-term actions                │
│  - Creates Todo list in conversation                       │
│  - Auto-updates plan as new info emerges                  │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   CASCADE CODE   │ │  CASCADE CHAT   │ │   REAL-TIME     │
│   (Autonomous)   │ │ (Conversational)│ │   AWARENESS     │
│                  │ │                 │ │                 │
│ - Make changes   │ │ - Questions      │ │ - Editor state  │
│ - Execute tools  │ │ - Explain code   │ │ - Terminal cmds │
│ - Up to 20 calls │ │ - No edits       │ │ - File edits    │
│ - Continue button│ │                  │ │ - Clipboard     │
└──────────────────┘ └──────────────────┘ └──────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              MEMORIES & RULES                              │
│  • Memories - Persistent project context                   │
│  • AGENTS.md - Agent behavior config                       │
│  • .codeiumignore - File exclusions                       │
│  • MCP servers - Extended capabilities                    │
└─────────────────────────────────────────────────────────────┘
```

### Windsurf Cascade Features (Accurate)

| Feature                   | Description                                         |
| ------------------------- | --------------------------------------------------- |
| **Planning Agent**        | Background agent refines plan while main model acts |
| **Todo Lists**            | Built-in tracking, auto-updates                     |
| **Queued Messages**       | Queue messages while Cascade works                  |
| **Tool Calling**          | Up to 20 calls per prompt, auto-continue option     |
| **Named Checkpoints**     | Snapshot project state, revert anytime              |
| **Real-time Awareness**   | Knows editor actions, terminal, clipboard           |
| **@ Mentions**            | Reference previous conversations                    |
| **Simultaneous Cascades** | Multiple conversations allowed                      |

### Accurate Windsurf Characteristics

| Aspect              | Description                              |
| ------------------- | ---------------------------------------- |
| **Loop Type**       | Flow-aware with planning agent           |
| **Planning**        | Background planning agent + Todo lists   |
| **Self-correction** | Checkpoint reverts, real-time updates    |
| **Branching**       | Multiple Cascade instances               |
| **Parallelism**     | Sequential (but multiple Cascades)       |
| **Context**         | IDE state, terminal, clipboard, memories |

### What Makes Windsurf Unique

1. **Planning agent** - Background planning, main model acts
2. **Flow awareness** - Real-time IDE state tracking
3. **Checkpoints** - Named snapshots with revert
4. **Multiple Cascades** - Parallel conversations

---

## 5. Google Antigravity

### Accurate Loop Type: Three-Surface Architecture with Artifact System

**Source: Google Developers Blog, Documentation**

```
┌─────────────────────────────────────────────────────────────┐
│          GOOGLE ANTIGRAVITY ARCHITECTURE                   │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   SURFACE 1:     │ │   SURFACE 2:     │ │   SURFACE 3:     │
│   USER INTERFACE │ │  AGENT ACTIONS  │ │  ARTIFACTS       │
│                  │ │                  │ │                  │
│ • Chat prompt    │ │ • Terminal       │ │ • Generated code │
│ • Artifact view  │ │ • File edits     │ │ • Tests          │
│ • Approval gates │ │ • Browser ops    │ │ • Docs           │
│ • Mode selector  │ │ • Git commands   │ │ • Config files   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
          ↑                   ↑                   ↑
          └───────────────────┴───────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              DEVELOPMENT MODES                              │
│  • Explore - Learn codebase                                │
│  • Build - Implement features                              │
│  • Fix - Debug issues                                      │
│  • Browser - Web automation                                │
└─────────────────────────────────────────────────────────────┘
```

### Accurate Antigravity Characteristics

| Aspect              | Description                          |
| ------------------- | ------------------------------------ |
| **Loop Type**       | Three-surface with artifacts         |
| **Planning**        | Artifact-based (design, tests, code) |
| **Self-correction** | Artifact review + approval           |
| **Branching**       | Mode-specific workflows              |
| **Parallelism**     | Browser + code operations            |
| **Context**         | Browser state + code                 |

### What Makes Antigravity Unique

1. **Three-surface architecture** - User/Agent/Artifacts
2. **Artifact transparency** - Visible, editable artifacts
3. **Browser-native** - Built-in testing
4. **Development modes** - Explore/Build/Fix/Browser

---

## 6. Trae IDE

### Accurate Loop Type: Context-First with Claude + Gemini

**Source: Trae Documentation, Comparisons**

```
┌─────────────────────────────────────────────────────────────┐
│                    TRAE ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   CONTEXT ENGINE                           │
│  • Codebase awareness                                      │
│  • Project structure                                       │
│  • Dependencies                                           │
│  • Configuration files                                     │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   CLAUDE (Default)│ │    GEMINI       │ │    CUSTOM       │
│   ( Sonnet 4 )   │ │  (Optional)     │ │   MODELS        │
└──────────────────┘ └──────────────────┘ └──────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   WORKFLOW PATTERNS                         │
│  • Simple Edit                                             │
│  • Context Aware                                          │
│  • Multi-file                                             │
└─────────────────────────────────────────────────────────────┘
```

### Trae vs Cursor Comparison (Accurate)

| Feature       | Trae            | Cursor               |
| ------------- | --------------- | -------------------- |
| **Price**     | Free            | Paid (Pro $20/mo)    |
| **Model**     | Claude + Gemini | Claude only          |
| **Context**   | Project-wide    | File-level + history |
| **Planning**  | Basic           | AGENTS.md + Rules    |
| **Subagents** | Limited         | Task tool            |

### Accurate Trae Characteristics

| Aspect              | Description       |
| ------------------- | ----------------- |
| **Loop Type**       | Context-first     |
| **Planning**        | Basic             |
| **Self-correction** | Tool feedback     |
| **Branching**       | None              |
| **Parallelism**     | Sequential        |
| **Context**         | Project structure |

---

## Accurate Loop Architecture Comparison

| IDE             | Loop Control  | Planning       | Execution Model      | Subagents        |
| --------------- | ------------- | -------------- | -------------------- | ---------------- |
| **OpenCode**    | Session-based | Todo list      | Streaming with tools | TaskTool         |
| **Claude Code** | Master Loop   | TodoWrite      | Sequential tools     | Task (stateless) |
| **Cursor**      | Multi-mode    | AGENTS.md      | Tool execution       | Custom agents    |
| **Kiro**        | Spec-driven   | EARS specs     | Event hooks + MCP    | Powers           |
| **Windsurf**    | Flow-aware    | Planning agent | 20 tool calls        | MCP + workflows  |
| **Antigravity** | Three-surface | Artifacts      | Browser + code       | Mode-specific    |
| **Trae**        | Context-first | Basic          | Tool execution       | Limited          |

---

## Tool Integration Comparison

| IDE             | Bash    | Edit | Read | Search  | Web       | MCP       | Custom    |
| --------------- | ------- | ---- | ---- | ------- | --------- | --------- | --------- |
| **OpenCode**    | ✓       | ✓    | ✓    | ✓       | ✓         | Plugin    | ✓         |
| **Claude Code** | ✓       | ✓    | ✓    | ✓       | ✓         | ✗         | ✗         |
| **Cursor**      | ✓       | ✓    | ✓    | ✓       | Via Rules | MCP       | Rules     |
| **Kiro**        | Via MCP | ✓    | ✓    | Via MCP | Via MCP   | ✓         | Hooks     |
| **Windsurf**    | ✓       | ✓    | ✓    | ✓       | ✓         | ✓         | Workflows |
| **Antigravity** | ✓       | ✓    | ✓    | ✓       | ✓         | Via setup | Browser   |
| **Trae**        | ✓       | ✓    | ✓    | ✓       | ✓         | ?         | ?         |

---

## Subagent Architecture Comparison

| IDE             | Subagent Type | Orchestration  | Specialization                |
| --------------- | ------------- | -------------- | ----------------------------- |
| **OpenCode**    | TaskTool      | Parent session | Built-in (explore, general)   |
| **Claude Code** | Task tool     | Hierarchical   | Stateless, concurrent capable |
| **Cursor**      | Custom        | AGENTS.md      | Configurable                  |
| **Kiro**        | Powers        | Multi-agent    | Role-based (AWS, database)    |
| **Windsurf**    | MCP           | Flow-based     | Context-aware                 |
| **Antigravity** | Browser       | Surface-based  | Mode-specific                 |
| **Trae**        | Limited       | Basic          | None                          |

---

## Key Insights from Accurate Research

### 1. Claude Code's "Simplicity" is Deliberate

- **Single-threaded** - No complex orchestration
- **Stateless subagents** - Task tool spawns independent agents
- **Todo list first-class** - Planning is core, not optional
- **Model does the work** - Claude 4 handles complexity

### 2. Windsurf's "Flow Awareness" is Unique

- **Planning agent runs in background** - Refines plan while main model acts
- **Real-time IDE state** - Knows terminal, clipboard, cursor position
- **Checkpoints** - Named snapshots with easy revert
- **Multiple Cascades** - Parallel conversations possible

### 3. Kiro's "Spec-Driven" is Architectural

- **EARS format** - Standardized requirements syntax
- **Automatic decomposition** - Specs → tasks automatically
- **Event hooks** - Respond to file saves, commits, etc.
- **MCP integration** - Connect to AWS, databases, monitoring

### 4. All IDEs Share Common Patterns

| Pattern                  | Used By                         |
| ------------------------ | ------------------------------- |
| Todo/Task list           | Claude Code, Windsurf, OpenCode |
| Subagent spawning        | All major IDEs                  |
| MCP/Plugin extensibility | Kiro, Windsurf, Cursor          |
| Context awareness        | All major IDEs                  |
| Planning mode            | Cursor, Windsurf                |

---

## Recommendations for OpenCode

Based on accurate research, here are the most valuable patterns to consider:

### High Value, Low Effort

1. **Todo list as first-class** - Make TodoWrite/TodoRead prominent
2. **Planning agent background** - Refine plan while executing
3. **Checkpoint/revert system** - Named snapshots with easy revert

### Medium Value, Medium Effort

4. **MCP integration** - Plugin system already exists
5. **Real-time awareness** - Track editor state
6. **Simultaneous sessions** - Multiple conversations

### High Value, High Effort

7. **Spec-driven development** - EARS format integration
8. **Event hooks** - Respond to IDE events
9. **Flow awareness** - Terminal, clipboard, cursor tracking

---

## References

1. Claude Code System Prompt (GitHub Gist by wong2)
2. Claude Code Bash Tool Documentation (platform.claude.com)
3. Kiro Architecture Documentation (kiro.directory)
4. Windsurf Cascade Documentation (docs.windsurf.com)
5. Google Antigravity Blog (developers.googleblog.com)

---

_Document created: December 2025_
_Last updated: December 31, 2025_
