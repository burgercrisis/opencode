import katex from "katex"
import { bundledLanguages, type BundledLanguage, type BuiltinTheme } from "shiki"

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
    } catch {
      return `$$${math}$$`
    }
  })

  // Inline math: $...$
  const inlineMathRegex = /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g
  result = result.replace(inlineMathRegex, (_, math) => {
    try {
      return katex.renderToString(math, {
        displayMode: false,
        throwOnError: false,
      })
    } catch {
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

// Theme will be passed from main thread
let resolvedTheme: any = null

self.onmessage = async (e) => {
  const { id, html, theme } = e.data
  if (e.data.type === "init") {
    // Worker initialized, ready to process requests
    self.postMessage({ id, type: "theme-initialized" })
    return
  }

  if (theme) {
    resolvedTheme = theme
    self.postMessage({ id, type: "theme-initialized" })
    return
  }

  if (e.data.type === "enhance") {
    try {
      const withMath = renderMathExpressions(html)
      const enhanced = await highlightCodeBlocks(withMath)
      self.postMessage({ id, type: "enhanced", html: enhanced })
    } catch (error) {
      self.postMessage({ id, type: "error", error: (error as Error).message })
    }
  }
}
