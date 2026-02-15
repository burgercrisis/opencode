import katex from "katex"
import { bundledLanguages, type BundledLanguage, type BuiltinTheme } from "shiki"

interface WorkerMessage {
  type: "init" | "enhance"
  id: number
  html?: string
  theme?: any
}

interface WorkerResponse {
  id: number
  type: "enhanced" | "theme-initialized" | "error"
  html?: string
  error?: string
}

function renderMathInText(text: string): string {
  let result = text

  // Display math: $$...$$
  const displayMathRegex = /\$\$([\s\S]*?)\$\$/g
  result = result.replace(displayMathRegex, (_, math) => {
    try {
      return katex.renderToString(math, {
        displayMode: true,
        throwOnError: false,
      })
    } catch (error) {
      console.error("Math rendering failed:", error)
      return `$$${math}$$`
    }
  })

  // Inline math: $...$ (optimized regex without lookbehind)
  const inlineMathRegex = /\$([^$\n\r][^$\n\r]*?)\$/g
  result = result.replace(inlineMathRegex, (_, math) => {
    try {
      return katex.renderToString(math, {
        displayMode: false,
        throwOnError: false,
      })
    } catch (error) {
      console.error("Inline math rendering failed:", error)
      return `$${math}$`
    }
  })

  return result
}

function renderMathExpressions(html: string): string {
  const codeBlockPattern = /(<(?:pre|code|kbd)[^>]*>[\s\S]*?<\/(?:pre|code|kbd)>)/gi
  const parts = html.split(codeBlockPattern)

  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      return renderMathInText(part)
    })
    .join("")
}

async function highlightCodeBlocks(html: string): Promise<string> {
  const codeBlockRegex = /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g
  const matches = [...html.matchAll(codeBlockRegex)]
  if (matches.length === 0) return html

  // Worker only handles math rendering, syntax highlighting is done on main thread
  // Just return the HTML as-is to preserve code blocks
  return html
}


self.onmessage = async (e) => {
  // Type safety validation
  if (!e.data || typeof e.data !== 'object') {
    console.error('Invalid worker message received:', e.data)
    return
  }

  const { id, html, theme } = e.data as WorkerMessage

  if (typeof id !== 'number') {
    console.error('Invalid message ID:', id)
    return
  }

  if (e.data.type === "init") {
    // Worker initialized, ready to process requests
    self.postMessage({ id, type: "theme-initialized", html: "" })
    return
  }

  if (theme) {
    // Theme handling - currently not used but kept for future extensibility
    self.postMessage({ id, type: "theme-initialized", html: "" })
    return
  }

  if (e.data.type === "enhance") {
    if (typeof html !== 'string') {
      self.postMessage({ id, type: "error", error: "HTML content is required for enhancement" })
      return
    }

    try {
      const withMath = renderMathExpressions(html)
      const enhanced = await highlightCodeBlocks(withMath)
      self.postMessage({ id, type: "enhanced", html: enhanced })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      console.error('Worker enhancement failed:', errorMessage)
      self.postMessage({ id, type: "error", error: errorMessage })
    }
  }
}
