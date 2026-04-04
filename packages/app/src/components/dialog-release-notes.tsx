import { createSignal } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { type Highlight } from "@/context/highlights"
import { Button } from "@opencode-ai/ui/button"
import { For, Show } from "solid-js"

export function DialogReleaseNotes(props: { highlights: Highlight[] }) {
  const language = useLanguage()
  const dialog = useDialog()
  const settings = useSettings()
  const [index, setIndex] = createSignal(0)

  const total = () => props.highlights.length
  const last = () => Math.max(0, total() - 1)
  const feature = () => props.highlights[index()] ?? props.highlights[last()]
  const isFirst = () => index() === 0
  const isLast = () => index() >= last()
  const paged = () => total() > 1

  function handleNext() {
    if (isLast()) return
    setIndex(index() + 1)
  }

  function handleClose() {
    dialog.close()
  }

  function handleDisable() {
    settings.general.setReleaseNotes(false)
    handleClose()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault()
      handleClose()
      return
    }
    if (!paged()) return
    if (e.key === "ArrowLeft" && !isFirst()) {
      e.preventDefault()
      setIndex(index() - 1)
    }
    if (e.key === "ArrowRight" && !isLast()) {
      e.preventDefault()
      setIndex(index() + 1)
    }
  }

  return (
    <Dialog
      title={language.t("dialog.releaseNotes.title")}
      size="large"
    >
      <div 
        class="flex flex-1 min-w-0 min-h-0" 
        tabIndex={0} 
        autofocus 
        onKeyDown={handleKeyDown}
      >
        {/* Left side - Text content */}
        <div class="flex flex-col flex-1 min-w-0 p-8">
          {/* Top section */}
          <div class="flex flex-col gap-2 pt-22">
            <div class="flex items-center gap-2">
              <h1 class="text-16-medium text-text-strong">{feature()?.title ?? ""}</h1>
            </div>
            <p class="text-14-regular text-text-base">{feature()?.description ?? ""}</p>
          </div>

          {/* Spacer */}
          <div class="flex-1" />

          {/* Bottom section - buttons and indicators */}
          <div class="flex flex-col gap-12">
            <div class="flex flex-col items-start gap-3">
              {isLast() ? (
                <Button variant="primary" size="large" onClick={handleClose}>
                  {language.t("dialog.releaseNotes.action.getStarted")}
                </Button>
              ) : (
                <Button variant="secondary" size="large" onClick={handleNext}>
                  {language.t("dialog.releaseNotes.action.next")}
                </Button>
              )}
              <Button variant="ghost" size="small" onClick={handleDisable}>
                {language.t("dialog.releaseNotes.action.hideFuture")}
              </Button>
            </div>

            {paged() && (
              <div class="flex items-center gap-1.5 -my-2.5">
                <For each={props.highlights}>
                  {(highlight, i) => (
                    <button
                      type="button"
                      class="h-6 flex items-center cursor-pointer bg-transparent border-none p-0 transition-all duration-200 rounded"
                      classList={{
                        "w-8": i() === index(),
                        "w-3": i() !== index(),
                      }}
                      onClick={() => setIndex(i())}
                    >
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
                                class="rounded border bg-muted h-6 w-6 object-cover"
                              />
                            }
                          >
                            <img
                              src={media().src}
                              alt={media().alt ?? highlight.title ?? language.t("dialog.releaseNotes.media.alt")}
                              class="rounded border bg-muted h-6 w-6 object-cover"
                            />
                          </Show>
                        )}
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            )}
          </div>
        </div>

        {/* Right side - Media content */}
        <Show when={feature()?.media}>
          <div class="flex-1 min-w-0 bg-surface-base overflow-hidden rounded-r-xl">
            <Show 
              when={feature()!.media!.type === "image"}
              fallback={
                <video 
                  src={feature()!.media!.src} 
                  autoplay 
                  loop 
                  muted 
                  playsinline 
                  class="w-full h-full object-cover"
                />
              }
            >
              <img
                src={feature()!.media!.src}
                alt={feature()!.media!.alt ?? feature()?.title ?? language.t("dialog.releaseNotes.media.alt")}
                class="w-full h-full object-cover"
              />
            </Show>
          </div>
        </Show>
      </div>
    </Dialog>
  )
}
