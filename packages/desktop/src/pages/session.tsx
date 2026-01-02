import { ParentProps } from "solid-js"
import { Layout } from "./layout"
import { Diff } from "@opencode-ai/ui/diff"

export function SessionPage(props: ParentProps) {
    return (
        <Layout>
            <div class="flex flex-col h-full">
                <div class="flex-1 p-4">
                    <div class="mb-4">
                        <h2 class="text-xl font-semibold mb-2">Session with Pierre Diffs</h2>
                        <p class="text-text-weak-base">Rich diff visualization enabled</p>
                    </div>

                    <div class="bg-surface-raised-base rounded-lg border border-border-weak-base p-4">
                        <h3 class="text-lg font-medium mb-4">Sample Diff</h3>
                        <div class="space-y-4">
                            <Diff
                                before={`const oldFunction = () => {
  console.log("Hello World");
  return "old";
}`}
                                after={`const newFunction = () => {
  console.log("Hello Pierre Diffs!");
  return "new";
}`}
                                options={{
                                    theme: "github-dark",
                                    language: "typescript",
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    )
}
