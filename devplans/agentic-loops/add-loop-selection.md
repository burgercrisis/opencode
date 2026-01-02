# Adding Loop Selection to OpenCode

**Difficulty: Medium-High** | **Timeline: 5-9 weeks**

---

## Overview

Add ability to select agentic loop (Default, ReAct, Plan-Execute, ToT, Reflexion) alongside model and agent selection.

---

## Files to Modify

### Core Loop Files (Must Modify)

| File                                          | Purpose                     | Change Type      |
| --------------------------------------------- | --------------------------- | ---------------- |
| `packages/opencode/src/session/prompt.ts`     | Main `SessionPrompt.loop()` | Major refactor   |
| `packages/opencode/src/session/processor.ts`  | Inner stream loop           | Major refactor   |
| `packages/opencode/src/session/llm.ts`        | LLM streaming               | Minor            |
| `packages/opencode/src/session/message-v2.ts` | User message schema         | Schema extension |

### Secondary Files (Must Update)

| File                                     | Purpose                        |
| ---------------------------------------- | ------------------------------ |
| `packages/opencode/src/agent/agent.ts`   | Add `loop` field to Agent.Info |
| `packages/opencode/src/config/config.ts` | Add `loop` to agent config     |
| `packages/opencode/src/session/index.ts` | Support new schema             |
| `packages/opencode/src/server/server.ts` | Pass `loop` through API        |

### UI Files (Should Update)

| File                                           | Purpose               |
| ---------------------------------------------- | --------------------- |
| `packages/app/src/context/local.tsx`           | Loop state management |
| `packages/app/src/components/prompt-input.tsx` | Loop selector UI      |
| `packages/app/src/pages/session.tsx`           | Slash commands        |
| `packages/app/src/context/global-sync.tsx`     | Sync loop list        |

---

## Current Architecture

```
User Input → UI Selector → global-sync.ts → prompt-input.tsx → server.ts
                                                                ↓
MessageV2.User { agent, model } → SessionPrompt.loop() → SessionProcessor
```

**Problem:** Loop type is NOT stored - hardcoded in `prompt.ts:242`.

---

## Implementation

### Step 1: Schema Changes

**message-v2.ts** - Add loop to User message:

```typescript
export const User = Base.extend({
  agent: z.string(),
  loop: z.string().optional(),
  model: z.object({ providerID: z.string(), modelID: z.string() }),
})
```

**agent.ts** - Add loop to Agent.Info:

```typescript
export const Info = z.object({
  name: z.string(),
  loop: z.string().optional(),
  // ...existing fields
})
```

### Step 2: Loop Registry

Create `packages/opencode/src/loop/registry.ts`:

```typescript
export interface Loop {
  config: { id: string; name: string; description: string }
  process(context): Promise<"stop" | "continue">
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
```

### Step 3: Refactor Main Loop

**prompt.ts** - Use registry:

```typescript
export const loop = fn(async (sessionID) => {
  const lastUser = await getLastUser(sessionID)
  const agent = await Agent.get(lastUser.agent)
  const loopType = lastUser.loop ?? agent.loop ?? "default"
  const loopImpl = getLoop(loopType) ?? getDefaultLoop()

  while (true) {
    const result = await loopImpl.process({ sessionID, lastUser, agent, processor })
    if (result === "stop") break
  }
})
```

### Step 4: Create Loop Files

- `packages/opencode/src/loop/default.ts` - Existing logic extracted
- `packages/opencode/src/loop/react.ts` - ReAct pattern
- `packages/opencode/src/loop/plan-execute.ts` - Plan-Execute pattern

### Step 5: UI Integration

**local.tsx**:

```typescript
const loop = (() => {
  const [store, setStore] = persisted("loop.v1", { value: "" })
  const list = () => ["default", "react", "plan-execute"]
  const current = () => store.value || "default"
  const set = (v) => setStore({ value: v })
  return { list, current, set, ready: true }
})()
```

**prompt-input.tsx**:

```tsx
<Select label="Loop" options={local.loop.list()} current={local.loop.current()} onSelect={local.loop.set} />
```

---

## Timeline

| Phase             | Time      | Tasks                               |
| ----------------- | --------- | ----------------------------------- |
| Foundation        | 1-2 weeks | Registry, schemas, core refactor    |
| Alternative Loops | 2-4 weeks | ReAct, Plan-Execute, ToT, Reflexion |
| UI Integration    | 1 week    | Selector, state, commands           |
| Testing & Polish  | 1-2 weeks | Tests, docs, benchmarks             |

**Total: 5-9 weeks**

---

## Backward Compatibility

```typescript
function getEffectiveLoop(lastUser, agent): string {
  if (lastUser.loop) return lastUser.loop
  if (agent.loop) return agent.loop
  return "default"
}
```

All existing sessions default to "default" loop.

---

## File Modification Summary

| File                                           | Type | Priority |
| ---------------------------------------------- | ---- | -------- |
| `packages/opencode/src/loop/registry.ts`       | NEW  | P0       |
| `packages/opencode/src/loop/default.ts`        | NEW  | P0       |
| `packages/opencode/src/loop/react.ts`          | NEW  | P1       |
| `packages/opencode/src/loop/plan-execute.ts`   | NEW  | P2       |
| `packages/opencode/src/session/prompt.ts`      | MOD  | P0       |
| `packages/opencode/src/session/processor.ts`   | MOD  | P0       |
| `packages/opencode/src/session/message-v2.ts`  | MOD  | P0       |
| `packages/opencode/src/agent/agent.ts`         | MOD  | P0       |
| `packages/opencode/src/config/config.ts`       | MOD  | P1       |
| `packages/opencode/src/server/server.ts`       | MOD  | P1       |
| `packages/app/src/context/local.tsx`           | MOD  | P1       |
| `packages/app/src/context/global-sync.tsx`     | MOD  | P1       |
| `packages/app/src/components/prompt-input.tsx` | MOD  | P1       |
| `packages/app/src/pages/session.tsx`           | MOD  | P2       |

---

## Recommendation

Start with Phase 1 + ReAct only:

1. Add loop registry (abstracts loop selection)
2. Move current logic to "default" loop (zero functional change)
3. Implement ReAct as second loop option (simpler than ToT)
4. Add UI selector with just 2 options initially

This validates the pattern with minimal risk.

---

_Document created: December 2025_
