import { createResource, Suspense } from "solid-js"
import style from "./content-code.module.css"

interface Props {
  code: string
  lang?: string
  flush?: boolean
}

export function ContentCode(props: Props) {
  const [html] = createResource(
    () => [props.code, props.lang],
    async ([code, lang]) => {
      const [{ codeToHtml, bundledLanguages }, { transformerNotationDiff }] = await Promise.all([
        import("shiki"),
        import("@shikijs/transformers"),
      ])

      return (await codeToHtml(code || "", {
        lang: lang && lang in bundledLanguages ? lang : "text",
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
        transformers: [transformerNotationDiff()],
      })) as string
    },
  )
  return (
    <Suspense>
      <div innerHTML={html()} class={style.root} data-flush={props.flush === true ? true : undefined} />
    </Suspense>
  )
}
