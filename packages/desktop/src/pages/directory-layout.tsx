import { ParentProps } from "solid-js"
import { Layout } from "./layout"

export function DirectoryLayout(props: ParentProps) {
    return (
        <Layout>
            <div class="flex flex-col h-full">
                <div class="flex-1 p-4">
                    <div class="text-center text-text-weak-base py-8">
                        <h2 class="text-xl font-semibold mb-4">Directory View</h2>
                        <p>Directory layout with Pierre diffs integration</p>
                    </div>
                </div>
            </div>
        </Layout>
    )
}
