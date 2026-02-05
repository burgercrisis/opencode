// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

import { invoke } from "@tauri-apps/api/core"
import { type as ostype } from "@tauri-apps/plugin-os"
import { createSignal } from "solid-js"

const isTauri = () => !!(window as any).__TAURI_INTERNALS__

const getOsType = () => {
  if (!isTauri()) return undefined
  try {
    return ostype()
  } catch (e) {
    return undefined
  }
}

let OS_NAME: string | undefined
try {
  OS_NAME = getOsType()
} catch (e) {
  console.warn("Failed to get OS type in webview-zoom:", e)
}

const [webviewZoom, setWebviewZoom] = createSignal(1)

const MAX_ZOOM_LEVEL = 10
const MIN_ZOOM_LEVEL = 0.2

const clamp = (value: number) => Math.min(Math.max(value, MIN_ZOOM_LEVEL), MAX_ZOOM_LEVEL)

const applyZoom = (next: number) => {
  setWebviewZoom(next)
  if (isTauri()) {
    invoke("plugin:webview|set_webview_zoom", {
      value: next,
    }).catch(() => undefined)
  }
}

window.addEventListener("keydown", (event) => {
  if (!OS_NAME) {
    OS_NAME = getOsType()
  }
  if (!(OS_NAME === "macos" ? event.metaKey : event.ctrlKey)) return

  let newZoom = webviewZoom()

  if (event.key === "-") newZoom -= 0.2
  if (event.key === "=" || event.key === "+") newZoom += 0.2
  if (event.key === "0") newZoom = 1

  applyZoom(clamp(newZoom))
})

export { webviewZoom }
