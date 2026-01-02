# Missing Docs and Triage Agent Options

## Problem Statement

Some agents in the OpenCode desktop GUI do not have the option to be set to **Docs** and **Triage** modes, only **Build** and **Plan**. This affects:

- Some projects/repositories where ALL agents (including new and old ones) only show Build and Plan options
- Projects that don't have custom agent configurations

## Root Cause Analysis

### Built-in vs Custom Agents

OpenCode has two types of agents:

**Built-in Agents** (defined in code):

- `build` - mode: primary, native: true
- `plan` - mode: primary, native: true
- `general` - mode: subagent, hidden: true
- `explore` - mode: subagent
- `compaction` - mode: primary, hidden: true
- `title` - mode: primary, hidden: true
- `summary` - mode: primary, hidden: true

**Custom Agents** (defined by users):

- Can be created in `opencode.json` or `.opencode/agent/*.md` files
- Default mode for custom agents is "all" (can function as both primary and subagent)

### The Issue

**Docs and Triage are NOT built-in agents.** They are custom agents that exist in the OpenCode repository's own `.opencode/agent/` directory:

- `.opencode/agent/docs.md` - Documentation writing agent (no mode specified → defaults to "all")
- `.opencode/agent/triage.md` - GitHub issue triage agent (mode: primary, hidden: true)

### Why They Don't Appear

These agents only appear when:

1. The project has its own `.opencode/agent/docs.md` and `.opencode/agent/triage.md` files, OR
2. The user has a global `~/.opencode/agent/` directory with these files

**There is NO initialization process that creates these default agents for new projects.**

### Configuration Loading Priority

Agents are loaded from multiple directories in this order:

1. Global config: `~/.config/opencode/`
2. `.opencode` directories found from current directory up to git worktree root
3. `.opencode` directory in home directory
4. Any directory specified via `OPENCODE_CONFIG_DIR` flag

For each directory, the system loads:

- `opencode.json` or `opencode.jsonc` configuration files
- `agent/*.md` markdown files with agent definitions
- Other resources (commands, plugins, etc.)

### UI Filtering Logic

The agent selector in the GUI filters agents with this logic:

```typescript
// packages/app/src/context/local.tsx, line 66
const list = createMemo(() => sync.data.agent.filter((x) => x.mode !== "subagent" && !x.hidden))
```

Only agents that are:

- NOT subagents (`mode !== "subagent"`)
- NOT hidden (`!hidden`)

are visible in the UI dropdown.

### Triage Agent Visibility Issue

The triage agent in `.opencode/agent/triage.md` has:

```yaml
mode: primary
hidden: true # ← This prevents it from appearing in the UI
```

Even when loaded, this agent is hidden from the UI selection.

## Potential Solutions

### Option 1: Make Docs and Triage Built-in Agents

Add Docs and Triage as built-in primary agents in `packages/opencode/src/agent/agent.ts`:

**Pros:**

- Always available in all projects
- Consistent user experience
- Matches task detector expectations (task detector has "docs" pattern)

**Cons:**

- Adds complexity to core agent set
- Triage is GitHub-specific, not universally applicable
- Users might want custom implementations
- Increases bundle size

### Option 2: Create Initialization Command

Create a CLI command (e.g., `opencode init agents`) that creates default agents in `~/.opencode/agent/`:

**Pros:**

- Users can opt-in to default agents
- Can customize agents before initialization
- Keeps core lightweight
- Preserves current architecture

**Cons:**

- Requires user action
- May not be discoverable
- Confusion if some users have it and some don't

### Option 3: Remove hidden flag from Triage

Change triage.md to remove the `hidden: true` flag:

**Pros:**

- Minimal change
- Triage becomes available when .opencode is present
- Backward compatible

**Cons:**

- Triage requires GitHub-triage tool which may not always be available
- Still requires .opencode directory to exist in project or global config

### Option 4: Hybrid Approach

- Make Docs a built-in primary agent (widely applicable)
- Keep Triage as custom agent but remove `hidden: true` flag
- Provide initialization command for global agents

**Pros:**

- Best of both worlds
- Docs always available
- Triage opt-in but visible when configured

**Cons:**

- More complex implementation
- Different behavior for Docs vs Triage

## Recommended Solution

**Option 4 (Hybrid Approach)** with these steps:

1. **Add Docs as Built-in Agent**
   - Add to `packages/opencode/src/agent/agent.ts` with mode: "primary"
   - Include system prompt from `.opencode/agent/docs.md`
   - Similar to build/plan agents

2. **Update Triage Configuration**
   - Remove `hidden: true` from `.opencode/agent/triage.md`
   - Add description for clarity
   - Document that it requires github-triage tool

3. **Add Agent Initialization**
   - Create `opencode init agents` command
   - Copies default agents to `~/.opencode/agent/`
   - Prompts user for agent choices

4. **Update Documentation**
   - Document built-in agents (build, plan, docs)
   - Explain how to add custom agents
   - Describe triage agent requirements

## Implementation Tasks

- [ ] Add Docs agent as built-in in `packages/opencode/src/agent/agent.ts`
- [ ] Update `.opencode/agent/triage.md` to remove `hidden: true`
- [ ] Create CLI command for agent initialization
- [ ] Update docs to reflect agent types
- [ ] Test agent loading across different project configurations
- [ ] Update task detector to reference built-in Docs agent

## Related Files

- `packages/opencode/src/agent/agent.ts` - Built-in agent definitions
- `packages/opencode/src/config/config.ts` - Agent loading logic
- `packages/app/src/context/local.tsx` - Agent filtering in UI
- `packages/opencode/src/model/task-detector.ts` - Task pattern detection
- `.opencode/agent/docs.md` - Docs agent definition
- `.opencode/agent/triage.md` - Triage agent definition
