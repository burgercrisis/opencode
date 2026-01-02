import { createStore } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { batch, createMemo } from "solid-js"

interface PartBase {
    content: string
    start: number
    end: number
}

export interface TextPart extends PartBase {
    type: "text"
}

export interface FileAttachmentPart extends PartBase {
    type: "file"
    path: string
    selection?: any
}

export interface ImageAttachmentPart {
    type: "image"
    id: string
    filename: string
    mime: string
    dataUrl: string
}

export type ContentPart = TextPart | FileAttachmentPart | ImageAttachmentPart
export type Prompt = ContentPart[]

export const DEFAULT_PROMPT: Prompt = [{ type: "text", content: "", start: 0, end: 0 }]

export function isPromptEqual(promptA: Prompt, promptB: Prompt): boolean {
    if (promptA.length !== promptB.length) return false
    for (let i = 0; i < promptA.length; i++) {
        const partA = promptA[i]
        const partB = promptB[i]
        if (partA.type !== partB.type) return false
        if (partA.type === "text" && partA.content !== (partB as TextPart).content) {
            return false
        }
        if (partA.type === "file" && partA.path !== (partB as FileAttachmentPart).path) {
            return false
        }
        if (partA.type === "image" && partA.id !== (partB as ImageAttachmentPart).id) {
            return false
        }
    }
    return true
}

export const { use: usePrompt, provider: PromptProvider } = createSimpleContext({
    name: "Prompt",
    init: () => {
        const [store] = createStore<{
            prompts: Record<string, Prompt>
        }>({
            prompts: {},
        })

        return {
            prompts: store.prompts,
            getPrompt(key: string): Prompt {
                return store.prompts[key] || DEFAULT_PROMPT
            },
            setPrompt(key: string, prompt: Prompt) {
                store.prompts[key] = prompt
            },
            updatePrompt(key: string, updater: (prompt: Prompt) => Prompt) {
                const current = store.prompts[key] || DEFAULT_PROMPT
                store.prompts[key] = updater(current)
            },
            resetPrompt(key: string) {
                store.prompts[key] = DEFAULT_PROMPT
            },
        }
    },
})
