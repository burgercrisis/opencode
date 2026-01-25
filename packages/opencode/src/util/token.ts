export namespace Token {
  const CHARS_PER_TOKEN = 4

  export function estimate(input: string) {
    return Math.max(0, Math.round((input || "").length / CHARS_PER_TOKEN))
  }

  export function calculateToolResultTokens(parts: Array<{ type: string; state?: any }>) {
    let tokens = 0
    for (const part of parts) {
      if (part.type === "tool") {
        if (!part.state) continue
        if (part.state.input) {
          tokens += estimate(JSON.stringify(part.state.input))
        }

        if (part.state.status === "completed") {
          const output = part.state.time?.compacted
            ? "[Old tool result content cleared]"
            : (part.state.output ?? "")
          tokens += estimate(output)
        }

        if (part.state.status === "error" && part.state.error) {
          tokens += estimate(part.state.error)
        }
      }
    }
    return tokens
  }
}
