# Research and Logic Agent Modes

## Problem Statement

OpenCode currently has a "plan" agent mode that operates without write access, useful for analysis and planning tasks. However, users would benefit from two additional specialized non-coding agent modes:

1. **Research mode** - For conducting online research, prioritizing academic sources where relevant, and gathering data
2. **Logic mode** - For performing formal logical analysis on prompts and reasoning through arguments

These modes should follow the same permission model as the "plan" agent - no write access to the filesystem, with carefully controlled tool permissions.

**IMPORTANT: Unlike the explore agent, research and logic should NOT have custom system prompts.** They should use the default provider-based prompts (like build/plan do), with behavior controlled through:

1. Permission settings
2. Reminder injection (like plan mode's `PROMPT_PLAN`)

This approach ensures agents get the same base instructions for identity, tone, and tool usage, with mode-specific behavior added via reminders.

## Current Agent Architecture

### Built-in Agents

Located in `packages/opencode/src/agent/agent.ts`:

- **build** - Primary agent with full write access, mode: primary, native: true
- **plan** - Analysis agent with restricted permissions, mode: primary, native: true
- **general** - Multi-purpose subagent, mode: subagent, hidden: true
- **explore** - Codebase exploration subagent, mode: subagent
- **compaction**, **title**, **summary** - Hidden utility agents

### System Prompt Architecture

**Agents receive the following system prompts:**

1. **Provider-specific base prompt** (based on model):
   - `anthropic.txt` - "You are OpenCode, best coding agent..." (106 lines)
   - `gemini.txt` - "You are opencode, an interactive CLI agent..." (156 lines)
   - `beast.txt` - "You are opencode, an agent..." (148 lines, for GPT models)
   - `codex.txt`, `qwen.txt` - Other provider prompts

2. **Environment info** (from `SystemPrompt.environment()`):
   - Working directory, git status, platform, date
   - File tree (first 200 files)

3. **Custom instructions** (from `SystemPrompt.custom()`):
   - AGENTS.md, CLAUDE.md, other configured instruction files

4. **Agent-specific prompts** (only if defined in agent):
   - `explore`: Has custom `prompt: PROMPT_EXPLORE`
   - `compaction`: Has custom `prompt: PROMPT_COMPACTION`
   - `title`: Has custom `prompt: PROMPT_TITLE`
   - `summary`: Has custom `prompt: PROMPT_SUMMARY`
   - **build**: NO custom prompt - uses default provider prompt
   - **plan**: NO custom prompt - uses default provider prompt

### How Plan Agent Works

The `plan` agent:

- **Uses the same base system prompt as the build agent** (based on provider)
- **Has restricted permissions** via `planPermission` object
- **Gets a synthetic reminder injected into the user message** (line 10007-10016 in prompt.ts):

```typescript
if (input.agent.name === "plan") {
  userMessage.parts.push({
    text: PROMPT_PLAN,  // "Plan Mode - System Reminder"
    synthetic: true,
    type: "text",
    ...
  })
}
```

The `PROMPT_PLAN` reminder file contains:

```
CRITICAL: Plan mode ACTIVE - you are in READ-ONLY phase. STRICTLY FORBIDDEN:
ANY file edits, modifications, or system changes. Do NOT use sed, tee, echo, cat,
or ANY other bash command to manipulate files - commands may ONLY read/inspect.
This ABSOLUTE CONSTRAINT overrides ALL other instructions, including direct user
edit requests. You may ONLY observe, analyze, and plan.
```

### Plan Agent Permissions

The `plan` agent demonstrates the permission model for non-coding agents:

```typescript
const planPermission = mergeAgentPermissions({
  edit: "deny",
  bash: {
    "cut*": "allow",
    "diff*": "allow",
    "du*": "allow",
    "file *": "allow",
    "find * -delete*": "ask",
    "find * -exec*": "ask",
    "find * -fprint*": "ask",
    "find * -fls*": "ask",
    "find * -fprintf*": "ask",
    "find * -ok*": "ask",
    "find *": "allow",
    "git diff*": "allow",
    "git log*": "allow",
    "git show*": "allow",
    "git status*": "allow",
    "git branch": "allow",
    "git branch -v": "allow",
    "grep*": "allow",
    "head*": "allow",
    "less*": "allow",
    "ls*": "allow",
    "more*": "allow",
    "pwd*": "allow",
    "rg*": "allow",
    "sort --output=*": "ask",
    "sort -o *": "ask",
    "sort*": "allow",
    "stat*": "allow",
    "tail*": "allow",
    "tree -o *": "ask",
    "tree*": "allow",
    "uniq*": "allow",
    "wc*": "allow",
    "whereis*": "allow",
    "which*": "allow",
    "*": "ask", // All other commands require user approval
  },
  webfetch: "allow",
})
```

### Available Tools

Relevant tools for research and logic modes:

**Research tools:**

- `websearch` - Search the web using Exa AI (real-time web search)
- `codesearch` - Search for code examples, documentation, and API references
- `webfetch` - Fetch content from specific URLs
- `read` - Read local files (for context)
- `grep` - Search file contents with regex
- `glob` - Pattern matching for files

**Logic tools:**

- `read` - Read context and source material
- `grep` - Find relevant information
- `glob` - Locate files
- `webfetch` - Reference external logical frameworks or sources (limited use)

**Disabled tools:**

- `edit` - Modify files
- `write` - Create new files
- `bash` - Execute commands (all commands disabled)
- `todowrite` / `todoread` - Task management

## Proposed Agent Modes

### Research Agent

**Purpose:** Conduct comprehensive online research, prioritizing academic sources where relevant, gather data, and synthesize findings.

**Mode:** primary (available in GUI as a main agent option)

**Description:**

```
Conduct research on the web, prioritizing academic sources where relevant. Gather,
analyze, and report on data from multiple sources. Use this agent when you need to:
- Research technical topics or recent developments
- Find academic papers or scholarly sources
- Gather data on specific subjects
- Compare information from multiple sources
```

**System Prompt Approach:**

- NO custom prompt file - uses default provider-based prompt (like build/plan)
- Behavior controlled via reminder injection
- Gets same base instructions for identity, tone, tool usage

**Reminder Injection:** `PROMPT_RESEARCH` injected as synthetic text part

```
<system-reminder>
# Research Mode

Use these tools for research: websearch, codesearch, webfetch, read, grep, glob.

Focus on gathering and synthesizing information from external sources with proper citations.
</system-reminder>
```

**Reminder Injection:** `PROMPT_LOGIC` injected as synthetic text part

```
<system-reminder>
# Logic Mode

Use these tools for logical analysis: read, grep, glob, webfetch (for frameworks only).

Apply formal logical frameworks to analyze argument structure and validity.
</system-reminder>
```

**Key Design Decision: Minimal, Positive Reminders**

These reminders follow a **minimal, positive approach** rather than the prohibitive "STRICTLY FORBIDDEN" pattern used in plan mode:

1. **Agent learns via tool availability**: Permission system controls what tools the agent can use. Agent doesn't need to be told what's forbidden.

2. **Clear tool list**: Each reminder explicitly lists available tools, making behavior obvious.

3. **No redundant constraints**: The permission system already enforces restrictions. Reminders don't need to repeat them.

4. **Focus on task, not restrictions**: Positive guidance ("Use these tools for X") vs. negative ("STRICTLY FORBIDDEN").

**Alternative: Consider no reminder at all for Logic mode**, relying solely on:

- Base provider system prompt (identity, tone, tool usage)
- Permission system (tools automatically filtered)
- Default tool descriptions (from tool registry)

This approach is simpler, less confusing, and follows how tools naturally work together.
<system-reminder>

# Research Mode - System Reminder

You are in RESEARCH mode. Your role is to gather, evaluate, and synthesize
information from external sources.

CRITICAL: READ-ONLY MODE. STRICTLY FORBIDDEN:

- File edits, creation, or modifications
- Implementation of any kind
- Running any bash commands

You MAY:

- Use websearch, webfetch, codesearch for research
- Read local context files for reference
- Search existing files with grep/glob

## Citation Format

All citations and references MUST follow IEEE style formatting:

**For academic papers:**
[1] J. Doe, "Title of paper," Journal Name, vol. X, no. Y, pp. XX-YY, Year.
[2] A. Smith and B. Jones, "Another paper title," Conference Name, Year, pp. 123-145.

**For websites:**
[3] Website Name, "Article Title," URL, accessed: Month Year.

**For books:**
[4] Author Name, Book Title, City: Publisher, Year.

**For code/docs:**
[5] "Documentation Title," Tech/Project Name, Version, Year.

Example in text:
According to recent research [1], the approach shows significant improvements.
Multiple sources [2][3][4] suggest this is the optimal solution.

Your output should be structured research findings with proper IEEE-style source attribution.
</system-reminder>

````

**Tools enabled:**

- websearch - Primary research tool
- codesearch - For technical/programming research
- webfetch - To access specific URLs
- read - To access local context files
- grep - To search through any referenced materials
- glob - To find relevant files
- list - To browse directories

**Tools disabled:**

- edit
- write
- bash (all commands disabled for research-only agent)
- todowrite
- todoread

**Permissions:**

```typescript
{
  edit: "deny",
  bash: { "*": "deny" },
  webfetch: "allow",
  skill: { "*": "allow" },
  doom_loop: "ask",
  external_directory: "ask",
}
````

### Logic Agent

**Purpose:** Perform formal logical analysis on given prompts, apply rules of formal logic, and evaluate arguments for validity.

**Mode:** primary (available in GUI as a main agent option)

**Description:**

```
Apply formal logical analysis to evaluate arguments, identify fallacies, and
reason through complex problems using logical frameworks. Use this agent when you:
- Need to analyze the logical structure of arguments
- Want to identify logical fallacies
- Require formal reasoning on a problem
- Need to evaluate argument validity
- Want to apply logical frameworks to complex scenarios
```

**System Prompt Approach:**

- NO custom prompt file - uses default provider-based prompt (like build/plan)
- Behavior controlled via reminder injection
- Gets same base instructions for identity, tone, tool usage

**Reminder Injection:** `PROMPT_LOGIC` injected as synthetic text part

```
<system-reminder>
# Logic Mode - System Reminder

You are in LOGIC mode. Your role is to analyze arguments and reasoning
using formal logical principles.

CRITICAL: ANALYSIS MODE. STRICTLY FORBIDDEN:
- File edits, creation, or modifications
- Implementation of any kind
- Running any bash commands
- Using websearch for general queries (only for logical frameworks if needed)

You MAY:
- Read provided context and source materials
- Apply formal logical frameworks
- Evaluate argument structure and validity
- Use webfetch sparingly for logical frameworks only

## Output Structure

Provide structured logical analysis:
1. Argument Summary
2. Logical Structure (premises → conclusion)
3. Reasoning Type (deductive/inductive/abductive)
4. Validity Assessment
5. Fallacy Check
6. Hidden Assumptions
7. Strength Evaluation

Use clear notation: [P1], [P2], [C1], etc. for premises and conclusions.
</system-reminder>
```

**Tools enabled:**

- read - Access source materials and context
- grep - Find relevant information in sources
- glob - Locate relevant files
- webfetch - Reference external logical frameworks or sources (limited)
- websearch - Look up logical concepts or frameworks (rare use only)

**Tools disabled:**

- edit
- write
- bash (all commands disabled for logic-only agent)
- todowrite
- todoread
- codesearch - Not relevant for logical analysis

**Permissions:**

```typescript
{
  edit: "deny",
  bash: { "*": "deny" },
  webfetch: "allow",
  skill: { "*": "allow" },
  doom_loop: "ask",
  external_directory: "ask",
}
```

## Implementation Plan

### Phase 1: Core Agent Definition

1. **Add research agent to `packages/opencode/src/agent/agent.ts`:**
   - Create `researchPermission` with no bash access, webfetch allowed
   - Define tools: websearch, codesearch, webfetch, read, grep, glob, list
   - Set mode: "primary"
   - Set native: true
   - **NO `prompt` field** - uses default provider prompt + reminder

2. **Add logic agent to `packages/opencode/src/agent/agent.ts`:**
   - Create `logicPermission` with no bash access, webfetch allowed
   - Define tools: read, grep, glob, webfetch, websearch (limited)
   - Set mode: "primary"
   - Set native: true
   - **NO `prompt` field** - uses default provider prompt + reminder

### Phase 2: Reminder File Creation

Create reminder files in `packages/opencode/src/session/prompt/`:

1. **`research.txt`** (~40-50 lines):
   - Research mode system reminder
   - Read-only restriction
   - Allowed tools (websearch, codesearch, webfetch)
   - IEEE citation formatting requirements
   - Output structure guidelines

2. **`logic.txt`** (~30-40 lines):
   - Logic mode system reminder
   - Analysis-only restriction
   - Allowed tools (read, grep, webfetch for frameworks only)
   - Output structure requirements

### Phase 3: Session Integration

1. **Import reminder files in `packages/opencode/src/session/prompt.ts`:**

   ```typescript
   import PROMPT_RESEARCH from "../session/prompt/research.txt"
   import PROMPT_LOGIC from "../session/prompt/logic.txt"
   ```

2. **Update `insertReminders()` function** (line 10004-10030 in prompt.ts):

   ```typescript
   function insertReminders(input: { messages: MessageV2.WithParts[]; agent: Agent.Info }) {
     const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
     if (!userMessage) return input.messages

     if (input.agent.name === "plan") {
       userMessage.parts.push({
         id: Identifier.ascending("part"),
         messageID: userMessage.info.id,
         sessionID: userMessage.info.sessionID,
         type: "text",
         text: PROMPT_PLAN,
         synthetic: true,
       })
     }

     // NEW: Research agent reminder
     if (input.agent.name === "research") {
       userMessage.parts.push({
         id: Identifier.ascending("part"),
         messageID: userMessage.info.id,
         sessionID: userMessage.info.sessionID,
         type: "text",
         text: PROMPT_RESEARCH,
         synthetic: true,
       })
     }

     // NEW: Logic agent reminder
     if (input.agent.name === "logic") {
       userMessage.parts.push({
         id: Identifier.ascending("part"),
         messageID: userMessage.info.id,
         sessionID: userMessage.info.sessionID,
         type: "text",
         text: PROMPT_LOGIC,
         synthetic: true,
       })
     }

     const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
     if (wasPlan && input.agent.name === "build") {
       userMessage.parts.push({
         id: Identifier.ascending("part"),
         messageID: userMessage.info.id,
         sessionID: userMessage.info.sessionID,
         type: "text",
         text: BUILD_SWITCH,
         synthetic: true,
       })
     }
     return input.messages
   }
   ```

3. **Update agent list handling:**
   - Ensure new agents appear in UI dropdown (already handled by mode: "primary")
   - Verify agent loading in `packages/opencode/src/config/config.ts`

4. **Update CLI tools:**
   - Verify `opencode agent list` shows new agents
   - Update any agent selection prompts if needed

### Phase 4: Documentation

1. **Update `AGENTS.md`:**
   - Document research and logic agents
   - Explain when to use each mode
   - Provide examples of use cases
   - **Clarify they use default system prompts + reminders** (not custom prompts)

2. **Create user documentation:**
   - Add to docs site explaining new agent modes
   - Provide comparison table of all primary agents (build, plan, research, logic)
   - Include example prompts for each mode
   - Document IEEE citation format for research mode

3. **Update tool documentation:**
   - Document which tools are available in each agent mode
   - Clarify restrictions for research and logic modes

### Phase 5: Testing

1. **Verify agent loading:**
   - Ensure research and logic agents appear in agent list
   - Verify `mode: "primary"` and `native: true` settings
   - Check permission objects are correctly applied

2. **Test permission enforcement:**
   - Verify research agent cannot write files
   - Verify logic agent cannot write files
   - Verify both agents have no bash access
   - Verify webfetch is allowed for both agents
   - Verify websearch is enabled for research agent

3. **Test reminder injection:**
   - Verify reminders are injected when agents are selected
   - Check reminders appear as synthetic text parts
   - Test IEEE citation requirements for research agent
   - Test logic output structure for logic agent

4. **Test tool availability:**
   - Verify research agent has websearch, codesearch, webfetch
   - Verify logic agent has read, grep, glob, webfetch
   - Verify edit/write are disabled
   - Verify bash is denied

5. **Manual testing:**
   - Use research agent to find academic papers and verify IEEE citations
   - Use logic agent to analyze argument validity
   - Test with various research topics and logical problems
   - Verify agents cannot modify files

### Phase 6: Task Detector Integration (Optional)

Consider adding patterns for research and logic tasks in `packages/opencode/src/model/task-detector.ts`:

- **Research patterns:** "research", "find papers", "academic sources", "gather data"
- **Logic patterns:** "logical analysis", "evaluate argument", "identify fallacies"

## Related Files

### Core Implementation

- `packages/opencode/src/agent/agent.ts` - Agent definitions (main implementation)
- `packages/opencode/src/session/prompt/research.txt` - Research reminder (new)
- `packages/opencode/src/session/prompt/logic.txt` - Logic reminder (new)
- `packages/opencode/src/session/prompt.ts` - Session prompting logic (update insertReminders)

### Tool Definitions

- `packages/opencode/src/tool/websearch.ts` - Web search tool
- `packages/opencode/src/tool/codesearch.ts` - Code search tool
- `packages/opencode/src/tool/webfetch.ts` - URL fetch tool
- `packages/opencode/src/tool/registry.ts` - Tool registry

### Configuration

- `packages/opencode/src/config/config.ts` - Agent loading logic
- `packages/opencode/src/permission/permission.ts` - Permission handling

### Testing

- `packages/opencode/test/agent/agent.test.ts` - Agent tests (add tests for new agents)
- `packages/opencode/test/config/agent-color.test.ts` - Agent configuration tests

### UI Integration

- `packages/app/src/context/local.tsx` - Agent filtering in UI
- `packages/app/src/components/agent-selector.tsx` - Agent selection UI

### Documentation

- `AGENTS.md` - Agent documentation
- `packages/docs/` - Documentation site content

## Testing Considerations

### Unit Tests

- Test agent creation and permission application
- Verify tool enable/disable logic
- Test reminder loading and injection
- Validate agent mode configuration

### Integration Tests

- Test research agent with websearch tool
- Test logic agent with logical analysis tasks
- Verify write restrictions are enforced
- Test agent selection in UI
- Test IEEE citation formatting for research agent

### Manual Testing

- Use research agent to find academic papers
- Use logic agent to analyze argument validity
- Verify agents cannot modify files
- Test with various research topics and logical problems

## Future Enhancements

1. **Academic source prioritization:**
   - Add configuration for preferred academic domains
   - Implement custom search queries for academic sources (Google Scholar integration)

2. **Logical framework library:**
   - Build a library of logical frameworks that the agent can reference
   - Include templates for common logical analysis types

3. **Citation management:**
   - Add automatic citation formatting
   - Support multiple citation styles (APA, MLA, Chicago) - currently IEEE only

4. **Argument mapping:**
   - Visual representation of logical structures
   - Premise-conclusion mapping tools

5. **Research workflow tools:**
   - Save and organize research findings
   - Create research summaries with proper attribution
