import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./codesearch.txt"

const API_CONFIG = {
  BASE_URL: "https://mcp.exa.ai",
  ENDPOINTS: {
    CONTEXT: "/mcp",
  },
} as const

interface McpCodeRequest {
  jsonrpc: string
  id: number
  method: string
  params: {
    name: string
    arguments: {
      query: string
      tokensNum: number
    }
  }
}

interface McpCodeResponse {
  jsonrpc: string
  result: {
    content: Array<{
      type: string
      text: string
    }>
  }
}

export const CodeSearchTool = Tool.define("codesearch", {
  description: DESCRIPTION,
  parameters: z.object({
    query: z
      .string()
      .describe(
        "Search query to find relevant context for APIs, Libraries, and SDKs. For example, 'React useState hook examples', 'Python pandas dataframe filtering', 'Express.js middleware', 'Next js partial prerendering configuration'",
      ),
    tokensNum: z
      .number()
      .min(1000)
      .max(50000)
      .default(5000)
      .describe(
        "Number of tokens to return (1000-50000). Default is 5000 tokens. Adjust this value based on how much context you need - use lower values for focused queries and higher values for comprehensive documentation.",
      ),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "codesearch",
      patterns: [params.query],
      always: ["*"],
      metadata: {
        query: params.query,
        tokensNum: params.tokensNum,
      },
    })

    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, ctx.abort])
    const timer = setTimeout(() => controller.abort(), 30000)

    return fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CONTEXT}`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "get_code_context_exa",
          arguments: {
            query: params.query,
            tokensNum: params.tokensNum || 5000,
          },
        },
      }),
      signal,
    })
      .finally(() => clearTimeout(timer))
      .then(async (res) =>
        !res.ok
          ? (() => { throw new Error(`Code search error (${res.status}): ${res.text()}`) })()
          : res.text()
      )
      .then((text) => {
        const found = text.split("\n").find((line) => line.startsWith("data: "))
        const data = found ? (JSON.parse(found.substring(6)) as McpCodeResponse) : null

        return data?.result?.content?.[0]
          ? {
              output: data.result.content[0].text,
              title: `Code search: ${params.query}`,
              metadata: {},
            }
          : {
              output: "No code snippets or documentation found. Please try a different query, be more specific about the library or programming concept, or check the spelling of framework names.",
              title: `Code search: ${params.query}`,
              metadata: {},
            }
      })
      .catch((err) =>
        err instanceof Error && err.name === "AbortError"
          ? (() => { throw new Error("Code search request timed out") })()
          : (() => { throw err })()
      )
  },
})
