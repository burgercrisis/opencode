import {
    type Message,
    type Agent,
    type Session,
    type Part,
    type Config,
    type Path,
    type Project,
    type FileDiff,
    type Todo,
    type SessionStatus,
    type ProviderListResponse,
    type ProviderAuthResponse,
    type Command,
    type McpStatus,
    type LspStatus,
    type VcsInfo,
    type Permission,
    createOpencodeClient,
} from "@opencode-ai/sdk/v2/client"
import { createStore, produce, reconcile } from "solid-js/store"
import { Binary } from "@opencode-ai/util/binary"
import { retry } from "@opencode-ai/util/retry"
import { useGlobalSDK } from "./global-sdk"
import { ErrorPage, type InitError } from "../pages/error"
import { batch, createContext, useContext, onMount, type ParentProps, Switch, Match } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { getFilename } from "@opencode-ai/util/path"

type State = {
    ready: boolean
    agent: Agent[]
    command: Command[]
    project: string
    provider: ProviderListResponse
    config: Config
    path: Path
    session: Session[]
    session_status: {
        [sessionID: string]: SessionStatus
    }
    session_diff: {
        [sessionID: string]: FileDiff[]
    }
    todo: {
        [sessionID: string]: Todo[]
    }
    permission: {
        [sessionID: string]: Permission[]
    }
}

const GlobalSyncContext = createContext<State>()

export function useGlobalSync() {
    return useContext(GlobalSyncContext)
}

export function GlobalSyncProvider(props: ParentProps) {
    const sdk = useGlobalSDK()
    const [state, setState] = createStore<State>({
        ready: false,
        agent: [],
        command: [],
        project: "",
        provider: { providers: [] },
        config: {} as Config,
        path: {} as Path,
        session: [],
        session_status: {},
        session_diff: {},
        todo: {},
        permission: {},
    })

    onMount(async () => {
        if (!sdk.client) return

        try {
            const agent = await sdk.client.agent.list()
            const command = await sdk.client.command.list()
            const project = await sdk.client.project.get()
            const provider = await sdk.client.provider.list()
            const config = await sdk.client.config.get()
            const path = await sdk.client.path.get()

            setState(
                produce((s) => {
                    s.agent = agent
                    s.command = command
                    s.project = project.name
                    s.provider = provider
                    s.config = config
                    s.path = path
                    s.ready = true
                })
            )
        } catch (error) {
            console.error("Failed to initialize global sync:", error)
        }
    })

    return (
        <GlobalSyncContext.Provider value={state}>
            {props.children}
        </GlobalSyncContext.Provider>
    )
}
