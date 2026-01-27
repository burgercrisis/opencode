import { useContext, type ParentProps, createMemo } from "solid-js"
import { useShiki } from "@/context"
import { marked } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import { bundledLanguages, type BundledLanguage } from "shiki"
import { MarkedContext, type NativeMarkdownParser } from "@opencode-ai/ui/context/marked"

function init(highlighter: ReturnType<typeof useShiki>) {
  return marked.use(
    {
      renderer: {
        link({ href, title, text }) {
          const titleAttr = title ? ` title="${title}"` : ""
          return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
        },
      },
    },
    markedKatex({
      throwOnError: false,
    }),
    markedShiki({
        async highlight(code, lang) {
          if (!highlighter.ready()) {
            console.warn("[marked] shiki not ready, skipping highlight for", lang)
            return code
          }
          if (!(lang in bundledLanguages)) {
            lang = "text"
          }
          try {
            // Check if language is loaded. If not, load it asynchronously.
            // This is non-blocking for other parts of the app but will wait for this specific highlight.
            if (!highlighter.getLoadedLanguages().includes(lang)) {
              console.debug("[marked] loading shiki language", lang)
              await highlighter.loadLanguage(lang as BundledLanguage)
            }
            return highlighter.codeToHtml(code, {
              lang: lang || "text",
              theme: "opencode",
              tabindex: false,
            })
          } catch (e) {
            console.error("[marked] shiki highlight failed", { lang, error: e })
            return code
          }
        },
      }),
  )
}

export function MarkedProvider(props: ParentProps<{ nativeParser?: NativeMarkdownParser }>) {
  const highlighter = useShiki()
  const jsParser = init(highlighter)

  const value = createMemo(() => {
    if (props.nativeParser) {
      const nativeParser = props.nativeParser
      return {
        ...jsParser,
        async parse(markdown: string): Promise<string> {
          const html = await nativeParser(markdown)
          // Highlighting and math rendering are handled by the native parser or post-processing
          return html
        },
        parseSync(markdown: string): string {
          const result = jsParser.parse(markdown)
          if (typeof result !== "string") {
            console.warn(
              "[marked] parseSync returned a promise, likely due to async extensions. Falling back to empty string.",
            )
            return ""
          }
          return result
        },
      }
    }

    return {
      async parse(markdown: string): Promise<string> {
        return jsParser.parse(markdown)
      },
      parseSync(markdown: string): string {
        const result = jsParser.parse(markdown)
        if (typeof result !== "string") {
          console.warn(
            "[marked] parseSync returned a promise, likely due to async extensions. Falling back to empty string.",
          )
          return ""
        }
        return result
      },
    }
  })

  return <MarkedContext.Provider value={value()}>{props.children}</MarkedContext.Provider>
}



export function useMarked() {
  const value = useContext(MarkedContext)
  if (!value) {
    throw new Error("useMarked must be used within a MarkedProvider")
  }
  return value
}

