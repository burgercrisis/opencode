# Agentic Loop Patterns: Comprehensive Analysis

> Document created: December 2025
> Author: OpenCode Research
> Purpose: Catalog and analyze agentic loop patterns for potential implementation

## Table of Contents

1. [Original OpenCode Loop](#1-original-opencode-loop)
2. [ReAct Pattern](#2-react-reasoning--acting)
3. [Plan-Execute Pattern](#3-plan-execute-pattern)
4. [Tree of Thoughts](#4-tree-of-thoughts-tot)
5. [Graph of Thoughts](#5-graph-of-thoughts-got)
6. [Reflexion Pattern](#6-reflexion-pattern)
7. [Iterative Refinement](#7-iterative-refinement)
8. [Multi-Agent Debate](#8-multi-agent-debate)
9. [Actor-Critic Pattern](#9-actor-critic-pattern)
10. [Hierarchical Task Networks](#10-hierarchical-task-networks-htn)
11. [Comparative Analysis](#11-comparative-analysis)
12. [Recommendations](#12-recommendations)

---

## 1. Original OpenCode Loop

### Overview

The OpenCode agentic loop is a production-grade, stateful iteration system that orchestrates multi-turn conversations between users and AI models with extensive tool-calling capabilities.

### Source Code

- **Main Loop**: `packages/opencode/src/session/prompt.ts:230-563` (`SessionPrompt.loop()`)
- **Processor Loop**: `packages/opencode/src/session/processor.ts:24-409` (`SessionProcessor`)
- **Tool System**: `packages/opencode/src/tool/tool.ts`

### Loop Structure Diagram

```
A1 ── User Input (text, files, agents, subtasks)
      │
      ↓
A2 ── SessionPrompt.prompt() [prompt.ts:140-152]
      │
      ├─→ A3 ── Create user message
      │   └─→ Parse parts, resolve files, store in Storage
      │
      └─→ A4 ── SessionPrompt.loop(sessionID)
          │
          ↓
      A5 ── SessionPrompt.loop() [main outer loop]
          │
          ├─→ B1 ── Setup AbortController & step counter [prompt.ts:241-244]
          │
          ├─→ B2 ── Get messages from storage [prompt.ts:246-263]
          │   └─→ MessageV2.stream(sessionID)
          │
          ├─→ B3 ── Find lastUser, lastAssistant, pending tasks
          │
          ├─→ C1 ── Check termination [prompt.ts:266-273]
          │   │   IF lastAssistant.finish ∉ {"tool-calls", "unknown"}
          │   └─→ GOTO X1 (exit)
          │
          ├─→ B5 ── Increment step (step++)
          │
          ├─→ B6 ── IF step === 1 → EnsureTitle()
          │
          ├─→ B7 ── Get agent config & model
          │
          ├─→ D1 ── Check pending tasks
          │   ├─→ E1 (subtask handling) → LOOP BACK TO B2
          │   ├─→ F1 (compaction handling) → LOOP BACK TO B2
          │   └─→ G1 (normal processing)
          │
          ├─────────────────────────┐
          │                         │
          ↓                         │
      E1 ── Subtask Handling        │
          ├─→ TaskTool.init()       │
          ├─→ Create child session  │
          ├─→ Execute recursively   │
          │   └─→ LOOP BACK TO A2   │
          ├─→ Update tool status    │
          └─→ LOOP BACK TO B2       │
          │                         │
          ↓                         │
      F1 ── Compaction Handling     │
          ├─→ SessionCompaction     │
          └─→ LOOP BACK TO B2       │
          │                         │
          ↓                         │
      G1 ── Check context overflow  │
          ├─→ IF overflow → Create compaction
          └─→ LOOP BACK TO B2       │
          │                         │
          ↓                         │
      G3 ── Normal Processing       │
          ├─→ Insert reminders      │
          ├─→ Create SessionProcessor
          ├─→ Resolve tools         │
          └─→ G7 ── processor.process()
              │
              ↓
          H1 ── SessionProcessor.process() [inner while loop]
              │
              ├─→ H2 ── WHILE TRUE:
              │   │
              │   ├─→ H3 ── LLM.stream()
              │   │   └─→ I1 ── streamText() → Return stream
              │   │
              │   └─→ H4 ── Process stream events:
              │       ├─→ "start": Set busy
              │       ├─→ "reasoning-*": ReasoningPart
              │       ├─→ "tool-input-*": ToolPart pending
              │       ├─→ "tool-call": Execute tool + doom loop detection
              │       ├─→ "tool-result": ToolPart completed
              │       ├─→ "tool-error": ToolPart error
              │       ├─→ "start-step": Snapshot
              │       ├─→ "finish-step": Cost/tokens, patch
              │       ├─→ "text-*": TextPart
              │       └─→ "finish": Exit inner loop
              │
              ├─→ H15 ── Error handling
              │   └─→ IF retryable → LOOP BACK TO H2
              │
              ├─→ H18 ── Check result
              │   ├─→ "stop" → GOTO X1
              │   └─→ "continue" → Continue
              │
              └─→ Return result
          │
          └─→ LOOP BACK TO B2 (next iteration)
          │
          ↓
      X1 ── Cleanup & Return
          ├─→ SessionCompaction.prune()
          ├─→ Stream final message
          └─→ END
```

### Loop Summary Table

| Loop ID    | Return Point / Target                |
| ---------- | ------------------------------------ |
| A2→A4      | prompt() → loop()                    |
| E8→A2      | Subagent recursive call              |
| E11→B2     | After subtask: continue main loop    |
| F2→B2      | After compaction: continue main loop |
| G2→B2      | After overflow compaction: continue  |
| H2 (inner) | SessionProcessor inner while loop    |
| H16→H2     | Retry after error: retry LLM call    |
| G8→B2      | After successful step: continue      |
| C1→X1      | Termination check: exit              |
| G8→X1      | Processor returned "stop": exit      |

### Key Components

#### SessionPrompt.loop()

- **Location**: `packages/opencode/src/session/prompt.ts:230-563`
- **Purpose**: Main orchestrator of agent iterations
- **Key Variables**: `step` (iteration counter), `abort` (AbortController)

#### SessionProcessor.process()

- **Location**: `packages/opencode/src/session/processor.ts:42-404`
- **Purpose**: Handle streaming LLM interaction within a turn
- **Inner Loop**: WHILE TRUE processing stream events

#### Doom Loop Detection

- **Threshold**: 3 identical tool calls with same arguments
- **Actions**: "ask" (prompt user) or "deny" (throw error)

### Termination Conditions

1. **Valid Response**: `lastAssistant.finish ∉ {"tool-calls", "unknown"}`
2. **Max Steps**: `step >= agent.maxSteps` (default: Infinity)
3. **User Abort**: `abort.aborted === true`
4. **Error**: `assistantMessage.error` set
5. **Blocked**: Permission denied with `blocked = true`

### Current Strengths

| Aspect             | Implementation                       | Rating |
| ------------------ | ------------------------------------ | ------ |
| State Management   | Persistent storage with versioning   | ★★★★★  |
| Error Handling     | Structured errors with retry logic   | ★★★★☆  |
| Tool System        | Extensible registry with permissions | ★★★★★  |
| Context Management | Compaction + pruning strategies      | ★★★★☆  |
| Streaming          | Full duplex with event types         | ★★★★★  |
| Plugin System      | Hook points throughout               | ★★★★☆  |

### Current Limitations

1. **No Explicit Self-Reflection**: Reasoning traces exist but aren't analyzed
2. **No Systematic Revision**: No "try, evaluate, revise" pattern
3. **Single Execution Path**: No branching exploration
4. **Limited Failure Analysis**: Only API errors are retryable
5. **Static Planning**: Plans can't adapt dynamically

---

## 2. ReAct (Reasoning + Acting)

### Concept

Explicitly structure each iteration as: **Thought → Action → Observation → Reasoning → Next Action**

### Origin

Yao et al. (2023) - "ReAct: Synergizing reasoning and acting in language models"

### Loop Structure Diagram

```
R1 ── Input: User task
      │
      ↓
R2 ── Generate Reasoning Trace (THOUGHT)
      │   "I need to understand the codebase structure first..."
      │
      ↓
R3 ── Decide Action (ACTION)
      │   ├─→ Call tool (e.g., "grep", "read", "bash")
      │   └─→ OR "finish" if done
      │
      ↓
R4 ── Execute Action
      │   └─→ Tool execution with parameters
      │
      ↓
R5 ── Receive Result (OBSERVATION)
      │   └─→ Tool output formatted for LLM
      │
      ↓
R6 ── Analyze Observation (THOUGHT)
      │   "The file shows X, but Y is unclear. I should check..."
      │
      ├─→ IF task complete → R7 (final answer)
      │
      └─→ IF more info needed → R2 (next thought)
      │
      ↓
R7 ── Final Answer with Reasoning Trace
```

### Prompt Template

```typescript
const reactPrompt = `
You are in a ReAct loop. For each step:

1. THOUGHT: Explain your reasoning about what to do next
2. ACTION: Call a tool (or finish if done)
3. OBSERVATION: You will receive the result

Available tools: {tool_list}

Format your response as:
THOUGHT: <reasoning>
ACTION: {{
  "tool": "tool_name",
  "parameters": {{ ... }}
}}
---
OBSERVATION: <result>
THOUGHT: <analysis of result>
ACTION: <next_tool_or_finish>
`
```

### OpenCode Integration

```typescript
// Add structured reasoning prompts to system prompt
const reactSystemPrompt = `
You are a ReAct agent. For each step:
1. THOUGHT: Reason about what to do
2. ACTION: Call a tool or finish
3. OBSERVATION: Receive result
4. THOUGHT: Analyze and decide next step

Repeat until task is complete.
`

// Modify processor to require explicit reasoning
// Add "thought" tool that forces reasoning trace
```

### Benefits

- **Explicit reasoning visibility**: Clear trace of decision-making
- **Better error recovery**: Observations guide next actions
- **Improved debugging**: Easy to follow reasoning path
- **Reduced errors**: Forces thinking before acting

### Trade-offs

| Aspect      | Impact                            |
| ----------- | --------------------------------- |
| Token usage | ↑ Higher (explicit reasoning)     |
| Complexity  | ↑ More complex prompt engineering |
| Latency     | ↑ May slow down simple tasks      |

---

## 3. Plan-Execute Pattern

### Concept

Separate **planning phase** from **execution phase** with explicit plan storage and revision

### Loop Structure Diagram

```
P1 ── Input: User task
      │
      ├─────────────────────┐
      ↓                     │
P2 ── Task Analysis         │
    ├─→ Decompose task      │
    ├─→ Identify constraints│
    └─→ Estimate complexity │
      │                     │
      ↓                     │
P3 ── Generate Plan         │
    ├─→ Create step list    │
    ├─→ Define dependencies │
    └─→ Store plan          │
      │                     │
      ├─────────────────────┐
      ↓                     │
P4 ── Execute Next Step     │
    ├─→ Get pending step    │
    ├─→ Execute with context│
    └─→ Validate completion │
      │                     │
      ↓                     │
P5 ── Validate Step         │
    ├─→ IF success → P6     │
    └─→ IF failed → P7      │
      │                     │
      ↓                     │
P6 ── Update Plan Progress  │
    ├─→ Mark step complete  │
    ├─→ Update dependencies │
    └─→ IF more steps → P4  │
      │                     │
      ↓                     │
P8 ── Final Validation      │
    ├─→ All steps complete? │
    └─→ Goal achieved?      │
      │                     │
      ↓                     │
P9 ── Return Solution       │
      │                     │
      ├─────────────────────┐
      ↓                     │
P7 ── Handle Failure        │
    ├─→ Retry (max attempts)│
    ├─→ Replan from failure │
    └─→ Escalate if needed  │
```

### OpenCode Integration

```typescript
// New "plan" tool
const planTool = Tool.define("plan", async () => ({
  description: "Create and manage execution plans",
  parameters: z.object({
    task: z.string().describe("The task to plan"),
    steps: z
      .array(
        z.object({
          id: z.string(),
          description: z.string(),
          tool: z.string().optional(),
          params: z.record(z.any()).optional(),
          status: z.enum(["pending", "in_progress", "completed", "failed"]),
          dependencies: z.array(z.string()),
        }),
      )
      .optional(),
  }),
  async execute(params, ctx) {
    const plan = params.steps ? { steps: params.steps, status: "in_progress" } : await generatePlan(params.task)

    await updateSessionPlan(ctx.sessionID, plan)
    return plan
  },
}))

// New "execute_step" tool
const executeStepTool = Tool.define("execute_step", async () => ({
  description: "Execute next pending step in plan",
  parameters: z.object({
    step_id: z.string().optional(), // Specific step, or auto-select
  }),
  async execute(params, ctx) {
    const session = await Session.get(ctx.sessionID)
    const plan = session.plan

    const step = params.step_id
      ? plan.steps.find((s) => s.id === params.step_id)
      : plan.steps.find(
          (s) =>
            s.status === "pending" &&
            s.dependencies.every((d) => plan.steps.find((s2) => s2.id === d)?.status === "completed"),
        )

    if (!step) throw new Error("No executable step found")

    step.status = "in_progress"

    // Execute the step
    const result = await executeTool(step.tool, step.params)

    step.status = result.success ? "completed" : "failed"
    step.result = result

    await saveSessionPlan(ctx.sessionID, plan)
    return result
  },
}))

// New "replan" tool
const replanTool = Tool.define("replan", async () => ({
  description: "Revise plan based on execution feedback",
  parameters: z.object({
    reason: z.string().describe("Why replanning is needed"),
  }),
  async execute(params, ctx) {
    const session = await Session.get(ctx.sessionID)
    const newPlan = await generatePlan(session.plan.original_task, {
      context: session.execution_history,
      feedback: params.reason,
    })
    await saveSessionPlan(ctx.sessionID, newPlan)
    return newPlan
  },
}))
```

### Benefits

- **Better task decomposition**: Explicit multi-step planning
- **Recovery from failures**: Can replan from any point
- **Plan reuse**: Store plans for similar tasks
- **Parallel execution**: Independent steps can run in parallel
- **Progress tracking**: Clear visibility into task completion

### Trade-offs

| Aspect      | Impact                        |
| ----------- | ----------------------------- |
| Flexibility | ↓ Less adaptive (locked plan) |
| Complexity  | ↑ More state to manage        |
| Overhead    | ↑ Planning adds latency       |

---

## 4. Tree of Thoughts (ToT)

### Concept

Explore **multiple solution branches** with scoring, evaluation, and backtracking

### Origin

Yao et al. (2023) - "Tree of Thoughts: Deliberate Problem Solving with Large Language Models"

### Loop Structure Diagram

```
T1 ── Input: User task
      │
      ↓
T2 ── Initialize Tree
    └─→ Root node: Task description
        │
        ↓
T3 ── Generate Candidates (from current nodes)
    ├─→ For each pending node:
    │   ├─→ Generate k thought candidates
    │   └─→ Create child nodes
    │
    └─→ Example:
        ├─→ Branch A: "Approach 1"
        ├─→ Branch B: "Approach 2"
        └─→ Branch C: "Approach 3"
      │
      ↓
T4 ── Evaluate & Score Each Node
    ├─→ Branch A: Score 0.7 (promising)
    ├─→ Branch B: Score 0.3 (struggling)
    └─→ Branch C: Score 0.9 (very promising)
      │
      ↓
T5 ── Select Search Strategy
    ├─→ BFS: Expand all at current depth
    ├─→ DFS: Follow best path deeply
    └─→ Beam: Keep top-k most promising
      │
      ↓ (Beam search with k=2, keep A and C)
T6 ── Expand Selected Nodes
    ├─→ Branch A → A1, A2, A3
    └─→ Branch C → C1, C2, C3
      │
      ↓
T7 ── Evaluate & Prune
    ├─→ Keep: A2 (0.8), C1 (0.9), C3 (0.85)
    ├─→ Prune: A1 (0.2), A3 (0.1), C2 (0.15)
    └─→ Mark dead-ends appropriately
      │
      ↓
T8 ── Check for Solution
    ├─→ IF node reaches complete solution → Evaluate quality
    ├─→ IF no solution found → T3 (continue expanding)
    └─→ IF all branches dead → T9 (backtrack)
      │
      ↓
T9 ── Backtrack if Needed
    ├─→ Return to parent node
    └─→ Try alternative branches
      │
      ↓
T10 ── Select Best Complete Path
    └─→ Return solution with exploration history
      │
      ↓
T11 ── Final Answer
```

### OpenCode Integration

```typescript
interface ToTNode {
  id: string
  thought: string
  parentID?: string
  children: string[]
  score: number
  status: "pending" | "expanded" | "dead-end" | "complete"
  depth: number
}

class TreeOfThoughts {
  private nodes: Map<string, ToTNode> = new Map()
  private rootID: string

  constructor(task: string) {
    this.rootID = this.createNode(task, undefined, 1.0, "pending")
    this.nodes.set(this.rootID, {
      id: this.rootID,
      thought: task,
      parentID: undefined,
      children: [],
      score: 1.0,
      status: "pending",
      depth: 0,
    })
  }

  private createNode(thought: string, parentID: string, score: number, status: ToTNode["status"]): string {
    const id = `tot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const parent = parentID ? this.nodes.get(parentID) : null
    const depth = parent ? parent.depth + 1 : 0

    this.nodes.set(id, {
      id,
      thought,
      parentID,
      children: [],
      score,
      status,
      depth,
    })

    if (parent) {
      parent.children.push(id)
    }

    return id
  }

  async expand(k: number = 3): Promise<void> {
    const pending = Array.from(this.nodes.values())
      .filter((n) => n.status === "pending")
      .sort((a, b) => b.score - a.score)

    for (const node of pending) {
      const candidates = await this.generateCandidates(node.thought, k)

      for (const candidate of candidates) {
        const score = await this.evaluate(candidate)
        const childID = this.createNode(candidate, node.id, score, "pending")
        node.status = "expanded"
      }
    }
  }

  async evaluate(thought: string): Promise<number> {
    // Call LLM to score thought quality
    // Return score 0-1
  }

  async generateCandidates(thought: string, k: number): Promise<string[]> {
    // Generate k alternative approaches
  }

  selectStrategy(strategy: "BFS" | "DFS" | "beam", k: number = 3): string[] {
    if (strategy === "BFS") {
      const maxDepth = Math.max(...Array.from(this.nodes.values()).map((n) => n.depth))
      return Array.from(this.nodes.values())
        .filter((n) => n.depth === maxDepth && n.status === "pending")
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map((n) => n.id)
    }

    if (strategy === "DFS") {
      // Find deepest pending node
      let best: ToTNode | null = null
      let bestDepth = -1

      const dfs = (node: ToTNode) => {
        if (node.depth > bestDepth && node.status === "pending") {
          best = node
          bestDepth = node.depth
        }
        for (const childID of node.children) {
          dfs(this.nodes.get(childID)!)
        }
      }

      dfs(this.nodes.get(this.rootID)!)
      return best ? [best.id] : []
    }

    if (strategy === "beam") {
      return Array.from(this.nodes.values())
        .filter((n) => n.status === "pending")
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map((n) => n.id)
    }

    return []
  }

  prune(threshold: number = 0.3): void {
    for (const [id, node] of this.nodes) {
      if (node.score < threshold && node.status !== "complete") {
        node.status = "dead-end"
      }
    }
  }

  backtrack(fromID: string): ToTNode | null {
    let current = this.nodes.get(fromID)
    while (current) {
      const siblingIDs = current.parentID ? this.nodes.get(current.parentID)!.children : []

      const untried = siblingIDs.filter((id) => {
        const sibling = this.nodes.get(id)!
        return sibling.status === "pending" && sibling.id !== current!.id
      })

      if (untried.length > 0) {
        return this.nodes.get(untried[0])!
      }

      current = this.nodes.get(current.parentID!)
    }
    return null
  }

  getBestPath(): { path: ToTNode[]; score: number } {
    const complete = Array.from(this.nodes.values()).filter((n) => n.status === "complete")

    if (complete.length === 0) {
      // Return highest scoring pending node
      const best = Array.from(this.nodes.values()).sort((a, b) => b.score - a.score)[0]
      return { path: this.reconstructPath(best.id), score: best.score }
    }

    const best = complete.sort((a, b) => b.score - a.score)[0]
    return { path: this.reconstructPath(best.id), score: best.score }
  }

  private reconstructPath(id: string): ToTNode[] {
    const path: ToTNode[] = []
    let current = this.nodes.get(id)
    while (current) {
      path.unshift(current)
      current = current.parentID ? this.nodes.get(current.parentID) : null
    }
    return path
  }
}

// Usage
async function treeOfThoughtsSolve(task: string, maxNodes: number = 50) {
  const tot = new TreeOfThoughts(task)

  while (tot.nodes.size < maxNodes) {
    await tot.expand(3)
    tot.prune(0.3)

    const { path, score } = tot.getBestPath()

    // Check if solution found
    const leaf = path[path.length - 1]
    if (await isSolution(leaf.thought)) {
      leaf.status = "complete"
      return { solution: leaf.thought, path, score }
    }

    // Select next nodes to expand
    const toExpand = tot.selectStrategy("beam", 2)

    for (const id of toExpand) {
      const node = tot.nodes.get(id)!
      node.status = "pending"
    }

    // Check for dead ends
    if (toExpand.length === 0) {
      const alternative = tot.backtrack(path[path.length - 1].id)
      if (!alternative) {
        // No more paths to try
        break
      }
      alternative.status = "pending"
    }
  }

  return tot.getBestPath()
}
```

### Benefits

- **Multiple solutions**: Explores alternative approaches
- **Quality selection**: Evaluates before committing
- **Backtracking**: Recovers from dead ends
- **Novel solutions**: Discovers non-obvious approaches

### Trade-offs

| Aspect      | Impact                        |
| ----------- | ----------------------------- |
| Token usage | ↑↑ Significantly higher       |
| Latency     | ↑↑ Slower (multiple branches) |
| Complexity  | ↑↑ Complex implementation     |

---

## 5. Graph of Thoughts (GoT)

### Concept

Extend ToT by allowing **arbitrary thought connections** (not just tree-structured)

### Origin

Besta et al. (2024) - "Graph of Thoughts: Solving Elaborate Problems with Large Language Models"

### Loop Structure Diagram

```
G1 ── Input: User task
      │
      ↓
G2 ── Initialize Graph
    └─→ Root node: Problem statement
        │
        ↓
G3 ── Generate Thought Node
    ├─→ Create coherent reasoning chunk
    ├─→ Connect to parent thoughts
    └─→ Store in graph
      │
      ↓
G4 ── Create Edges
    ├─→ Dependency edges (requires X)
    ├─→ Improvement edges (improves X)
    └─→ Contradiction edges (conflicts with X)
      │
      ↓
G5 ── Aggregate Insights
    ├─→ Combine outputs from multiple parent nodes
    ├─→ Synthesize into new thought
    └─→ Resolve conflicts
      │
      ↓
G6 ── Evaluate Graph Quality
    ├─→ Score each node
    ├─→ Score overall coherence
    └─→ Identify gaps
      │
      ↓
G7 ── Refine Thoughts
    ├─→ Update based on feedback
    ├─→ Re-score after changes
    └─→ Prune low-quality nodes
      │
      ↓
G8 ── Check Convergence
    ├─→ IF no improvement after N cycles → G9
    └─→ IF improving → G3 (generate new thought)
      │
      ↓
G9 ── Select Best Thought
    └─→ Return thought with best score
      │
      ↓
G10 ── Final Answer with Graph
```

### OpenCode Integration

```typescript
interface GoTNode {
  id: string
  thought: string
  type: "initial" | "intermediate" | "refinement" | "aggregation" | "solution"
  parents: string[]
  children: string[]
  edges: { type: "depends" | "improves" | "contradicts" | "aggregates"; target: string }[]
  score: number
  output: string
}

class GraphOfThoughts {
  private nodes: Map<string, GoTNode> = new Map()

  async generate(fromIDs: string[]): Promise<GoTNode> {
    // Generate new thought from existing thoughts
    const context = fromIDs.map((id) => this.nodes.get(id)!.thought).join("\n---\n")
    const newThought = await model.generate({
      prompt: `Based on these thoughts:\n${context}\n\nGenerate a new thought that:`,
    })

    const node: GoTNode = {
      id: ulid(),
      thought: newThought,
      type: "intermediate",
      parents: fromIDs,
      children: [],
      edges: fromIDs.map((target) => ({ type: "depends", target })),
      score: 0.5,
      output: "",
    }

    this.nodes.set(node.id, node)
    fromIDs.forEach((pid) => {
      const parent = this.nodes.get(pid)!
      parent.children.push(node.id)
    })

    return node
  }

  async aggregate(fromIDs: string[]): Promise<GoTNode> {
    // Combine insights from multiple thoughts
    const inputs = fromIDs.map((id) => this.nodes.get(id)!)
    const combined = await model.generate({
      prompt: `Aggregate these thoughts into a coherent synthesis:\n${inputs.map((t) => t.thought).join("\n\n")}`,
    })

    const node: GoTNode = {
      id: ulid(),
      thought: combined,
      type: "aggregation",
      parents: fromIDs,
      children: [],
      edges: fromIDs.map((target) => ({ type: "aggregates", target })),
      score: 0.7,
      output: combined,
    }

    this.nodes.set(node.id, node)
    return node
  }

  async refine(nodeID: string, feedback: string): Promise<GoTNode> {
    // Improve thought based on feedback
    const original = this.nodes.get(nodeID)!
    const improved = await model.generate({
      prompt: `Improve this thought based on feedback:\n\nOriginal: ${original.thought}\n\nFeedback: ${feedback}`,
    })

    const node: GoTNode = {
      id: ulid(),
      thought: improved,
      type: "refinement",
      parents: [nodeID],
      children: [],
      edges: [{ type: "improves", target: nodeID }],
      score: original.score + 0.1,
      output: improved,
    }

    this.nodes.set(node.id, node)
    return node
  }

  async evaluate(): Promise<void> {
    // Score all nodes
    for (const node of this.nodes.values()) {
      node.score = await this.scoreNode(node)
    }
  }

  getBest(): GoTNode | null {
    return (
      Array.from(this.nodes.values())
        .filter((n) => n.type === "solution" || n.type === "aggregation")
        .sort((a, b) => b.score - a.score)[0] || null
    )
  }
}
```

### Benefits

- **Thought synthesis**: Combine insights from multiple paths
- **Iterative refinement**: Improve thoughts through feedback
- **Flexible structure**: Complex reasoning dependencies
- **Conflict resolution**: Handle contradictory thoughts

### Trade-offs

| Aspect           | Impact                  |
| ---------------- | ----------------------- |
| Complexity       | ↑↑↑ Very complex        |
| Token usage      | ↑↑ Higher than ToT      |
| State management | ↑↑ Graph state overhead |

---

## 6. Reflexion Pattern

### Concept

**Generate → Reflect → Revise** cycles for systematic self-correction

### Origin

Shinn et al. (2023) - "Reflexion: Language Agents can Self-Correct via Verbal Reinforcement"

### Loop Structure Diagram

```
R1 ── Input: User task + constraints
      │
      ↓
R2 ── Generate: Create initial solution
    └─→ Output: Code, tests, documentation
      │
      ↓
R3 ── Evaluate: Assess solution
    ├─→ Does it solve the problem?
    ├─→ Does it meet constraints?
    ├─→ Are there edge cases?
    └─→ Generate evaluation report
      │
      ├─→ IF satisfactory → R9 (final answer)
      │
      ↓
R4 ── Reflect: Generate critique/feedback
    ├─→ What's working well?
    ├─→ What are the issues?
    ├─→ What should be improved?
    └─→ Specific suggestions
      │
      ↓
R5 ── Store Reflection
    └─→ Memory: { task, attempts, reflections, best_version }
      │
      ↓
R6 ── Revise: Incorporate feedback
    └─→ Output: Improved version + revision notes
      │
      ↓
R7 ── Check Termination
    ├─→ IF iteration < max AND improving → R3 (re-evaluate)
    └─→ IF no improvement after N → R9 (return best)
      │
      ↓
R8 ── Convergence Check
    ├─→ Improvement < threshold for N cycles
    ├─→ Solution quality >= target
    └─→ Maximum iterations reached
      │
      ↓
R9 ── Final Answer
    └─→ Return best solution with reflection history
```

### OpenCode Integration

```typescript
// New "reflect" tool
const reflectTool = Tool.define("reflect", async () => ({
  description: "Critique and reflect on solution quality",
  parameters: z.object({
    task: z.string(),
    solution: z.string(),
    evaluation_criteria: z.array(z.string()),
    previous_reflections: z.array(z.string()).optional(),
  }),
  async execute(params, ctx) {
    const reflection = await llm.generate({
      system: "You are a senior code reviewer. Critique solutions thoroughly but constructively.",
      prompt: `Task: ${params.task}
              Solution: ${params.solution}
              Criteria: ${params.evaluation_criteria.join(", ")}
              ${params.previous_reflections ? `Previous reflections:\n${params.previous_reflections.join("\n- ")}` : ""}
              
              Provide:
              1. What's working well (2-3 specific points)
              2. Issues and edge cases (be specific)
              3. Concrete improvement suggestions (numbered)
              4. Confidence score (0.0-1.0)
              5. Should we retry? (yes/no with reason)`,
    })

    // Store reflection in session
    await addSessionMemory(ctx.sessionID, {
      type: "reflection",
      task: params.task,
      solution: params.solution,
      reflection,
      timestamp: Date.now(),
    })

    return reflection
  },
}))

// New "revise" tool
const reviseTool = Tool.define("revise", async () => ({
  description: "Revise solution based on feedback",
  parameters: z.object({
    task: z.string(),
    current_solution: z.string(),
    reflection: z.string(),
  }),
  async execute(params, ctx) {
    const revised = await llm.generate({
      system: "You are a careful reviser. Incorporate feedback precisely.",
      prompt: `Task: ${params.task}
              Current solution: ${params.current_solution}
              Reflection/feedback: ${params.reflection}
              
              Revision guidelines:
              1. Address each issue from the reflection
              2. Keep what works unchanged
              3. Explain what changed and why
              4. Maintain overall structure and style
              
              Return the revised solution only.`,
    })

    return revised
  },
}))

// Reflexion loop implementation
async function reflexionLoop(
  task: string,
  initialSolution: string,
  maxIterations: number = 3,
): Promise<{ solution: string; reflections: Reflection[] }> {
  const reflections: Reflection[] = []
  let solution = initialSolution
  let bestSolution = solution
  let bestScore = 0

  const criteria = ["correctness", "completeness", "efficiency", "readability", "testability"]

  for (let i = 0; i < maxIterations; i++) {
    // Evaluate
    const evaluation = await evaluateSolution(solution, task, criteria)

    if (evaluation.score > bestScore) {
      bestScore = evaluation.score
      bestSolution = solution
    }

    if (evaluation.passes) {
      break // Good enough
    }

    // Reflect
    const previousReflections = reflections.map((r) => r.critique)
    const critique = await reflect({
      task,
      solution,
      evaluation_criteria: criteria,
      previous_reflections: previousReflections,
    })

    reflections.push({
      attempt: i + 1,
      critique,
      score: evaluation.score,
    })

    // Check for convergence
    if (i > 0 && reflections[i].score <= reflections[i - 1].score) {
      // No improvement, try a different approach
      solution = await generateAlternative(task, solution, critique)
    } else {
      // Revise based on critique
      solution = await revise({
        task,
        current_solution: solution,
        reflection: critique,
      })
    }
  }

  return {
    solution: bestSolution,
    reflections,
  }
}
```

### Benefits

- **Systematic self-correction**: Identifies and fixes errors
- **Quality improvement**: Multiple revision cycles
- **Learning**: Stores reflections for future reference
- **Better outputs**: Higher quality final solutions

### Trade-offs

| Aspect      | Impact                              |
| ----------- | ----------------------------------- |
| Latency     | ↑ Multiple iterations               |
| Token usage | ↑↑ Higher (reflections + revisions) |
| Complexity  | ↑ Reflection prompt engineering     |

---

## 7. Iterative Refinement

### Concept

**Gradual improvement** through repeated targeted refinement cycles

### Loop Structure

```
I1 ── Input: Initial solution
      │
      ↓
I2 ── Evaluate Quality
    ├─→ Score against quality criteria
    ├─→ Identify specific weaknesses
    └─→ Generate improvement targets
      │
      ↓
I3 ── Apply Refinements
    ├─→ Targeted improvements
    ├─→ Preserve what works
    └─→ Address identified issues
      │
      ↓
I4 ── Measure Improvement
    ├─→ Compare new vs old quality
    ├─→ Track improvement magnitude
    └─→ Check convergence
      │
      ├─→ IF improvement >= threshold → I5
      └─→ IF improvement < threshold → I2 (re-evaluate)
      │
      ↓
I5 ── Final Quality Check
    ├─→ Minimum quality threshold met?
    └─→ IF yes → I6 (final answer)
      │
      ↓
I6 ── Return Refined Solution
```

### OpenCode Integration

```typescript
interface QualityMetrics {
  correctness: number
  completeness: number
  efficiency: number
  readability: number
  maintainability: number
}

class IterativeRefinement {
  async refine(
    solution: string,
    task: string,
    minQuality: number = 0.8,
    maxIterations: number = 5,
  ): Promise<{ solution: string; metrics: QualityMetrics; iterations: number }> {
    let current = solution
    let iterations = 0
    let best = current
    let bestScore = 0

    while (iterations < maxIterations) {
      iterations++

      const metrics = await this.evaluate(current, task)
      const overallScore = this.aggregateScore(metrics)

      if (overallScore > bestScore) {
        bestScore = overallScore
        best = current
      }

      if (overallScore >= minQuality) {
        break
      }

      // Identify weakest areas
      const weakest = this.identifyWeakest(metrics)

      // Generate targeted improvements
      current = await this.improve(current, task, weakest)
    }

    return {
      solution: best,
      metrics: await this.evaluate(best, task),
      iterations,
    }
  }

  private async evaluate(solution: string, task: string): Promise<QualityMetrics> {
    // Evaluate solution quality
  }

  private aggregateScore(metrics: QualityMetrics): number {
    return (
      metrics.correctness * 0.3 +
      metrics.completeness * 0.25 +
      metrics.efficiency * 0.2 +
      metrics.readability * 0.15 +
      metrics.maintainability * 0.1
    )
  }

  private identifyWeakest(metrics: QualityMetrics): string[] {
    const sorted = Object.entries(metrics)
      .sort(([, a], [, b]) => a - b)
      .filter(([, score]) => score < 0.7)
      .map(([key]) => key)
    return sorted
  }

  private async improve(solution: string, task: string, focusAreas: string[]): Promise<string> {
    // Generate improvements for focus areas
  }
}
```

### Benefits

- **Quality convergence**: Reaches high-quality solutions
- **Targeted improvements**: Focuses on specific weaknesses
- **Resource efficiency**: Stops when improvement is marginal
- **Progressive enhancement**: Builds better solutions incrementally

### Trade-offs

| Aspect          | Impact                               |
| --------------- | ------------------------------------ |
| Latency         | ↑ Proportional to quality needs      |
| Token usage     | ↑ Higher for quality-focused tasks   |
| Evaluation cost | ↑ Need quality evaluation capability |

---

## 8. Multi-Agent Debate

### Concept

Multiple specialized agents **propose, critique, and converge** on solutions

### Loop Structure Diagram

```
D1 ── Input: User task
      │
      ↓
D2 ── Select Agents
    ├─→ Agent A: "Architect" - structural design
    ├─→ Agent B: "Implementer" - code generation
    ├─→ Agent C: "Reviewer" - quality assurance
    └─→ Agent D: "Security" - security analysis
      │
      ↓
D3 ── Round 1: Independent Proposals
    ├─→ Agent A → Proposal A (architecture)
    ├─→ Agent B → Proposal B (implementation)
    ├─→ Agent C → Proposal C (review plan)
    └─→ Agent D → Proposal D (security assessment)
      │
      ↓
D4 ── Share Proposals
    └─→ All agents receive all proposals
      │
      ↓
D5 ── Round 2: Critique
    ├─→ Agent A critiques B, C, D
    ├─→ Agent B critiques A, C, D
    ├─→ Agent C critiques A, B, D
    └─→ Agent D critiques A, B, C
      │
      ↓
D6 ── Round 3: Revision
    ├─→ Agent A → Revised A (incorporating critique)
    ├─→ Agent B → Revised B
    ├─→ Agent C → Revised C
    └─→ Agent D → Revised D
      │
      ↓
D7 ── Synthesis or Consensus
    ├─→ IF consensus reached → D9
    ├─→ IF voting enabled → D8
    └─→ IF moderator decides → D8
      │
      ↓
D8 ── Select Best Proposal
    ├─→ Voting round
    └─→ Moderator selects
      │
      ↓
D9 ── Final Implementation
    └─→ Use selected approach with refinements
      │
      ↓
D10 ── Final Answer
    └─→ Solution with debate transcript
```

### OpenCode Integration

```typescript
interface DebateAgent {
  name: string
  role: string
  expertise: string[]
  systemPrompt: string
}

interface Proposal {
  agent: string
  content: string
  score?: number
}

interface Critique {
  fromAgent: string
  targetAgent: string
  content: string
  score: number
}

// New "debate" tool
const debateTool = Tool.define("debate", async () => ({
  description: "Facilitate multi-agent debate",
  parameters: z.object({
    topic: z.string(),
    agents: z.array(
      z.object({
        name: z.string(),
        role: z.string(),
        expertise: z.array(z.string()),
      }),
    ),
    rounds: z.number().default(3),
    mode: z.enum(["proposal", "critique", "revision", "full"]),
  }),
  async execute(params, ctx) {
    const proposals: Proposal[] = []
    const critiques: Critique[] = []
    const debateLog: string[] = []

    for (let round = 1; round <= params.rounds; round++) {
      debateLog.push(`\n=== Round ${round} ===`)

      // Round 1: Proposals
      if (round === 1 || params.mode === "full" || params.mode === "proposal") {
        for (const agent of params.agents) {
          const proposal = await callSubagent({
            agent: agent.name,
            prompt: `As a ${agent.role} with expertise in ${agent.expertise.join(", ")}, 
                    propose a solution for: ${params.topic}`,
          })

          proposals.push({
            agent: agent.name,
            content: proposal,
          })

          debateLog.push(`${agent.name}: ${proposal.substring(0, 200)}...`)
        }
      }

      // Round 2: Critique
      if (params.mode === "full" || params.mode === "critique") {
        for (const proposal of proposals) {
          const targetAgent = params.agents.find((a) => a.name !== proposal.agent)!

          const critique = await callSubagent({
            agent: targetAgent.name,
            prompt: `Critique this proposal from ${proposal.agent}:\n\n${proposal.content}\n\n
                    Provide specific feedback on strengths, weaknesses, and improvements.`,
          })

          critiques.push({
            fromAgent: targetAgent.name,
            targetAgent: proposal.agent,
            content: critique,
            score: await evaluateCritique(critique),
          })

          debateLog.push(`${targetAgent.name} critiques ${proposal.agent}: ${critique.substring(0, 200)}...`)
        }
      }

      // Round 3: Revision
      if (params.mode === "full" || params.mode === "revision") {
        for (const proposal of proposals) {
          const relevantCritiques = critiques
            .filter((c) => c.targetAgent === proposal.agent)
            .map((c) => c.content)
            .join("\n\n")

          const revision = await callSubagent({
            agent: proposal.agent,
            prompt: `Revise your proposal based on these critiques:\n\n${relevantCritiques}\n\n
                    Original proposal:\n${proposal.content}`,
          })

          proposal.content = revision
          debateLog.push(`${proposal.agent} revises: ${revision.substring(0, 200)}...`)
        }
      }
    }

    // Select best proposal
    const bestProposal = proposals.reduce((best, current) =>
      (current.score || 0) > (best.score || 0) ? current : best,
    )

    return {
      best_proposal: bestProposal,
      all_proposals: proposals,
      critiques,
      debate_log: debateLog.join("\n"),
    }
  },
}))
```

### Benefits

- **Diverse perspectives**: Multiple specialized viewpoints
- **Error reduction**: Peer review catches mistakes
- **Creative solutions**: Cross-pollination of ideas
- **Quality through dialogue**: Debate improves solutions

### Trade-offs

| Aspect      | Impact                                |
| ----------- | ------------------------------------- |
| Token usage | ↑↑↑ Multiple agents × multiple rounds |
| Latency     | ↑↑↑ Parallel helps but still slow     |
| Complexity  | ↑↑↑ Orchestration overhead            |

---

## 9. Actor-Critic Pattern

### Concept

Separate **actor** (proposes actions) from **critic** (evaluates actions) for continuous improvement

### Origin

Inspired by reinforcement learning (Sutton & Barto)

### Loop Structure Diagram

```
A1 ── Input: User task
      │
      ↓
A2 ── Actor: Generate candidate action/solution
    └─→ "I'll implement feature X using approach Y"
      │
      ↓
A3 ── Critic: Evaluate candidate
    ├─→ Score: 0.75/1.0
    ├─→ Strengths: "Good approach for A, B"
    └─→ Weaknesses: "Missing edge case C"
      │
      ↓
A4 ── Feedback: Return score + suggestions to Actor
    ├─→ Score breakdown
    ├─→ Specific improvement areas
    └─→ Confidence level
      │
      ↓
A5 ── Actor: Adjust based on criticism
    └─→ "Critic is right about C, let me fix that"
      │
      ↓
A6 ── Next Iteration
    ├─→ IF score < threshold → A2 (new candidate)
    └─→ IF score >= threshold → A7 (execute)
      │
      ↓
A7 ── Execute Final Solution
      │
      ↓
A8 ── Final Answer
    └─→ Solution with actor-critic exchange
```

### OpenCode Integration

```typescript
interface ActorCriticResult {
  solution: string
  score: number
  actorOutputs: string[]
  criticFeedback: string[]
}

// New "critic" tool for evaluation
const criticTool = Tool.define("critic", async () => ({
  description: "Evaluate and critique solutions",
  parameters: z.object({
    candidate: z.string(),
    task: z.string(),
    criteria: z.array(z.string()),
    context: z.string().optional(),
  }),
  async execute(params, ctx) {
    const evaluation = await llm.generate({
      system: `You are a strict but fair code critic.
              Evaluate solutions against these criteria: ${params.criteria.join(", ")}`,
      prompt: `Task: ${params.task}
              Candidate solution: ${params.candidate}
              ${params.context ? `Additional context:\n${params.context}` : ""}
              
              Provide:
              1. Overall score (0-1) with justification
              2. What's good (2-3 points)
              3. What's wrong or missing (be specific)
              4. Concrete suggestions (numbered)
              5. Should we try again? (yes/no with reason)`,
    })

    return evaluation
  },
}))

// Actor-Critic loop
async function actorCriticLoop(
  task: string,
  criteria: string[],
  threshold: number = 0.8,
  maxAttempts: number = 5,
): Promise<ActorCriticResult> {
  const actorOutputs: string[] = []
  const criticFeedback: string[] = []
  let bestSolution = ""
  let bestScore = 0

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Actor generates candidate
    const candidate = await llm.generate({
      prompt: task,
    })
    actorOutputs.push(candidate)

    // Critic evaluates
    const feedback = await critic.evaluate(candidate, task, criteria)
    criticFeedback.push(feedback)

    // Extract score
    const score = extractScore(feedback)

    if (score > bestScore) {
      bestScore = score
      bestSolution = candidate
    }

    if (score >= threshold) {
      break // Good enough
    }
  }

  return {
    solution: bestSolution,
    score: bestScore,
    actorOutputs,
    criticFeedback,
  }
}
```

### Benefits

- **Real-time quality feedback**: Continuous evaluation
- **Continuous improvement**: Learn from each action
- **Catches mistakes early**: Before they propagate
- **Informed decision-making**: Based on critic evaluation

### Trade-offs

| Aspect            | Impact                         |
| ----------------- | ------------------------------ |
| Token usage       | ↑ Higher (actor + critic)      |
| Latency           | ↑ Additional round trip        |
| Prompt complexity | ↑ Two different prompts needed |

---

## 10. Hierarchical Task Networks (HTN)

### Concept

Decompose tasks into **hierarchical networks** of subtasks with dependencies

### Loop Structure Diagram

```
H1 ── Input: Complex task
      │
      ↓
H2 ── Analyze Task
    ├─→ Decompose into hierarchy
    ├─→ Identify subtask dependencies
    └─→ Create task network
      │
      ↓
H3 ── Create Dependency Graph
    ├─→ Subtask 1
    │   └─→ Subsubtask 1.1
    │   └─→ Subsubtask 1.2
    ├─→ Subtask 2
    │   └─→ Subsubtask 2.1
    │   └─→ Subsubtask 2.2
    ├─→ Subtask 3
    └─→ Dependencies: 1.2 → 2.1, 2.2 → 3
      │
      ↓
H4 ── Schedule Execution
    ├─→ Wave 1: 1.1, 3 (independent)
    ├─→ Wave 2: 1.2 (depends on 1.1)
    ├─→ Wave 3: 2.1 (depends on 1.2)
    └─→ Wave 4: 2.2 (depends on 1.2)
      │
      ↓
H5 ── Execute Tasks by Wave
    ├─→ Execute Wave 1 (parallel)
    ├─→ Validate completion
    ├─→ Update task state
    ├─→ Execute Wave 2
    └─→ ...continue...
      │
      ↓
H6 ── Handle Failures
    ├─→ IF task fails → Retry (max attempts)
    ├─→ IF still failing → Replan subtask
    └─→ IF root task impossible → Abort
      │
      ↓
H7 ── Verify Completion
    ├─→ All tasks complete?
    └─→ Goal achieved?
      │
      ↓
H8 ── Return Solution
    └─→ Execution trace + results
```

### OpenCode Integration

```typescript
interface HTNTask {
  id: string
  name: string
  description: string
  tool?: string
  params?: Record<string, any>
  status: "pending" | "ready" | "in_progress" | "completed" | "failed"
  dependencies: string[]
  result?: any
  subtasks?: HTNTask[]
}

interface HTNPlan {
  id: string
  rootTask: HTNTask
  taskMap: Map<string, HTNTask>
  status: "planning" | "executing" | "completed" | "failed"
}

// New "decompose" tool
const decomposeTool = Tool.define("decompose", async () => ({
  description: "Decompose complex task into hierarchical subtasks",
  parameters: z.object({
    task: z.string(),
    depth: z.number().default(3),
    include_tools: z.boolean().default(true),
  }),
  async execute(params, ctx) {
    const hierarchy = await llm.generate({
      prompt: `Decompose "${params.task}" into a hierarchy of subtasks.
              Format as JSON:
              {
                "task": "...",
                "subtasks": [
                  {
                    "id": "1",
                    "name": "...",
                    "description": "...",
                    "tool": "..." (optional),
                    "params": {{...}} (optional),
                    "dependencies": [],
                    "subtasks": [...]
                  }
                ]
              }
              
              Consider:
              1. Logical task decomposition
              2. Dependencies between tasks
              3. Appropriate tools for each task
              4. Parallelizable independent tasks`,
    })

    return hierarchy
  },
}))

// New "execute_network" tool
const executeNetworkTool = Tool.define("execute_network", async () => ({
  description: "Execute hierarchical task network",
  parameters: z.object({
    plan_id: z.string(),
    max_parallel: z.number().default(3),
  }),
  async execute(params, ctx) {
    const plan = await getPlan(params.plan_id)
    const taskMap = plan.taskMap
    const results: Map<string, any> = new Map()

    // Track ready tasks (dependencies met)
    const readyTasks = new Set<string>()
    const executingTasks = new Map<string, Promise<any>>()

    // Initialize with root-level tasks
    for (const [id, task] of taskMap) {
      if (task.dependencies.length === 0) {
        readyTasks.add(id)
      }
    }

    while (readyTasks.size > 0 || executingTasks.size > 0) {
      // Launch ready tasks (up to max_parallel)
      const toLaunch = Array.from(readyTasks).slice(0, params.max_parallel - executingTasks.size)

      for (const taskID of toLaunch) {
        readyTasks.delete(taskID)
        const task = taskMap.get(taskID)!
        task.status = "in_progress"

        const promise = (async () => {
          try {
            const result = await executeTask(task, results)
            task.status = "completed"
            task.result = result
            results.set(taskID, result)

            // Check newly ready tasks
            for (const [id, t] of taskMap) {
              if (t.status === "pending" && t.dependencies.every((d) => taskMap.get(d)!.status === "completed")) {
                readyTasks.add(id)
              }
            }

            return result
          } catch (error) {
            task.status = "failed"
            task.result = { error: error.message }
            return { error: error.message }
          }
        })()

        executingTasks.set(taskID, promise)
      }

      // Wait for at least one to complete
      if (executingTasks.size > 0) {
        const completedID = await Promise.race(
          Array.from(executingTasks.values()).map((p) =>
            p.then(() => Array.from(executingTasks.entries()).find(([id, pr]) => pr === p)?.[0]),
          ),
        )

        if (completedID) {
          executingTasks.delete(completedID)
        }
      }
    }

    return {
      plan_id: params.plan_id,
      results: Object.fromEntries(results),
      completed: Array.from(taskMap.values()).filter((t) => t.status === "completed").length,
      failed: Array.from(taskMap.values()).filter((t) => t.status === "failed").length,
    }
  },
}))
```

### Benefits

- **Complex task handling**: Systematically decompose large tasks
- **Dependency management**: Execute tasks in correct order
- **Parallel execution**: Independent tasks run concurrently
- **Reuse**: Predefined task patterns
- **Robustness**: Clear failure handling at each level

### Trade-offs

| Aspect      | Impact                           |
| ----------- | -------------------------------- |
| Complexity  | ↑↑↑ Complex planning required    |
| Flexibility | ↓ Less adaptive (locked plan)    |
| Overhead    | ↑ Planning + scheduling overhead |

---

## 11. Comparative Analysis

### Loop Characteristics Matrix

| Pattern          | Loop Complexity | Termination     | Backtracking        | Self-Reflection |
| ---------------- | --------------- | --------------- | ------------------- | --------------- |
| **OpenCode**     | Low             | Explicit        | Limited (doom loop) | None            |
| **ReAct**        | Low             | Explicit        | Via observations    | Implicit        |
| **Plan-Execute** | Medium          | Explicit        | Replan              | Limited         |
| **ToT**          | High            | Score-based     | Full                | Evaluation      |
| **GoT**          | Very High       | Convergence     | Full                | Aggregation     |
| **Reflexion**    | Medium          | Iteration limit | Via revision        | Explicit        |
| **Iterative**    | Medium          | Quality-based   | Via refinement      | Evaluation      |
| **Multi-Agent**  | High            | Consensus/Vote  | Via discussion      | Peer review     |
| **Actor-Critic** | Medium          | Score threshold | New candidate       | Critic          |
| **HTN**          | High            | Task completion | Replan              | Limited         |

### Suitability Matrix

| Task Type                | Best Pattern(s)           | Why                     |
| ------------------------ | ------------------------- | ----------------------- |
| Simple code generation   | OpenCode, ReAct           | Minimal overhead        |
| Complex refactoring      | Plan-Execute, HTN         | Task decomposition      |
| Creative problem-solving | ToT, GoT                  | Multiple approaches     |
| Quality-critical code    | Reflexion, Multi-Agent    | Self-correction, review |
| Documentation writing    | Iterative, Reflexion      | Quality improvement     |
| Security analysis        | Multi-Agent (specialized) | Diverse expertise       |
| API integration          | Plan-Execute, HTN         | Sequential steps        |
| Bug fixing               | Reflexion, Actor-Critic   | Error correction        |

### Implementation Effort vs Impact

| Pattern          | Implementation Effort | Potential Impact | Risk Level |
| ---------------- | --------------------- | ---------------- | ---------- |
| **ReAct**        | Low                   | Medium           | Low        |
| **Plan-Execute** | Medium                | High             | Medium     |
| **ToT**          | High                  | High             | High       |
| **GoT**          | Very High             | High             | Very High  |
| **Reflexion**    | Medium                | High             | Medium     |
| **Iterative**    | Medium                | Medium           | Medium     |
| **Multi-Agent**  | High                  | High             | Medium     |
| **Actor-Critic** | Medium                | Medium           | Medium     |
| **HTN**          | High                  | High             | Medium     |

---

## 12. Recommendations

### Recommended Hybrid Approach

Based on analysis, I recommend a **phased hybrid implementation**:

#### Phase 1: Reflexion + ReAct (Medium Impact, Medium Effort)

```
Current Loop → Add Reflection Step After Tool Execution
```

**Changes:**

1. Add `reflect` tool that critiques recent actions
2. Use reflection output to guide next tool selection
3. Store reflections for learning

**Implementation:**

```typescript
// After each tool execution in processor.ts
const reflection = await reflect({
  task: currentTask,
  action: toolName,
  result: toolResult,
})

// Use reflection to inform next action
if (reflection.shouldRetry) {
  // Retry with different approach
}
```

#### Phase 2: Plan-Execute Integration (High Impact, Medium Effort)

```
Planning Agent → Plan Storage → Execution Agent
```

**Changes:**

1. Add `plan` tool that creates structured plans
2. Add `execute_step` tool for sequential execution
3. Store plans in session for revision

**Implementation:**

```typescript
// At start of complex task
const plan = await planTool.execute({ task: userRequest })

// Execute step by step
for (const step of plan.steps) {
  await executeStepTool.execute({ step_id: step.id })
}
```

#### Phase 3: Quality Gates with Actor-Critic (Medium Impact, Medium Effort)

```
Actor → Critic → Threshold Check → Execute or Retry
```

**Changes:**

1. Add `critic` tool for quality evaluation
2. Implement quality thresholds
3. Retry loop for sub-threshold solutions

### Priority Matrix

| Priority | Feature                   | Impact | Effort | Risk   |
| -------- | ------------------------- | ------ | ------ | ------ |
| 1        | ReAct-style reasoning     | Medium | Low    | Low    |
| 2        | Reflection tool           | High   | Medium | Low    |
| 3        | Plan-Execute separation   | High   | Medium | Medium |
| 4        | Failure analysis taxonomy | Medium | Low    | Low    |
| 5        | Tree of Thoughts          | High   | High   | High   |
| 6        | Multi-Agent debate        | High   | High   | Medium |
| 7        | Actor-Critic              | Medium | Medium | Medium |
| 8        | HTN decomposition         | High   | High   | Medium |

### Key Opportunities

1. **Reflection Layer**: Adding explicit reflection after tool execution would significantly improve reliability without fundamental changes

2. **Plan Storage**: Current session state could easily support plan storage for Plan-Execute pattern

3. **Multi-Agent via Task Tool**: The existing `task` tool provides foundation for multi-agent patterns

4. **Quality Metrics**: Current cost/token tracking could be extended with quality metrics

### Conclusion

OpenCode's current loop is a solid foundation but reactive. Adding **structured reasoning** (ReAct), **self-reflection** (Reflexion), and **explicit planning** (Plan-Execute) would significantly enhance capabilities:

1. **ReAct**: Low effort, improves reasoning visibility
2. **Reflexion**: Medium effort, enables self-correction
3. **Plan-Execute**: Medium effort, better task decomposition
4. **Multi-Agent**: High effort, diverse expertise

The phased approach allows incremental enhancement while maintaining backward compatibility.

---

## Appendix A: Source Code References

| Component   | File                                          | Lines   |
| ----------- | --------------------------------------------- | ------- |
| Main Loop   | `packages/opencode/src/session/prompt.ts`     | 230-563 |
| Processor   | `packages/opencode/src/session/processor.ts`  | 24-409  |
| Tool System | `packages/opencode/src/tool/tool.ts`          | 1-72    |
| Task Tool   | `packages/opencode/src/tool/task.ts`          | 1-204   |
| Session     | `packages/opencode/src/session/index.ts`      | 1-469   |
| Message V2  | `packages/opencode/src/session/message-v2.ts` | 1-675   |
| Agent       | `packages/opencode/src/agent/agent.ts`        | 1-431   |
| LLM         | `packages/opencode/src/session/llm.ts`        | 1-202   |

## Appendix B: Glossary

| Term                | Definition                                                              |
| ------------------- | ----------------------------------------------------------------------- |
| Agentic Loop        | Iterative process where an AI agent takes actions based on observations |
| Doom Loop Detection | Mechanism to detect and prevent infinite repetitive tool calls          |
| Session Compaction  | Summarization of conversation history to manage context                 |
| Tool Registry       | Central catalog of available tools with metadata                        |
| Subagent            | Separate agent instance spawned for specific tasks                      |
| Streaming           | Real-time processing of LLM output as it's generated                    |
| AbortController     | Mechanism for cancelling in-progress operations                         |

## Appendix C: References

1. Yao, J., et al. (2023). "ReAct: Synergizing reasoning and acting in language models"
2. Yao, J., et al. (2023). "Tree of Thoughts: Deliberate problem solving with LLMs"
3. Besta, M., et al. (2024). "Graph of Thoughts: Solving elaborate problems with LLMs"
4. Shinn, N., et al. (2023). "Reflexion: Language agents can self-correct via verbal reinforcement"
5. Sutton, R. & Barto, A. (2018). "Reinforcement Learning: An Introduction"

---

_Document generated: December 2025_
_Last updated: December 31, 2025_
