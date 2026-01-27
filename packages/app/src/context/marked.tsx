import { useContext, type ParentProps } from "solid-js"
import { useShiki } from "@/context"
import { marked } from "marked"
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
    markedShiki({
      async highlight(code, lang) {
        if (!(lang in bundledLanguages)) {
          lang = "text"
        }
        if (!highlighter.getLoadedLanguages().includes(lang)) {
          await highlighter.loadLanguage(lang as BundledLanguage)
        }
        return highlighter.codeToHtml(code, {
          lang: lang || "text",
          theme: "opencode",
          tabindex: false,
        })
      },
    }),
  )
}

export function MarkedProvider(props: ParentProps<{ nativeParser?: NativeMarkdownParser }>) {
  const highlighter = useShiki()
  const value = init(highlighter)

  if (props.nativeParser) {
    const nativeParser = props.nativeParser
    const decoratedValue = {
      ...value,
      async parse(markdown: string): Promise<string> {
        const html = await nativeParser(markdown)
        // Note: We're not doing math rendering here because katex is not a dependency of the app
        // but we can do highlighting if needed. For now, we'll just return the html
        // as the native parser usually handles highlighting itself.
        return html
      },
    }
    return <MarkedContext.Provider value={decoratedValue}>{props.children}</MarkedContext.Provider>
  }

  return <MarkedContext.Provider value={value}>{props.children}</MarkedContext.Provider>
}



export function useMarked() {
  const value = useContext(MarkedContext)
  if (!value) {
    throw new Error("useMarked must be used within a MarkedProvider")
  }
  return value
}

