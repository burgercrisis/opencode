# Adding Loop Selection to OpenCode: Implementation Analysis

> Document created: December 2025
> Author: OpenCode Research
> Purpose: Analyze feasibility and implementation path for selecting agentic loops

---

## Executive Summary

**Difficulty Assessment: Medium-High**

The OpenCode architecture is well-designed and extensible, but loop selection is not currently parametrized. Adding this feature requires refactoring the loop to be pluggable while maintaining backward compatibility with existing sessions.

**Recommended Approach:**

1. Add loop registry pattern
2. Move existing logic to "default" loop (zero functional change)
3. Implement ReAct as second option (simplest alternative)
4. Add UI selector with fallback to "default"

---

## Table of Contents

1. [Difficulty Assessment](#1-difficulty-assessment)
2. [File Dependency Map](#2-file-dependency-map)
3. [Current Architecture Analysis](#3-current-architecture-analysis)
4. [Required Changes by Category](#4-required-changes-by-category)
5. [Implementation Effort Breakdown](#5-implementation-effort-breakdown)
6. [Backward Compatibility Strategy](#6-backward-compatibility-strategy)
7. [Risk Assessment](#7-risk-assessment)
8. [Step-by-Step Implementation Plan](#8-step-by-step-implementation-plan)
9. [Code Examples](#9-code-examples)

---

## 1. Difficulty Assessment

| Factor             | Difficulty      | Notes                                             |
| ------------------ | --------------- | ------------------------------------------------- |
| Schema changes     | Low             | Straightforward Zod extensions                    |
| Core loop refactor | High            | Must extract logic into switchable functions      |
| UI integration     | Medium          | Follows existing agent/model pattern              |
| Testing            | High            | Need integration tests per loop type              |
| Documentation      | Low             | Add loop descriptions                             |
| **Overall**        | **Medium-High** | Well-designed but requires architectural thinking |

**Key Challenge:** The loop is currently a monolithic `while (true)` in `prompt.ts`. To make it pluggable, you need to extract phases into discrete functions that can be recomposed.

---

## 2. File Dependency Map

### CORE LOOP FILES (Must Modify)

| File                                          | Lines   | Purpose                                        | Change Type      | Priority |
| --------------------------------------------- | ------- | ---------------------------------------------- | ---------------- | -------- |
| `packages/opencode/src/session/prompt.ts`     | 230-563 | Main `SessionPrompt.loop()` function           | Major refactor   | P0       |
| `packages/opencode/src/session/processor.ts`  | 24-409  | Inner `SessionProcessor.process()` stream loop | Major refactor   | P0       |
| `packages/opencode/src/session/llm.ts`        | 35-188  | `LLM.stream()` integration point               | Minor            | P1       |
| `packages/opencode/src/session/message-v2.ts` | 292-314 | `User` message schema (stores agent)           | Schema extension | P0       |

### SECONDARY FILES (Must Update)

| File                                             | Purpose                   | Change Type         | Priority |
| ------------------------------------------------ | ------------------------- | ------------------- | -------- |
| `packages/opencode/src/agent/agent.ts:19-52`     | `Agent.Info` schema       | Add `loop` field    | P0       |
| `packages/opencode/src/config/config.ts:400-436` | Agent config schema       | Add `loop` config   | P1       |
| `packages/opencode/src/session/index.ts:329-335` | `Session.updateMessage()` | Support new schema  | P1       |
| `packages/opencode/src/server/server.ts:1325`    | HTTP API endpoint         | Pass `loop` through | P1       |

### UI FILES (Should Update)

| File                                           | Purpose                              | Priority |
| ---------------------------------------------- | ------------------------------------ | -------- |
| `packages/app/src/context/local.tsx`           | `agent` and `model` state management | P1       |
| `packages/app/src/components/prompt-input.tsx` | Model/Agent selector UI              | P1       |
| `packages/app/src/pages/session.tsx`           | Slash commands for cycling           | P2       |
| `packages/app/src/context/global-sync.tsx`     | Sync agent list from server          | P1       |

### TERTIARY FILES (May Update)

| File                                          | Purpose                           | Priority |
| --------------------------------------------- | --------------------------------- | -------- |
| `packages/opencode/src/tool/task.ts`          | Subagent loop inheritance         | P2       |
| `packages/opencode/src/session/compaction.ts` | Loop-specific compaction behavior | P2       |
| `packages/opencode/src/bus/index.ts`          | Event types for loop changes      | P3       |

---

## 3. Current Architecture Analysis

### How Model + Agent Selection Works Currently

```
User Input
    ↓
DialogSelectModel / Agent Selector (UI)
    ↓
global-sync.ts: `agent.set(name)` / `model.set(key)`
    ↓
prompt-input.tsx: Builds `PromptInput` with agent & model
    ↓
server.ts: `POST /session/:sessionID/message`
    ↓
SessionPrompt.prompt() → loop()
    ↓
Agent.get(lastUser.agent) // Retrieves agent config
Provider.getModel(...)    // Retrieves model config
    ↓
SessionProcessor.process() // Uses both configs
```

### Current Data Flow

```
MessageV2.User {
  agent: string        ← Stored here
  model: { providerID, modelID }
  system?: string      ← Optional system prompt
  tools?: Record<string, boolean>
}
```

**Critical Finding:** The **loop type is NOT stored anywhere** - it's hardcoded in `prompt.ts:242`.

### Current Hardcoded Loop

```typescript
// prompt.ts:242
let step = 0
while (true) {
  // Current loop logic is inline here
  // No way to switch to different loop pattern
}
```

### Key Integration Points

| Point              | File        | Line | Current Behavior               |
| ------------------ | ----------- | ---- | ------------------------------ |
| Agent retrieval    | `prompt.ts` | 474  | `Agent.get(lastUser.agent)`    |
| Model retrieval    | `prompt.ts` | 285  | `Provider.getModel(...)`       |
| Processor creation | `prompt.ts` | 482  | `SessionProcessor.create(...)` |
| Tool resolution    | `prompt.ts` | 511  | `resolveTools({...})`          |

---

## 4. Required Changes by Category

### 4.1 SCHEMA CHANGES (High Priority)

#### MessageV2 User Schema (`message-v2.ts:292-314`)

**Current:**

```typescript
export const User = Base.extend({
  role: z.literal("user"),
  agent: z.string(),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }),
  system: z.string().optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
})
```

**After:**

```typescript
export const User = Base.extend({
  role: z.literal("user"),
  agent: z.string(),
  loop: z.string().optional().describe("Agentic loop type: default, react, plan-execute, tot, reflexion"),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }),
  system: z.string().optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
})
```

#### Agent Info Schema (`agent.ts:19-52`)

**After:**

```typescript
export const Info = z.object({
  name: z.string(),
  description: z.string().optional(),
  loop: z.string().optional().default("default").describe("Default loop type for this agent"),
  mode: z.enum(["subagent", "primary", "all"]),
  // ... existing fields
})
```

#### Config Schema (`config.ts:400-436`)

**After:**

```typescript
export const Agent = z.object({
  // ... existing fields
  loop: z.string().optional().describe("Agentic loop to use: default, react, plan-execute, tot, reflexion"),
})
```

### 4.2 CORE LOOP REFACTORING (Highest Priority)

#### Loop Registry Pattern

Create new file: `packages/opencode/src/loop/registry.ts`

```typescript
import type { SessionProcessor } from "../session/processor"
import type { MessageV2 } from "../session/message-v2"
import type { Agent } from "../agent/agent"

export interface LoopConfig {
  id: string
  name: string
  description: string
  defaultParameters?: Record<string, any>
}

export interface Loop {
  config: LoopConfig
  process: (context: {
    sessionID: string
    lastUser: MessageV2.User
    agent: Agent.Info
    processor: SessionProcessor
  }) => Promise<"stop" | "continue">
}

const loops = new Map<string, Loop>()

export function registerLoop(loop: Loop): void {
  loops.set(loop.config.id, loop)
}

export function getLoop(id: string): Loop | null {
  return loops.get(id) ?? null
}

export function listLoops(): Loop[] {
  return Array.from(loops.values())
}

export function getDefaultLoop(): Loop {
  return loops.get("default")!
}
```

#### Refactored Main Loop (`prompt.ts`)

**Current (lines 230-563):**

```typescript
export const loop = fn(Identifier.schema("session"), async (sessionID) => {
  let step = 0
  while (true) {
    // ... monolithic loop logic
  }
})
```

**After Refactor:**

```typescript
import { getLoop, getDefaultLoop } from "../loop/registry"

export const loop = fn(Identifier.schema("session"), async (sessionID) => {
  // Get last user message to determine loop type
  const lastUser = await getLastUser(sessionID)
  const agent = await Agent.get(lastUser.agent)

  // Determine loop type (priority: user message > agent config > default)
  const loopType = lastUser.loop ?? agent.loop ?? "default"

  // Get appropriate loop implementation
  const loopImpl = getLoop(loopType) ?? getDefaultLoop()

  // Create processor
  const processor = await createProcessor(sessionID, lastUser)

  // Execute loop
  while (true) {
    const result = await loopImpl.process({
      sessionID,
      lastUser,
      agent,
      processor,
    })

    if (result === "stop") break

    // Refresh lastUser for next iteration
    lastUser = await getLastUser(sessionID)
  }
})
```

#### Loop Implementations

**packages/opencode/src/loop/default.ts** (Move existing logic):

```typescript
import { registerLoop, type Loop } from "./registry"

export const defaultLoop: Loop = {
  config: {
    id: "default",
    name: "Default",
    description: "Standard OpenCode loop with tool calls and streaming",
  },
  async process(context) {
    // Move existing logic from prompt.ts:242-551 here
    // ... existing step-by-step logic

    return "continue" or "stop"
  },
}

registerLoop(defaultLoop)
```

**packages/opencode/src/loop/react.ts** (ReAct implementation):

```typescript
import { registerLoop, type Loop } from "./registry"

export const reactLoop: Loop = {
  config: {
    id: "react",
    name: "ReAct",
    description: "Reasoning + Acting pattern with explicit thought-action-observation cycles",
  },
  async process(context) {
    // Implement ReAct pattern:
    // 1. Generate reasoning trace (THOUGHT)
    // 2. Decide action (ACTION)
    // 3. Execute action
    // 4. Receive observation (OBSERVATION)
    // 5. Analyze and repeat

    return "continue" or "stop"
  },
}

registerLoop(reactLoop)
```

**packages/opencode/src/loop/plan-execute.ts** (Plan-Execute implementation):

```typescript
import { registerLoop, type Loop } from "./registry"

export const planExecuteLoop: Loop = {
  config: {
    id: "plan-execute",
    name: "Plan-Execute",
    description: "Separate planning phase from execution phase",
  },
  async process(context) {
    // Implement Plan-Execute pattern:
    // 1. PLANNING: Create detailed step-by-step plan
    // 2. EXECUTION: Execute steps one by one
    // 3. REVISE: Replan if step fails

    return "continue" or "stop"
  },
}

registerLoop(planExecuteLoop)
```

### 4.3 INNER PROCESSOR REFACTORING

**processor.ts** - Make inner stream processor configurable:

```typescript
export function create(input: {
  assistantMessage: MessageV2.Assistant
  sessionID: string
  model: Provider.Model
  abort: AbortSignal
  loopType?: string // NEW
}) {
  // ... existing setup (lines 30-34)

  const processors = {
    default: defaultStreamProcessor,
    react: reactStreamProcessor,
    tot: totStreamProcessor,
  }

  const selectedProcessor = input.loopType ? (processors[input.loopType] ?? processors.default) : processors.default

  const result = {
    async process(streamInput: LLM.StreamInput) {
      return selectedProcessor(streamInput, input)
    },
  }

  return result
}
```

### 4.4 UI INTEGRATION

#### Context State (`context/local.tsx`)

```typescript
const loop = (() => {
  const [store, setStore] = persisted("loop.v1", {
    value: "",
  })

  const list = createMemo(() => sync.data.loop.map((l) => l.id) ?? ["default", "react", "plan-execute"])
  const current = createMemo(() => store.value || "default")
  const set = (value: string) => {
    setStore({ value })
    // Also update current session message
  }

  return { list, current, set, ready: true }
})()
```

#### Global Sync (`context/global-sync.tsx`)

```typescript
// Add to state:
agent: () => sdk.app.agents().then((x) => setStore("agent", x.data ?? [])),
loop: () => sdk.app.loops().then((x) => setStore("loop", x.data ?? [])),  // NEW

// Add to ephemeral:
loop: "",
```

#### Prompt Input Component (`components/prompt-input.tsx`)

Add after agent selector (around line 1029):

```tsx
<Select label="Loop" options={local.loop.list()} current={local.loop.current()} onSelect={local.loop.set} />
```

#### Slash Commands (`pages/session.tsx`)

```typescript
{
  id: "loop.cycle",
  title: "Cycle loop",
  description: "Switch to the next loop type",
  slash: "loop",
  onSelect: () => local.loop.move(1),
},
{
  id: "loop.cycle.reverse",
  title: "Cycle loop backwards",
  description: "Switch to the previous loop type",
  onSelect: () => local.loop.move(-1),
},
```

### 4.5 API ENDPOINTS

#### Loop List Endpoint (`server.ts`)

```typescript
// Add new route:
app.api.get(
  "/loops",
  describeRoute({
    summary: "List available loops",
    description: "Returns all registered agentic loop types",
    operationId: "loop.list",
    responses: {
      200: {
        description: "List of available loops",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                data: z.array(
                  z.object({
                    id: z.string(),
                    name: z.string(),
                    description: z.string(),
                  }),
                ),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const loops = listLoops().map((l) => ({
      id: l.config.id,
      name: l.config.name,
      description: l.config.description,
    }))
    return c.json({ data: loops })
  },
)
```

#### Updated Message Endpoint

Update `SessionPrompt.PromptInput` to include loop:

```typescript
export const PromptInput = z.object({
  sessionID: Identifier.schema("session"),
  messageID: Identifier.schema("message").optional(),
  model: z.object({ providerID: z.string(), modelID: z.string() }).optional(),
  agent: z.string().optional(),
  loop: z.string().optional(), // NEW
  noReply: z.boolean().optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
  system: z.string().optional(),
  parts: z.array(/* ... */),
})
```

---

## 5. Implementation Effort Breakdown

### Phase 1: Foundation (1-2 weeks)

| Task                                  | Effort      | Files                                    |
| ------------------------------------- | ----------- | ---------------------------------------- |
| Create loop registry                  | 2 days      | `loop/registry.ts`                       |
| Add loop field to schemas             | 1 day       | `message-v2.ts`, `agent.ts`, `config.ts` |
| Refactor prompt.ts to use registry    | 3 days      | `prompt.ts`                              |
| Create "default" loop (extract logic) | 2 days      | `loop/default.ts`                        |
| API endpoint for loop list            | 1 day       | `server.ts`                              |
| **Subtotal**                          | **~9 days** |                                          |

### Phase 2: Alternative Loops (2-4 weeks)

| Task                                  | Effort        | Notes                                   |
| ------------------------------------- | ------------- | --------------------------------------- |
| Implement ReAct loop                  | 1 week        | Simpler pattern, good first alternative |
| Implement Plan-Execute loop           | 1-2 weeks     | More complex, task decomposition        |
| (Optional) Implement Tree of Thoughts | 2 weeks       | High complexity, branching              |
| (Optional) Implement Reflexion        | 1 week        | Self-reflection cycles                  |
| **Subtotal**                          | **3-6 weeks** |                                         |

### Phase 3: UI Integration (1 week)

| Task                        | Effort      | Files                         |
| --------------------------- | ----------- | ----------------------------- |
| Add loop state to local.tsx | 1 day       | `context/local.tsx`           |
| Add loop to global sync     | 1 day       | `context/global-sync.tsx`     |
| Add loop selector UI        | 1 day       | `components/prompt-input.tsx` |
| Add slash commands          | 0.5 day     | `pages/session.tsx`           |
| Update keybindings          | 0.5 day     | `config.ts`                   |
| **Subtotal**                | **~4 days** |                               |

### Phase 4: Testing & Polish (1-2 weeks)

| Task                     | Effort       |
| ------------------------ | ------------ | --- |
| Unit tests for each loop | 3 days       |
| Integration tests        | 3 days       |
| Performance benchmarking | 2 days       |
| Documentation            | 2 days       |
| **Subtotal**             | **~10 days** |     |

### Total Effort Summary

| Phase             | Time          | Total           |
| ----------------- | ------------- | --------------- |
| Foundation        | 1-2 weeks     | 9 days          |
| Alternative Loops | 2-4 weeks     | 3-6 weeks       |
| UI Integration    | 1 week        | 4 days          |
| Testing & Polish  | 1-2 weeks     | 10 days         |
| **Grand Total**   | **5-9 weeks** | **~6-12 weeks** |

---

## 6. Backward Compatibility Strategy

### Problem

Existing sessions don't have a `loop` field in their messages.

### Solution

Use fallback chain when determining loop type:

```typescript
function getEffectiveLoop(lastUser: MessageV2.User, agent: Agent.Info): string {
  // Priority order:
  // 1. Explicit loop in user message
  // 2. Default loop for agent
  // 3. Global default

  if (lastUser.loop) return lastUser.loop
  if (agent.loop) return agent.loop
  return "default"
}
```

### Migration Path

1. **v1.0**: Add `loop` field to schema (optional)
2. **v1.0**: All existing sessions default to "default" loop
3. **v1.1**: Users can select different loop per session
4. **v2.0**: Agents can have default loop (config)
5. **v2.0**: Global default configurable

### Ensuring Zero Breaking Changes

```typescript
// In prompt.ts loop selection:
export const loop = fn(Identifier.schema("session"), async (sessionID) => {
  const lastUser = await getLastUser(sessionID)
  const agent = await Agent.get(lastUser.agent)

  // Always valid - defaults to "default"
  const loopType = getEffectiveLoop(lastUser, agent)
  const loopImpl = getLoop(loopType) ?? getDefaultLoop()

  // If loop not found, always fall back to default
  if (!loopImpl) {
    log.warn("loop not found, using default", { loopType })
  }

  // Proceed with available loop
})
```

---

## 7. Risk Assessment

| Risk                         | Level  | Probability | Impact | Mitigation                                              |
| ---------------------------- | ------ | ----------- | ------ | ------------------------------------------------------- |
| Breaking existing sessions   | Medium | Low         | High   | Fallback to "default" for all existing sessions         |
| Performance regression       | Medium | Medium      | Medium | Benchmark each loop type, optimize hot paths            |
| Code complexity explosion    | High   | High        | Medium | Use registry pattern, clear interfaces, well-documented |
| UI clutter                   | Low    | Low         | Low    | Hide loop selector if only 1 option, use dropdown       |
| Testing burden               | High   | High        | High   | Add integration tests per loop type, use fixtures       |
| State synchronization issues | Medium | Medium      | Medium | Ensure loop state synced with server, handle conflicts  |

### Risk Mitigation Strategies

1. **Feature Flag**: Wrap loop selection behind feature flag initially
2. **Gradual Rollout**: Start with internal testing, then beta, then GA
3. **A/B Testing**: Compare performance of different loops on identical tasks
4. **Monitoring**: Add metrics for loop selection and performance
5. **Documentation**: Clear docs on when to use each loop type

---

## 8. Step-by-Step Implementation Plan

### Week 1-2: Foundation

#### Day 1-2: Loop Registry

```
- [ ] Create packages/opencode/src/loop/registry.ts
- [ ] Define Loop interface
- [ ] Implement registerLoop, getLoop, listLoops
- [ ] Test registry in isolation
```

#### Day 3-4: Schema Changes

```
- [ ] Update MessageV2.User in message-v2.ts
- [ ] Update Agent.Info in agent.ts
- [ ] Update Agent config in config.ts
- [ ] Add migration tests
```

#### Day 5-7: Core Refactor

```
- [ ] Extract default loop to loop/default.ts
- [ ] Refactor prompt.ts to use registry
- [ ] Ensure existing behavior unchanged
- [ ] Test end-to-end
```

### Week 3-4: First Alternative (ReAct)

#### Day 8-10: ReAct Loop

```
- [ ] Create loop/react.ts
- [ ] Implement thought-action-observation cycle
- [ ] Add ReAct-specific prompts
- [ ] Test on simple tasks
```

#### Day 11-14: ReAct Refinement

```
- [ ] Refine ReAct prompt engineering
- [ ] Add reasoning trace formatting
- [ ] Test edge cases
- [ ] Performance optimization
```

### Week 5: UI Integration

#### Day 15-16: State Management

```
- [ ] Add loop to local.tsx
- [ ] Add loop to global-sync.tsx
- [ ] Test state persistence
```

#### Day 17-18: UI Components

```
- [ ] Add loop selector to prompt-input.tsx
- [ ] Add loop cycling commands
- [ ] Style selector
- [ ] Test interaction with agent/model selectors
```

### Week 6-9: Additional Loops (Optional)

#### Plan-Execute (Days 19-26)

```
- [ ] Create loop/plan-execute.ts
- [ ] Implement planning phase
- [ ] Implement execution phase
- [ ] Test complex tasks
```

#### Tree of Thoughts (Days 27-40, Optional)

```
- [ ] Create loop/tot.ts
- [ ] Implement branching exploration
- [ ] Implement backtracking
- [ ] Test creative problem-solving
```

### Week 10-12: Testing & Polish

#### Testing (Days 41-50)

```
- [ ] Unit tests for each loop
- [ ] Integration tests
- [ ] Performance benchmarks
- [ ] Load testing
```

#### Documentation & Release (Days 51-60)

```
- [ ] User documentation
- [ ] API documentation
- [ ] Release notes
- [ ] Marketing/announcement
```

---

## 9. Code Examples

### 9.1 Loop Registry Full Implementation

```typescript
// packages/opencode/src/loop/registry.ts

import type { SessionProcessor } from "../session/processor"
import type { MessageV2 } from "../session/message-v2"
import type { Agent } from "../agent/agent"

export interface LoopConfig {
  id: string
  name: string
  description: string
  parameters?: Record<
    string,
    {
      type: "string" | "number" | "boolean"
      default?: any
      description?: string
    }
  >
}

export interface LoopContext {
  sessionID: string
  lastUser: MessageV2.User
  agent: Agent.Info
  processor: SessionProcessor
}

export type LoopResult = "stop" | "continue"

export interface Loop {
  config: LoopConfig
  process(context: LoopContext): Promise<LoopResult> | LoopResult
  initialize?(context: LoopContext): Promise<void> | void
  finalize?(context: LoopContext): Promise<void> | void
}

class LoopRegistry {
  private loops = new Map<string, Loop>()
  private defaultLoopId = "default"

  register(loop: Loop): void {
    if (this.loops.has(loop.config.id)) {
      console.warn(`Loop "${loop.config.id}" already registered, overwriting`)
    }
    this.loops.set(loop.config.id, loop)
  }

  get(id: string): Loop | null {
    return this.loops.get(id) ?? null
  }

  getRequired(id: string): Loop {
    const loop = this.get(id)
    if (!loop) {
      throw new Error(`Loop "${id}" not registered`)
    }
    return loop
  }

  list(): Loop[] {
    return Array.from(this.loops.values())
  }

  listAvailable(): Loop[] {
    return this.list().filter((l) => l.config.id !== this.defaultLoopId)
  }

  setDefault(id: string): void {
    if (!this.loops.has(id)) {
      throw new Error(`Cannot set default to unregistered loop: ${id}`)
    }
    this.defaultLoopId = id
  }

  getDefault(): Loop {
    return this.getRequired(this.defaultLoopId)
  }

  getEffectiveLoop(lastUser: MessageV2.User, agent: Agent.Info): Loop {
    const loopId = lastUser.loop ?? agent.loop ?? this.defaultLoopId
    return this.get(loopId) ?? this.getDefault()
  }
}

export const loopRegistry = new LoopRegistry()

// Helper functions
export function registerLoop(loop: Loop): void {
  loopRegistry.register(loop)
}

export function getLoop(id: string): Loop | null {
  return loopRegistry.get(id)
}

export function listLoops(): Loop[] {
  return loopRegistry.list()
}

export function getEffectiveLoop(lastUser: MessageV2.User, agent: Agent.Info): Loop {
  return loopRegistry.getEffectiveLoop(lastUser, agent)
}
```

### 9.2 Default Loop Implementation

```typescript
// packages/opencode/src/loop/default.ts

import { registerLoop, type Loop, type LoopContext } from "./registry"
import { Identifier, Session, MessageV2, SessionProcessor } from ".."
import { Agent, Provider } from "../agent"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import { SessionCompaction } from "../session/compaction"
import { SessionSummary } from "../session/summary"
import { Plugin } from "../plugin"
import { SystemPrompt } from "../session/system"
import { ToolRegistry } from "../tool/registry"
import { TaskTool } from "../tool/task"
import { defer } from "../util/defer"
import { clone } from "remeda"
import { ulid } from "ulid"

const log = Log.create({ service: "loop.default" })

export const defaultLoop: Loop = {
  config: {
    id: "default",
    name: "Default",
    description: "Standard OpenCode loop with tool calls and streaming",
  },

  async process(context: LoopContext): Promise<"stop" | "continue"> {
    const { sessionID, lastUser, agent, processor } = context
    const abort = new AbortController() // Would be passed in real impl

    // This is a simplified extraction of the existing loop logic
    // See prompt.ts:242-551 for full implementation

    // 1. Get messages
    const msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))

    // 2. Find last user/assistant
    let lastAssistant: MessageV2.Assistant | undefined
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      if (msg.info.role === "assistant") {
        lastAssistant = msg.info as MessageV2.Assistant
        break
      }
    }

    // 3. Check termination
    if (
      lastAssistant?.finish &&
      !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
      lastUser.id < lastAssistant.id
    ) {
      log.info("exiting loop", { sessionID })
      return "stop"
    }

    // 4. Create processor and resolve tools
    const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID)
    const tools = await resolveTools({ agent, sessionID, model, processor })

    // 5. Process via processor (simplified)
    const result = await processor.process({
      user: lastUser,
      agent,
      abort: abort.signal,
      sessionID,
      system: [...(await SystemPrompt.environment()), ...(await SystemPrompt.custom())],
      messages: [...MessageV2.toModelMessage(clone(msgs))],
      tools,
      model,
    })

    return result === "stop" ? "stop" : "continue"
  },
}

registerLoop(defaultLoop)

// Helper functions (would be extracted from prompt.ts)
async function resolveTools(input: {
  agent: Agent.Info
  model: Provider.Model
  sessionID: string
  processor: SessionProcessor
}) {
  // ... implementation from prompt.ts:572-715
  return {} // Placeholder
}
```

### 9.3 ReAct Loop Implementation

```typescript
// packages/opencode/src/loop/react.ts

import { registerLoop, type Loop, type LoopContext } from "./registry"
import { MessageV2, SessionProcessor } from ".."
import { Agent, Provider } from "../agent"
import { Log } from "../util/log"
import { SystemPrompt } from "../session/system"
import type { Tool } from "ai"

const log = Log.create({ service: "loop.react" })

const REACT_SYSTEM_PROMPT = `
You are a ReAct agent. For each step you must follow this format:

1. THOUGHT: Explain your reasoning about what to do next. Be specific and thorough.
2. ACTION: Choose ONE action from the available tools. Format as JSON:
   {"tool": "tool_name", "parameters": {"param1": "value1"}}
3. WAIT: You will receive an OBSERVATION.
4. Repeat from step 1 with the new observation.

Continue until you can give a final answer. When you can answer, say:
THOUGHT: I have enough information to answer the question.
ACTION: {"tool": "finish", "parameters": {"output": "Your final answer here"}}

Remember:
- Be explicit about your reasoning
- If an action fails, explain why and try a different approach
- Use tools strategically - don't call the same tool repeatedly with same inputs
`

export const reactLoop: Loop = {
  config: {
    id: "react",
    name: "ReAct",
    description: "Reasoning + Acting pattern with explicit thought-action-observation cycles",
    parameters: {
      maxSteps: {
        type: "number",
        default: 20,
        description: "Maximum reasoning cycles",
      },
      requireThought: {
        type: "boolean",
        default: true,
        description: "Require explicit thought before each action",
      },
    },
  },

  async process(context: LoopContext): Promise<"stop" | "continue"> {
    const { sessionID, lastUser, agent, processor } = context
    const maxSteps = agent.options?.maxSteps ?? 20
    let step = 0

    while (step < maxSteps) {
      step++

      // 1. Get messages
      const msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))

      // 2. Find last assistant
      let lastAssistant: MessageV2.Assistant | undefined
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].info.role === "assistant") {
          lastAssistant = msgs[i].info as MessageV2.Assistant
          break
        }
      }

      // 3. Check if finished
      if (lastAssistant?.finish === "stop") {
        return "stop"
      }

      // 4. Add ReAct system prompt if first step
      if (step === 1) {
        const reactSystemMsg = await createSystemMessage(
          sessionID,
          REACT_SYSTEM_PROMPT + "\n\n" + (await SystemPrompt.environment()).join("\n"),
        )
        msgs.unshift(reactSystemMsg)
      }

      // 5. Process with ReAct prompting
      const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID)

      const result = await processor.process({
        user: lastUser,
        agent: { ...agent, prompt: REACT_SYSTEM_PROMPT + (agent.prompt ?? "") },
        abort: new AbortController().signal,
        sessionID,
        system: [],
        messages: [...MessageV2.toModelMessage(msgs)],
        tools: {}, // Would pass tools here
        model,
      })

      if (result === "stop") {
        return "stop"
      }
    }

    log.warn("ReAct loop max steps reached", { sessionID, maxSteps })
    return "stop"
  },
}

registerLoop(reactLoop)

// Helper
async function createSystemMessage(sessionID: string, text: string): Promise<MessageV2.WithParts> {
  return {
    info: {
      id: `system_${Date.now()}`,
      sessionID,
      role: "user", // System messages are stored as user messages
      time: { created: Date.now() },
      agent: "system",
      model: { providerID: "", modelID: "" },
    },
    parts: [
      {
        id: `part_${Date.now()}`,
        sessionID,
        messageID: `system_${Date.now()}`,
        type: "text",
        text,
        synthetic: true,
      },
    ],
  }
}
```

### 9.4 Plan-Execute Loop Implementation

```typescript
// packages/opencode/src/loop/plan-execute.ts

import { registerLoop, type Loop, type LoopContext } from "./registry"
import { MessageV2, Session, Identifier } from ".."
import { Agent, Provider } from "../agent"
import { Log } from "../util/log"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { z } from "zod"

const log = Log.create({ service: "loop.plan-execute" })

const PLAN_SYSTEM_PROMPT = `
You are a planning agent. Your job is to break down complex tasks into clear, actionable steps.

For the user's request, create a detailed plan with:
1. Each step clearly numbered
2. Specific tool to use for each step
3. Expected output of each step
4. Dependencies between steps (if any)

Format your plan as JSON:
{
  "steps": [
    {
      "id": "1",
      "description": "Clear description of what to do",
      "tool": "tool_name",
      "params": { /* tool parameters */ },
      "depends_on": [] /* step IDs this depends on */
    }
  ],
  "summary": "Brief summary of the plan"
}
`

interface PlanStep {
  id: string
  description: string
  tool: string
  params: Record<string, any>
  depends_on: string[]
  status: "pending" | "in_progress" | "completed" | "failed"
  result?: any
}

interface ExecutionPlan {
  steps: PlanStep[]
  summary: string
}

export const planExecuteLoop: Loop = {
  config: {
    id: "plan-execute",
    name: "Plan-Execute",
    description: "Separate planning phase from execution phase",
  },

  async process(context: LoopContext): Promise<"stop" | "continue"> {
    const { sessionID, lastUser, agent } = context

    // PHASE 1: PLANNING
    const plan = await createPlan(lastUser, agent)
    log.info("created plan", { sessionID, stepCount: plan.steps.length })

    // Store plan in session for reference
    await Session.update(sessionID, (draft) => {
      draft.plan = plan as any
    })

    // PHASE 2: EXECUTION
    const executionResult = await executePlan(plan, context)

    return executionResult
  },
}

async function createPlan(lastUser: MessageV2.User, agent: Agent.Info): Promise<ExecutionPlan> {
  // Call LLM to generate plan
  // Return structured plan
}

async function executePlan(plan: ExecutionPlan, context: LoopContext): Promise<"stop" | "continue"> {
  const { sessionID } = context

  // Execute steps in dependency order
  const completed = new Set<string>()

  while (completed.size < plan.steps.length) {
    // Find ready steps (all dependencies completed)
    const readySteps = plan.steps.filter(
      (step) => step.status === "pending" && step.depends_on.every((dep) => completed.has(dep)),
    )

    if (readySteps.length === 0) {
      log.error("no ready steps but plan incomplete", { sessionID })
      return "stop"
    }

    // Execute each ready step
    for (const step of readySteps) {
      step.status = "in_progress"

      try {
        // Execute step (would call appropriate tool)
        const result = await executeStep(step, context)
        step.status = "completed"
        step.result = result
        completed.add(step.id)
      } catch (error) {
        step.status = "failed"
        log.error("step failed", { sessionID, stepId: step.id, error })

        // Option: retry, skip, or abort
        const shouldRetry = await askUserRetry(step, error)
        if (shouldRetry) {
          step.status = "pending" // Retry
        } else {
          return "stop"
        }
      }
    }
  }

  return "stop"
}

async function executeStep(step: PlanStep, context: LoopContext): Promise<any> {
  // Execute individual step
  // Would use SessionPrompt.prompt or direct tool calls
}

async function askUserRetry(step: PlanStep, error: any): Promise<boolean> {
  // Would publish permission request
  return false
}

registerLoop(planExecuteLoop)
```

### 9.5 UI Component Example

```tsx
// packages/app/src/components/loop-selector.tsx

import { createMemo } from "solid-js"
import { local } from "@/context/local"

export function LoopSelector() {
  const loops = createMemo(() => local.loop.list())
  const current = createMemo(() => local.loop.current())

  return (
    <div class="loop-selector">
      <label>Loop</label>
      <select value={current()} onChange={(e) => local.loop.set(e.currentTarget.value)}>
        {loops().map((loop) => (
          <option value={loop.id}>{loop.name}</option>
        ))}
      </select>
      <div class="loop-description">{loops().find((l) => l.id === current())?.description}</div>
    </div>
  )
}
```

---

## Appendix A: File Modification Summary

| File                                           | Type | Lines   | Priority |
| ---------------------------------------------- | ---- | ------- | -------- |
| `packages/opencode/src/loop/registry.ts`       | NEW  | ~80     | P0       |
| `packages/opencode/src/loop/default.ts`        | NEW  | ~100    | P0       |
| `packages/opencode/src/loop/react.ts`          | NEW  | ~120    | P1       |
| `packages/opencode/src/loop/plan-execute.ts`   | NEW  | ~150    | P2       |
| `packages/opencode/src/session/prompt.ts`      | MOD  | 230-563 | P0       |
| `packages/opencode/src/session/processor.ts`   | MOD  | 24-50   | P0       |
| `packages/opencode/src/session/message-v2.ts`  | MOD  | 292-314 | P0       |
| `packages/opencode/src/agent/agent.ts`         | MOD  | 19-60   | P0       |
| `packages/opencode/src/config/config.ts`       | MOD  | 400-436 | P1       |
| `packages/opencode/src/server/server.ts`       | MOD  | ~50     | P1       |
| `packages/app/src/context/local.tsx`           | MOD  | ~50     | P1       |
| `packages/app/src/context/global-sync.tsx`     | MOD  | ~30     | P1       |
| `packages/app/src/components/prompt-input.tsx` | MOD  | ~20     | P1       |
| `packages/app/src/pages/session.tsx`           | MOD  | ~20     | P2       |

---

## Appendix B: Glossary

| Term                   | Definition                                                                  |
| ---------------------- | --------------------------------------------------------------------------- |
| Loop                   | The control flow pattern governing how the agent thinks, acts, and iterates |
| Registry               | Pattern for registering and retrieving loop implementations                 |
| ReAct                  | Reasoning + Acting pattern with explicit thought-action-observation cycles  |
| Plan-Execute           | Pattern separating planning from execution into distinct phases             |
| Tree of Thoughts       | Pattern exploring multiple solution branches with backtracking              |
| Reflexion              | Pattern of generating, reflecting on, and revising solutions                |
| Backward Compatibility | Ensuring existing functionality works after changes                         |

---

## Appendix C: References

1. Yao, J., et al. (2023). "ReAct: Synergizing reasoning and acting in language models"
2. Yao, J., et al. (2023). "Tree of Thoughts: Deliberate problem solving with LLMs"
3. Shinn, N., et al. (2023). "Reflexion: Language agents can self-correct via verbal reinforcement"

---

_Document generated: December 2025_
_Last updated: December 31, 2025_
