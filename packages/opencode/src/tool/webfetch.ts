import z from "zod"
import { Tool } from "./tool"
import TurndownService from "turndown"
import DESCRIPTION from "./webfetch.txt"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT = 30 * 1000 // 30 seconds
const MAX_TIMEOUT = 120 * 1000 // 2 minutes

export const WebFetchTool = Tool.define("webfetch", {
  description: DESCRIPTION,
  parameters: z.object({
    url: z.string().describe("The URL to fetch content from"),
    format: z
      .enum(["text", "markdown", "html"])
      .default("markdown")
      .describe("The format to return the content in (text, markdown, or html). Defaults to markdown."),
    timeout: z.number().describe("Optional timeout in seconds (max 120)").optional(),
  }),
  async execute(params, ctx) {
    // Validate URL
    !params.url.startsWith("http://") && !params.url.startsWith("https://") && (() => { throw new Error("URL must start with http:// or https://") })()

    await ctx.ask({
      permission: "webfetch",
      patterns: [params.url],
      always: ["*"],
      metadata: {
        url: params.url,
        format: params.format,
        timeout: params.timeout,
      },
    })

    const timeout = Math.min((params.timeout ?? DEFAULT_TIMEOUT / 1000) * 1000, MAX_TIMEOUT)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // Build Accept header based on requested format with q parameters for fallbacks
    const acceptHeaders: Record<string, string> = {
      markdown: "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1",
      text: "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1",
      html: "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1",
      default: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    }
    const acceptHeader = acceptHeaders[params.format] || acceptHeaders.default

    const signal = AbortSignal.any([controller.signal, ctx.abort])
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      Accept: acceptHeader,
      "Accept-Language": "en-US,en;q=0.9",
    }
    const initial = await fetch(params.url, { signal, headers })

    // Retry with honest UA if blocked by Cloudflare bot detection (TLS fingerprint mismatch)
    const response =
      initial.status === 403 && initial.headers.get("cf-mitigated") === "challenge"
        ? await fetch(params.url, { signal, headers: { ...headers, "User-Agent": "opencode" } })
        : initial

    clearTimeout(timeoutId)

    !response.ok && (() => { throw new Error(`Request failed with status code: ${response.status}`) })()

    // Check content length
    const contentLength = response.headers.get("content-length")
    contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE && (() => { throw new Error("Response too large (exceeds 5MB limit)") })()

    const arrayBuffer = await response.arrayBuffer()
    arrayBuffer.byteLength > MAX_RESPONSE_SIZE && (() => { throw new Error("Response too large (exceeds 5MB limit)") })()

    const content = new TextDecoder().decode(arrayBuffer)
    const contentType = response.headers.get("content-type") || ""
    const title = `${params.url} (${contentType})`

    // Handle content based on requested format and actual content type
    return params.format === "markdown"
      ? {
          output: contentType.includes("text/html") ? convertHTMLToMarkdown(content) : content,
          title,
          metadata: {},
        }
      : params.format === "text"
      ? {
          output: contentType.includes("text/html") ? await extractTextFromHTML(content) : content,
          title,
          metadata: {},
        }
      : {
          output: content,
          title,
          metadata: {},
        }
  },
})

async function extractTextFromHTML(html: string) {
  const chunks: string[] = []
  const tags = ["script", "style", "noscript", "iframe", "object", "embed"]
  const stack: string[] = []

  const rewriter = new HTMLRewriter()
    .on(tags.join(", "), {
      element(element) {
        stack.push(element.tagName)
        element.onEndTag(() => {
          stack.pop()
        })
      },
    })
    .on("*", {
      text(input) {
        if (stack.length === 0) {
          chunks.push(input.text)
        }
      },
    })
    .transform(new Response(html))

  await rewriter.text()
  return chunks.join("").trim()
}

function convertHTMLToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })
  turndownService.remove(["script", "style", "meta", "link"])
  return turndownService.turndown(html)
}
