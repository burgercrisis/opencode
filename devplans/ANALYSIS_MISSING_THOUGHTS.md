# Analysis of Missing Agent Thoughts Issue

## Problem Summary

Users report that sometimes agents' "thoughts" (reasoning) are missing, particularly when:

1. Main agent runs subagents that do lots of reading
2. After subagent completes, the main agent "hangs" doing "nothing" but still "working"

## Critical Findings

### 1. Subagent Thoughts ARE Generated but Not Tracked by Main Agent

**Location**: `packages/opencode/src/tool/task.ts` lines 61-81

```typescript
const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
  if (evt.properties.part.sessionID !== session.id) return
  if (evt.properties.part.messageID === messageID) return
  if (evt.properties.part.type !== "tool") return  // ← PROBLEM: Filters out reasoning parts!
  ...
})
```

**Impact**:

- Subagent reasoning (thoughts) ARE published to the Bus and visible to the UI
- The main agent's task tool execution context **does not see** subagent reasoning events
- The metadata summary returned to the main agent only includes tool parts (lines 177-188)
- This means the main agent has NO visibility into what the subagent was thinking

**Evidence from code**:

- Reasoning parts are fully generated and published via `Session.updatePart()` (session/processor.ts:58-96)
- Reasoning events are sent to UI via SSE (acp/agent.ts:307-325)
- But task tool explicitly filters: `if (evt.properties.part.type !== "tool") return`

### 2. Storage I/O Blocking Event Publishing

**Location**: `packages/opencode/src/session/index.ts` lines 381-390

```typescript
export const updatePart = fn(UpdatePartInput, async (input) => {
  const part = "delta" in input ? input.part : input
  const delta = "delta" in input ? input.delta : undefined
  await Storage.write(["part", part.messageID, part.id], part) // ← BLOCKS EVENT PUBLISHING
  Bus.publish(MessageV2.Event.PartUpdated, {
    part,
    delta,
  })
  return part
})
```

**Impact**:

- Each reasoning delta must be written to disk BEFORE the event is published
- In high-frequency scenarios (rapid reasoning deltas from LLM), this creates a bottleneck
- If storage is slow (disk I/O contention, slow SSD, network storage), events are delayed
- With subagents reading lots of files, multiple sessions may be writing parts simultaneously

**Evidence**:

- Reasoning deltas are processed one at a time (processor.ts:75-82)
- Each delta triggers `await Session.updatePart()`
- `Storage.write()` uses file locks (lock.ts:73-97) that could cause contention
- Each part is a separate JSON file write

### 3. Storage Lock Contention Risk

**Location**: `packages/opencode/src/util/lock.ts` lines 73-97

When multiple parts are being written simultaneously (main agent + subagent):

```typescript
export async function write(key: string): Promise<Disposable> {
  const lock = get(key)
  return new Promise((resolve) => {
    if (!lock.writer && lock.readers === 0) {
      lock.writer = true
      resolve(...)
    } else {
      lock.waitingWriters.push(() => {
        lock.writer = true
        resolve(...)
      })
    }
  })
}
```

**Impact**:

- If main agent and subagent are both active, they may contend on file locks
- Writers are prioritized over readers to prevent starvation
- Each part write acquires and releases a lock
- In high-frequency scenarios, this could cause queuing

**Scenario**:

1. Main agent is thinking → writing reasoning deltas
2. Subagent is reading files → writing tool parts
3. Both updating parts → lock contention
4. If storage is slow, lock acquisitions stack up

### 4. ACP Sends Full Reasoning Text (Not Just Deltas)

**Location**: `packages/opencode/src/acp/agent.ts` lines 630-646

```typescript
} else if (part.type === "reasoning") {
  if (part.text) {
    await this.connection.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: "agent_thought_chunk",
        content: {
          type: "text",
          text: part.text,  // ← FULL TEXT, not delta!
        },
      },
    })
  }
}
```

**Contrast with text parts** (lines 610-629):

```typescript
const delta = props.delta  // ← Uses delta for text parts
if (delta) {
  await this.connection.sessionUpdate({
    ...
    content: {
      type: "text",
      text: delta,
    },
  })
}
```

**Impact**:

- Reasoning parts send the FULL accumulated text on every update
- For long reasoning chains, this could cause significant bandwidth usage
- Could cause delays in event propagation to VSCode clients
- PartUpdated event includes `delta` property, but ACP doesn't use it for reasoning

### 5. UI Event Batching Causes Perceived Delays

**Location**: `packages/opencode/src/cli/cmd/tui/context/sdk.tsx` lines 32-64

```typescript
const flush = () => {
  if (queue.length === 0) return
  const events = queue
  queue = []
  timer = undefined
  last = Date.now()
  batch(() => {
    for (const event of events) {
      emitter.emit(event.type, event)
    }
  })
}

for await (const event of events.stream) {
  queue.push(event)
  const elapsed = Date.now() - last

  if (timer) continue
  if (elapsed < 16) {
    // ← 16ms batching window
    timer = setTimeout(flush, 16)
    continue
  }
  flush()
}
```

**Impact**:

- Events are batched for 16ms to optimize re-renders
- In high-frequency scenarios (rapid reasoning deltas), users may see "stuttering"
- Combined with storage I/O delays, this can make thoughts appear "missing"

### 6. ShareNext 1000ms Batching Could Lose Thoughts

**Location**: `packages/opencode/src/share/share-next.ts` lines 112-145

```typescript
async function sync(sessionID: string, data: Data[]) {
  const existing = queue.get(sessionID)
  if (existing) {
    for (const item of data) {
      existing.data.set("id" in item ? (item.id as string) : ulid(), item)
    }
    return  // ← Queued, but not sent yet
  }
  const timeout = setTimeout(async () => {
    const queued = queue.get(sessionID)
    if (!queued) return
    queue.delete(sessionID)
    const share = await get(sessionID)
    if (!share) return

    await fetch(`${await url()}/api/share/${share.id}/sync`, {
      method: "POST",
      ...
    })
  }, 1000)  // ← 1000ms delay
  queue.set(sessionID, { timeout, data: dataMap })
}
```

**Impact**:

- Updates are batched for 1000ms before sending to remote server
- If connection fails during this window, accumulated thoughts could be lost
- For long-running subagents, this could result in significant delays

## Event Flow Analysis

```
LLM Stream
  ↓
reasoning-delta event
  ↓
SessionProcessor (processor.ts:75-82)
  - Accumulates text: part.text += value.text
  - Calls: await Session.updatePart({ part, delta: value.text })
  ↓
Session.updatePart (session/index.ts:381-390)
  - AWAIT Storage.write(["part", ...], part)  ← POTENTIAL BLOCKING
  - Bus.publish(MessageV2.Event.PartUpdated, { part, delta })
  ↓
Bus.publish (bus/index.ts:41-63)
  - Calls all subscribers in parallel via Promise.all()
  ↓
Subscribers:
  1. ACP Agent (acp/agent.ts:630-646) → Sends full reasoning.text to VSCode
  2. TUI SDK (cli/cmd/tui/context/sync.tsx:210-228) → Queues for 16ms batching
  3. ShareNext (share/share-next.ts:47-54) → Queues for 1000ms batching
  4. Task Tool (tool/task.ts:61-81) → FILTERED OUT if type !== "tool"!
  5. GitHub CLI (cli/cmd/github.ts:807-833) → Filters for specific session
```

## Root Cause Analysis

### Primary Issue: Subagent Reasoning Not Visible to Main Agent

**User perception**: "Main agent hangs after subagent completes"

**Actual behavior**:

1. Subagent runs, generates reasoning (published to UI)
2. Subagent completes, returns text output to main agent
3. Main agent sees: "Summarize the task tool output above and continue with your task."
4. Main agent has NO context of what subagent was thinking
5. Main agent must "think through" what the subagent just did from scratch

**Evidence from code** (session/prompt.ts:419-440):

```typescript
// After subtask completes
const summaryUserMsg: MessageV2.User = {
  id: Identifier.ascending("message"),
  sessionID,
  role: "user",
  ...
}
await Session.updateMessage(summaryUserMsg)
await Session.updatePart({
  id: Identifier.ascending("part"),
  messageID: summaryUserMsg.id,
  sessionID,
  type: "text",
  text: "Summarize the task tool output above and continue with your task.",  // ← No reasoning context!
  synthetic: true,
} satisfies MessageV2.TextPart)
```

### Secondary Issue: Storage I/O Bottleneck

**User perception**: "Thoughts are missing"

**Actual behavior**:

1. LLM streams reasoning deltas rapidly
2. Each delta must be written to disk (await Storage.write)
3. Events are only published AFTER disk write completes
4. If storage is slow or under contention, events are delayed
5. When events finally publish, they may arrive in bursts
6. UI batching (16ms) + storage delays = thoughts appear "stuttering" or "missing"

**Scenario with subagents**:

1. Main agent starts thinking → writes reasoning deltas
2. Main agent spawns subagent
3. Subagent starts reading files → writes many tool parts
4. Both sessions writing to storage → lock contention
5. Main agent's reasoning deltas get queued behind subagent's tool writes
6. Events are delayed → appear "missing"

## Recommendations

### High Priority

1. **Include Subagent Reasoning in Task Output**
   - Modify `tool/task.ts` to track reasoning parts, not just tool parts
   - Include subagent reasoning in the output returned to main agent
   - This gives the main agent context of what the subagent was thinking

2. **Optimize Storage I/O for Part Updates**
   - Consider batching part writes or using write-ahead logging
   - Implement non-blocking writes where possible
   - Consider in-memory caching of recent parts with periodic flush

3. **Fix ACP to Use Reasoning Deltas**
   - Use `props.delta` for reasoning parts (like text parts)
   - This reduces bandwidth and prevents sending full reasoning repeatedly

### Medium Priority

4. **Reduce or Remove Event Batching in High-Frequency Scenarios**
   - Consider adaptive batching: shorter windows during active reasoning
   - Or bypass batching for reasoning events specifically

5. **Improve ShareNext Batching**
   - Reduce 1000ms window or implement incremental sync
   - Ensure queue is flushed on error to prevent data loss

6. **Add Diagnostics/Metrics**
   - Track part update latency
   - Monitor storage lock wait times
   - Log when events are delayed or dropped

### Low Priority

7. **Consider Session-Level Storage Optimization**
   - Deduplicate or compress reasoning parts
   - Implement part garbage collection after completion

## Testing Recommendations

1. **Reproduce the Issue**
   - Create a test with a main agent spawning a subagent that reads many files
   - Monitor PartUpdated events to see if reasoning parts are missing
   - Check storage I/O timing with timestamps

2. **Performance Profiling**
   - Add timing logs around `Storage.write()` calls
   - Measure lock acquisition time
   - Track event propagation latency from LLM to UI

3. **Fix Verification**
   - After implementing fixes, verify reasoning parts are visible
   - Confirm main agent receives subagent reasoning context
   - Check that storage I/O doesn't block event publishing
