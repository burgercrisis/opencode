import { createSimpleContext } from "@opencode-ai/ui/context"
import { createSignal } from "solid-js"

export function normalizeServerUrl(input: string) {
    const trimmed = input.trim()
    if (!trimmed) return
    const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
    const cleaned = withProtocol.replace(/\/+$/, "")
    return cleaned.replace(/^(https?:\/\/[^/]+).*/, "$1")
}

export function serverDisplayName(url: string) {
    if (!url) return ""
    return url
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "")
        .split("/")[0]
}

export const { use: useServer, provider: ServerProvider } = createSimpleContext({
    name: "Server",
    init: (props: { defaultUrl: string }) => {
        const [url, setUrl] = createSignal(props.defaultUrl)

        return {
            url: url(),
            setUrl,
            normalizeServerUrl,
            serverDisplayName,
            projects: {
                list: () => [],
                open: () => { },
                close: () => { },
                expand: () => { },
                collapse: () => { },
                move: () => { },
            }
        }
    },
})
