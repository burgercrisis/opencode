import katex from "katex"
import { WorkerMessage, WorkerResponse, validateWorkerMessage, validateWorkerResponse, DEFAULT_MARKDOWN_CONFIG, validateHtmlContent } from "./marked-types"


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

  // Inline math: $...$ (efficient regex that avoids matching $$)
  const inlineMathRegex = /\$([^$\n\r]+?)\$/g
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



self.onmessage = async (e) => {
  // Type safety validation
  if (!validateWorkerMessage(e.data)) {
    console.error('Invalid worker message received:', e.data)
    return
  }

  const { id, type, html } = e.data

  if (type === "init") {
    // Worker initialized, ready to process requests
    self.postMessage({ id, type: "theme-initialized" })
    return
  }

  if (type === "enhance") {
    if (!html) {
      self.postMessage({ id, type: "error", error: "HTML content is required for enhancement" })
      return
    }

    // Get configuration from message or use defaults
    const config = e.data.config || DEFAULT_MARKDOWN_CONFIG

    // Validate HTML content size to prevent memory exhaustion
    if (html.length > config.maxHtmlSize) {
      self.postMessage({
        id,
        type: "error",
        error: `HTML content too large. Size: ${html.length} bytes, Maximum allowed: ${config.maxHtmlSize} bytes`
      })
      return
    }

    // Validate HTML content structure for security and safety
    const contentValidation = validateHtmlContent(html)
    if (!contentValidation.isValid) {
      self.postMessage({
        id,
        type: "error",
        error: contentValidation.error || 'HTML content validation failed'
      })
      return
    }

    try {
      const withMath = renderMathExpressions(html)
      // Worker only handles math rendering, syntax highlighting is done on main thread
      const response = { id, type: "enhanced" as const, html: withMath }
      self.postMessage(response)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message :
        typeof error === 'string' ? error :
          JSON.stringify(error)
      console.error('Worker enhancement failed:', errorMessage)
      self.postMessage({ id, type: "error" as const, error: errorMessage })
    }
  }
}
