import { Component } from "solid-js"

export type InitError = {
    name: string
    message: string
    stack?: string
}

export function ErrorPage(props: { error: InitError }) {
    return (
        <div class="flex flex-col items-center justify-center min-h-screen p-8">
            <div class="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
                <h1 class="text-2xl font-bold text-red-600 mb-4">Initialization Error</h1>
                <div class="space-y-2">
                    <p><strong>Error:</strong> {props.error.name}</p>
                    <p><strong>Message:</strong> {props.error.message}</p>
                    {props.error.stack && (
                        <details class="mt-4">
                            <summary class="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                                Stack Trace
                            </summary>
                            <pre class="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                                {props.error.stack}
                            </pre>
                        </details>
                    )}
                </div>
            </div>
        </div>
    )
}
