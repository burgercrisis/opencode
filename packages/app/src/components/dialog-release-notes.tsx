import { Dialog } from "@opencode-ai/ui/dialog"
import { useLanguage } from "@/context/language"
import { type Highlight } from "@/context/highlights"
import { For, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"

export function DialogReleaseNotes(props: { highlights: Highlight[] }) {
  const language = useLanguage()
  const dialog = useDialog()

  return (
    <Dialog
      title={language.t("dialog.releaseNotes.title")}
      size="large"
    >
      <div class="flex flex-col gap-6 py-4">
        <For each={props.highlights}>
          {(highlight) => (
            <div class="flex flex-col gap-2">
              <h3 class="text-lg font-bold">{highlight.title}</h3>
              <p class="text-sm text-muted-foreground">{highlight.description}</p>
              <Show when={highlight.media}>
                {(media) => (
                  <Show
                    when={media().type === "image"}
                    fallback={
                      <video
                        src={media().src}
                        autoplay
                        loop
                        muted
                        playsinline
                        class="rounded-lg border bg-muted"
                      />
                    }
                  >
                    <img
                      src={media().src}
                      alt={media().alt}
                      class="rounded-lg border bg-muted"
                    />
                  </Show>
                )}
              </Show>
            </div>
          )}
        </For>
      </div>
      <div class="flex justify-end gap-2 pt-4 border-t">
        <Button onClick={() => dialog.close()}>
          {language.t("common.dismiss")}
        </Button>
      </div>
    </Dialog>
  )
}
