import { FileDiff } from "@pierre/diffs"
<<<<<<< HEAD
import { createEffect, createMemo, onCleanup, splitProps, createSignal } from "solid-js"
import { createDefaultOptions, type DiffProps, styleVariables } from "../pierre"
import { workerPool } from "../pierre/worker"
import { Spinner } from "./spinner"
import { Show } from "solid-js"

// Performance threshold for showing warnings
const LARGE_FILE_THRESHOLD = 10000
const CRITICAL_FILE_THRESHOLD = 50000
=======
import { createEffect, createMemo, onCleanup, splitProps } from "solid-js"
import { createDefaultOptions, type DiffProps, styleVariables } from "../pierre"
import { getWorkerPool } from "../pierre/worker"

// interface ThreadMetadata {
//   threadId: string
// }
//
//
>>>>>>> upstream/dev

export function Diff<T>(props: DiffProps<T>) {
  let container!: HTMLDivElement
  const [local, others] = splitProps(props, ["before", "after", "class", "classList", "annotations"])
<<<<<<< HEAD
  const [isRendering, setIsRendering] = createSignal(false)
=======
>>>>>>> upstream/dev

  const fileDiff = createMemo(
    () =>
      new FileDiff<T>(
        {
          ...createDefaultOptions(props.diffStyle),
          ...others,
        },
<<<<<<< HEAD
        workerPool,
      ),
  )

  const cleanupFunctions: Array<() => void> = []

  createEffect(() => {
    setIsRendering(true)

    try {
      container.innerHTML = ""
      fileDiff().render({
        oldFile: local.before,
        newFile: local.after,
        lineAnnotations: local.annotations,
        containerWrapper: container,
      })
    } finally {
      setIsRendering(false)
    }
  })

  onCleanup(() => {
    // Clean up FileDiff event handlers and dispose SolidJS components
    fileDiff()?.cleanUp()
    cleanupFunctions.forEach((dispose) => dispose())
  })

  return (
    <div data-component="diff" style={styleVariables}>
      <Show when={isRendering()}>
        <div class="flex items-center justify-center py-8 text-text-weaker">
          <Spinner class="mr-2" />
          Rendering diff...
        </div>
      </Show>
      <div ref={container} />
    </div>
  )
=======
        getWorkerPool(props.diffStyle),
      ),
  )

  createEffect(() => {
    const diff = fileDiff()
    container.innerHTML = ""
    diff.render({
      oldFile: local.before,
      newFile: local.after,
      lineAnnotations: local.annotations,
      containerWrapper: container,
    })

    onCleanup(() => {
      diff.cleanUp()
    })
  })

  return <div data-component="diff" style={styleVariables} ref={container} />
>>>>>>> upstream/dev
}
