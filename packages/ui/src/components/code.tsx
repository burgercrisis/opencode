// Basic Code component for UI package
// This provides a simple code display component
import { Component } from "solid-js"

export interface CodeProps {
    class?: string
    classList?: Record<string, boolean | undefined>
    children?: string
}

export function Code(props: CodeProps) {
    return (
        <pre class={`code-component ${props.class || ''}`} classList={props.classList}>
            <code>{props.children}</code>
        </pre>
    )
}
