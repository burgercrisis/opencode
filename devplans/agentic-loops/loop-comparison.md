# Agentic Loop Patterns: Deep Comparison

> December 2025

## Quick Comparison Table

| Pattern                 | Complexity | Best For          | Integration | Key Benefit        | Token Usage | Latency   |
| ----------------------- | ---------- | ----------------- | ----------- | ------------------ | ----------- | --------- |
| **OpenCode (Original)** | Low        | General coding    | None        | Tool orchestration | Baseline    | Baseline  |
| **ReAct**               | Low        | General purpose   | Easy        | Explicit reasoning | +20-40%     | +10-20%   |
| **Plan-Execute**        | Medium     | Complex tasks     | Medium      | Task decomposition | +30-50%     | +20-40%   |
| **Tree of Thoughts**    | High       | Creative problems | Hard        | Multiple solutions | +200-500%   | +200-400% |
| **Reflexion**           | Medium     | Quality-critical  | Medium      | Self-correction    | +50-100%    | +50-100%  |
| **Multi-Agent**         | High       | Complex domains   | Hard        | Diverse expertise  | +300-600%   | +200-500% |
| **Actor-Critic**        | Medium     | High-stakes       | Medium      | Quality feedback   | +40-80%     | +30-60%   |
| **HTN**                 | High       | Large projects    | Hard        | Dependency mgmt    | +40-80%     | +30-60%   |

---

## 1. Original OpenCode Loop

### Description

Current production loop with streaming tool calls, doom loop detection, and session compaction.

### Loop Structure

```
User Input → Stream LLM → Tool Calls → Observe Results → [Repeat or End]
```

### Characteristics

- **Loop Type**: Single-pass streaming with iteration
- **Reasoning**: Implicit (in LLM completions)
- **Planning**: None explicit
- **Self-Correction**: Doom loop detection only
- **Branching**: None
- **Parallelism**: Sequential tool calls

### Strengths

- Low latency (streaming)
- Low token usage
- Simple to understand/debug
- Production-hardened
- Good tool integration

### Weaknesses

- No explicit reasoning trace
- No self-correction cycles
- No exploration of alternatives
- Limited error recovery

### Best Use Cases

- Simple code generation
- File editing tasks
- Bash command execution
- Quick iterations

### Integration Difficulty

**None** - Already integrated

---

## 2. ReAct (Reasoning + Acting)

### Description

Explicitly alternate between reasoning thoughts and tool actions with observations.

### Loop Structure

```
THOUGHT → ACTION → OBSERVATION → THOUGHT → ...
                                      ↓
                                 FINAL ANSWER
```

### Characteristics

- **Loop Type**: Explicit step-by-step with reasoning trace
- **Reasoning**: Explicit (THOUGHT steps visible)
- **Planning**: Emergent from thought process
- **Self-Correction**: Through observation analysis
- **Branching**: None (linear but reflective)
- **Parallelism**: Sequential

### Strengths

- Visible reasoning trace
- Better error recovery
- Reduced hallucination
- Easier debugging
- Good for exploratory tasks

### Weaknesses

- Higher token overhead
- Can be verbose
- May over-think simple tasks
- Depends on reasoning quality

### Best Use Cases

- Exploratory code analysis
- Debugging with observation
- Learning new codebases
- Complex refactoring with reasoning

### Integration Difficulty

**Easy** - Add reasoning prompt template

### Token Multiplier

**1.2x - 1.4x** baseline

---

## 3. Plan-Execute Pattern

### Description

Separate planning phase from execution phase with explicit plan storage.

### Loop Structure

```
[PLANNING PHASE]
Analyze Task → Generate Steps → Store Plan →

[EXECUTION PHASE]
Execute Step 1 → Validate → Execute Step 2 → Validate → ...
                                              ↓
                                        FINAL ANSWER
```

### Characteristics

- **Loop Type**: Two-phase (plan then execute)
- **Reasoning**: In planning phase
- **Planning**: Explicit multi-step plan
- **Self-Correction**: Replan on failure
- **Branching**: None (linear execution)
- **Parallelism**: Steps can run in parallel if independent

### Strengths

- Clear task decomposition
- Good for complex multi-step tasks
- Can cache plans for reuse
- Easy to understand progress
- Failure recovery at step level

### Weaknesses

- Plans may be wrong initially
- Less adaptive mid-execution
- Planning overhead
- Plan maintenance cost

### Best Use Cases

- Complex refactoring
- Feature implementation
- Test-driven development
- Multi-file changes

### Integration Difficulty

**Medium** - Need plan storage, step execution

### Token Multiplier

**1.3x - 1.5x** baseline

---

## 4. Tree of Thoughts (ToT)

### Description

Explore multiple solution branches with scoring and backtracking.

### Loop Structure

```
                    [Root: Problem]
                          ↓
              Generate k candidate thoughts
                    /    |    \
             Branch A Branch B Branch C
               ↓        ↓        ↓
            Score   Score    Score
               \        /      \
                \      /        \
                 \    /          \
                  \  /            \
                   \/              \
              [Keep best k]    [Prune worst]
                    ↓
         Generate next level thoughts
                    ↓
            [Check for solution]
                    ↓
         IF solution → Return best path
         IF dead end → Backtrack
```

### Characteristics

- **Loop Type**: Branching exploration with backtracking
- **Reasoning**: Multiple candidate thoughts per step
- **Planning**: Emergent from exploration
- **Self-Correction**: Backtracking on dead ends
- **Branching**: Full tree exploration
- **Parallelism**: Can explore branches in parallel

### Strengths

- Explores multiple solutions
- Quality selection via scoring
- Can discover non-obvious approaches
- Good for creative problems
- Reduced commitment to wrong path

### Weaknesses

- Very high token usage
- Slow execution
- Complex implementation
- Requires good scoring function
- Memory intensive

### Best Use Cases

- Creative code generation
- Algorithm design
- Optimization problems
- Novel solutions needed

### Integration Difficulty

**Hard** - Need tree state, scoring, backtracking

### Token Multiplier

**3x - 6x** baseline

---

## 5. Reflexion Pattern

### Description

Generate solutions, critique them, revise, and iterate.

### Loop Structure

```
Generate → Critique → Revise → Critique → Revise → ...
                                              ↓
                                        FINAL ANSWER
                                              ↑
                              (Repeat until satisfactory)
```

### Characteristics

- **Loop Type**: Iterative generation-critique-revision
- **Reasoning**: In critique phase
- **Planning**: Emergent from critiques
- **Self-Correction**: Systematic revision cycles
- **Branching**: None (linear improvement)
- **Parallelism**: Sequential

### Strengths

- Systematic self-correction
- Quality improvement through iteration
- Learning from mistakes (stored)
- High-quality outputs
- Good for quality-critical tasks

### Weaknesses

- Multiple iterations = high tokens
- Depends on critique quality
- May oscillate between solutions
- Convergence not guaranteed

### Best Use Cases

- Code review tasks
- Documentation writing
- Test generation
- Bug fixing with reflection

### Integration Difficulty

**Medium** - Need critique and revision tools

### Token Multiplier

**1.5x - 2x** baseline

---

## 6. Multi-Agent Debate

### Description

Multiple specialized agents propose, critique, and converge on solutions.

### Loop Structure

```
[Round 1: Proposals]
Agent A → Proposal A
Agent B → Proposal B
Agent C → Proposal C

[Round 2: Critique]
Agent A critiques B, C
Agent B critiques A, C
Agent C critiques A, B

[Round 3: Revision]
All agents revise based on critiques

[... Repeat or Vote ...]
                    ↓
              CONSENSUS or VOTE
                    ↓
              FINAL ANSWER
```

### Characteristics

- **Loop Type**: Multi-agent collaborative
- **Reasoning**: Distributed across agents
- **Planning**: Emergent from discussion
- **Self-Correction**: Peer review catches errors
- **Branching**: Multiple perspectives
- **Parallelism**: Agents can work in parallel

### Strengths

- Diverse perspectives
- Peer review quality control
- Cross-pollination of ideas
- Specialized expertise
- Good for complex domains

### Weaknesses

- Very high token usage
- Slow (multiple agents × rounds)
- Complex orchestration
- Consensus challenges
- May be overkill for simple tasks

### Best Use Cases

- Architecture decisions
- Security review
- Complex debugging
- Design discussions

### Integration Difficulty

**Hard** - Need agent orchestration, debate protocol

### Token Multiplier

**4x - 7x** baseline

---

## 7. Actor-Critic Pattern

### Description

Separate actor (proposes) from critic (evaluates) for continuous improvement.

### Loop Structure

```
Actor: Generate candidate solution
        ↓
Critic: Score and provide feedback
        ↓
Actor: Adjust based on feedback
        ↓
IF score >= threshold → Execute
ELSE → Repeat from Actor
```

### Characteristics

- **Loop Type**: Actor-critic feedback loop
- **Reasoning**: In both actor and critic
- **Planning**: Actor proposes, critic refines
- **Self-Critic**: Continuous feedback
- **Branching**: None (linear improvement)
- **Parallelism**: Sequential

### Strengths

- Real-time quality feedback
- Continuous improvement
- Catches errors early
- Informed decision-making
- Good for high-stakes tasks

### Weaknesses

- Actor and critic must sync
- Can oscillate if critic harsh
- Higher token overhead
- Depends on critic quality

### Best Use Cases

- Critical code generation
- Security-sensitive tasks
- Performance optimization
- Production code review

### Integration Difficulty

**Medium** - Need critic tool, threshold system

### Token Multiplier

**1.4x - 1.8x** baseline

---

## 8. Hierarchical Task Networks (HTN)

### Description

Decompose tasks into hierarchical networks with dependency management.

### Loop Structure

```
[Decomposition Phase]
Task → Subtask 1 → Subsubtask 1.1, 1.2
     → Subtask 2 → Subsubtask 2.1, 2.2
     → Subtask 3
                    ↓
[Execution Phase - Wave-based]
Wave 1: Execute 1.1, 3 (independent)
Wave 2: Execute 1.2 (depends on 1.1)
Wave 3: Execute 2.1 (depends on 1.2)
Wave 4: Execute 2.2 (depends on 1.2)
                    ↓
              FINAL ANSWER
```

### Characteristics

- **Loop Type**: Hierarchical with dependency management
- **Reasoning**: In decomposition
- **Planning**: Explicit hierarchical
- **Self-Correction**: Replan subtask on failure
- **Branching**: None (but parallel execution)
- **Parallelism**: Independent subtasks can run together

### Strengths

- Handles complex multi-level tasks
- Dependency management
- Parallel execution
- Clear failure handling
- Reusable task patterns

### Weaknesses

- Complex decomposition required
- Less flexible than flat approaches
- Planning overhead
- Dependency errors can cascade

### Best Use Cases

- Large refactoring projects
- Feature implementation
- Test suite creation
- Multi-file migrations

### Integration Difficulty

**Hard** - Need task decomposition, scheduler

### Token Multiplier

**1.4x - 1.8x** baseline

---

## Deep Comparison Matrix

### Reasoning & Planning

| Pattern      | Reasoning        | Planning | Self-Correction | Exploration           |
| ------------ | ---------------- | -------- | --------------- | --------------------- |
| OpenCode     | Implicit         | None     | Doom detection  | None                  |
| ReAct        | Explicit         | Emergent | Via observation | None                  |
| Plan-Execute | In planning      | Explicit | Replanning      | None                  |
| ToT          | Multiple         | Emergent | Backtracking    | Full tree             |
| Reflexion    | In critique      | Emergent | Revision cycles | None                  |
| Multi-Agent  | Distributed      | Emergent | Peer review     | Multiple perspectives |
| Actor-Critic | Dual             | Emergent | Continuous      | None                  |
| HTN          | In decomposition | Explicit | Replanning      | None                  |

### Execution Characteristics

| Pattern      | Parallelism       | State Management | Memory Usage | Failure Handling     |
| ------------ | ----------------- | ---------------- | ------------ | -------------------- |
| OpenCode     | Sequential        | Simple           | Baseline     | Retry + doom loop    |
| ReAct        | Sequential        | Simple           | Low          | Observation analysis |
| Plan-Execute | Parallel waves    | Plan + status    | Medium       | Replan from failure  |
| ToT          | Parallel branches | Tree + path      | High         | Backtracking         |
| Reflexion    | Sequential        | Revision history | Medium       | Multiple revisions   |
| Multi-Agent  | Parallel agents   | Debate state     | Very high    | Consensus/vote       |
| Actor-Critic | Sequential        | Feedback history | Medium       | Retry with feedback  |
| HTN          | Parallel waves    | Task graph       | Medium       | Retry/replan subtask |

### Quality Metrics

| Pattern      | Correctness | Completeness | Creativity | Consistency |
| ------------ | ----------- | ------------ | ---------- | ----------- |
| OpenCode     | Good        | Good         | Low        | High        |
| ReAct        | Good        | Good         | Medium     | Medium      |
| Plan-Execute | Very Good   | Very Good    | Medium     | High        |
| ToT          | Good        | Good         | Very High  | Low         |
| Reflexion    | Very Good   | Very Good    | Medium     | High        |
| Multi-Agent  | Excellent   | Excellent    | High       | Medium      |
| Actor-Critic | Excellent   | Good         | Medium     | High        |
| HTN          | Very Good   | Very Good    | Medium     | High        |

### Token & Latency Analysis

| Pattern      | Setup Tokens | Per-Step Tokens       | Total Tokens | Latency   |
| ------------ | ------------ | --------------------- | ------------ | --------- |
| OpenCode     | 500          | 100-500               | Baseline     | Baseline  |
| ReAct        | 800          | 200-800               | 1.2-1.4x     | +10-20%   |
| Plan-Execute | 1000         | 300-1000              | 1.3-1.5x     | +20-40%   |
| ToT          | 500 × k      | 500 × k × depth       | 3-6x         | +200-400% |
| Reflexion    | 800          | 500-1500 × iterations | 1.5-2x       | +50-100%  |
| Multi-Agent  | 500 × agents | 500 × agents × rounds | 4-7x         | +200-500% |
| Actor-Critic | 600          | 400-800               | 1.4-1.8x     | +30-60%   |
| HTN          | 1000         | 300-800               | 1.4-1.8x     | +30-60%   |

---

## Decision Matrix: Which Loop to Use?

### By Task Complexity

| Complexity                          | Recommended Patterns |
| ----------------------------------- | -------------------- |
| Simple (single file, obvious fix)   | OpenCode             |
| Medium (multi-file, clear approach) | OpenCode, ReAct      |
| Complex (unclear approach)          | ReAct, Plan-Execute  |
| Very Complex (exploratory)          | ToT, Reflexion       |
| Expert (architecture, design)       | Multi-Agent, HTN     |

### By Task Type

| Task Type              | Best Pattern | Alternative  |
| ---------------------- | ------------ | ------------ |
| Bug fixing             | Reflexion    | ReAct        |
| Feature implementation | Plan-Execute | HTN          |
| Code exploration       | ReAct        | OpenCode     |
| Creative algorithm     | ToT          | Multi-Agent  |
| Code review            | Actor-Critic | Reflexion    |
| Architecture decision  | Multi-Agent  | Plan-Execute |
| Large refactor         | HTN          | Plan-Execute |
| Documentation          | Reflexion    | ReAct        |

### By Time Constraints

| Time Available  | Best Pattern            |
| --------------- | ----------------------- |
| Need answer NOW | OpenCode                |
| Have 5-10 min   | ReAct                   |
| Have 10-30 min  | Plan-Execute, Reflexion |
| Have 30+ min    | ToT, Multi-Agent        |

---

## Recommended Combinations

### Simple Stack

```
OpenCode (default) + ReAct (option)
```

Use OpenCode for most tasks, ReAct for exploratory/debugging.

### Balanced Stack

```
OpenCode + ReAct + Plan-Execute
```

Covers 90% of use cases with increasing complexity.

### Full Stack

```
OpenCode + ReAct + Plan-Execute + ToT + Reflexion
```

Maximum flexibility for any task type.

### Expert Stack

```
OpenCode + ReAct + Multi-Agent + HTN
```

For complex projects with team collaboration patterns.

---

## Risk Assessment by Pattern

| Pattern      | Implementation Risk | Runtime Risk | Maintenance Risk |
| ------------ | ------------------- | ------------ | ---------------- |
| OpenCode     | None                | Low          | Low              |
| ReAct        | Low                 | Low          | Low              |
| Plan-Execute | Medium              | Medium       | Medium           |
| ToT          | High                | High         | High             |
| Reflexion    | Medium              | Medium       | Medium           |
| Multi-Agent  | Very High           | High         | Very High        |
| Actor-Critic | Medium              | Medium       | Medium           |
| HTN          | High                | Medium       | High             |

---

## Summary Recommendations

### For OpenCode Integration

**Start Small:**

1. OpenCode (default) - existing
2. ReAct - easy to add, high value
3. Plan-Execute - medium effort, good for complex tasks

**Advanced (if needed):** 4. Reflexion - good for quality-critical 5. ToT - creative problem solving 6. Multi-Agent - expert level

**Avoid Initially:**

- HTN (too complex for most tasks)
- Full Multi-Agent (orchestration overhead)

### By Team Size

| Team Size          | Recommended Patterns            |
| ------------------ | ------------------------------- |
| Solo developer     | OpenCode + ReAct                |
| Small team (2-5)   | OpenCode + ReAct + Plan-Execute |
| Medium team (5-15) | Full stack                      |
| Large team (15+)   | Add Multi-Agent for reviews     |

---

_Document created: December 2025_
