import "@/index.css"
import { ErrorBoundary, Show, lazy, type ParentProps, Suspense } from "solid-js"
import { Router, Route, Navigate } from "@solidjs/router"
import { MetaProvider } from "@solidjs/meta"
import { Font } from "@opencode-ai/ui/font"
import { DiffComponentProvider } from "@opencode-ai/ui/context/diff"
import { CodeComponentProvider } from "@opencode-ai/ui/context/code"
import { I18nProvider } from "@opencode-ai/ui/context"
import { Diff } from "@opencode-ai/ui/diff"
import { ThemeProvider } from "@opencode-ai/ui/theme"
import {
  GlobalSyncProvider,
  PermissionProvider,
  LayoutProvider,
  GlobalSDKProvider,
  ServerProvider,
  useServer,
  SettingsProvider,
  TerminalProvider,
  PromptProvider,
  FileProvider,
  CommentsProvider,
  NotificationProvider,
  CommandProvider,
  LanguageProvider,
  useLanguage,
  ShikiProvider,
  MarkedProvider,
} from "@/context"
import { usePlatform } from "@/context/platform"
import { Logo } from "@opencode-ai/ui/logo"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { Code } from "@/components/code"
import Layout from "@/pages/layout"
import DirectoryLayout from "@/pages/directory-layout"
import { ErrorPage } from "./pages/error"
import { iife } from "@opencode-ai/util/iife"

const Home = lazy(() => import("@/pages/home"))
const Session = lazy(() => import("@/pages/session"))
const Loading = () => <div class="size-full" />

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.locale, t: language.t }}>{props.children}</I18nProvider>
}

declare global {
  interface Window {
    __OPENCODE__?: { updaterEnabled?: boolean; serverPassword?: string }
  }
}

export function AppBaseProviders(props: ParentProps) {
  return (
    <MetaProvider>
      <Font />
      <ShikiProvider>
        <ThemeProvider>
          <LanguageProvider>
            <UiI18nBridge>
              <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
                <DialogProvider>
                  <MarkedProvider>
                    <DiffComponentProvider component={Diff}>
                      <CodeComponentProvider component={Code}>{props.children}</CodeComponentProvider>
                    </DiffComponentProvider>
                  </MarkedProvider>
                </DialogProvider>
              </ErrorBoundary>
            </UiI18nBridge>
          </LanguageProvider>
        </ThemeProvider>
      </ShikiProvider>
    </MetaProvider>
  )
}

function ServerKey(props: ParentProps) {
  const server = useServer()
  return (
    <Show when={server.url} keyed>
      {props.children}
    </Show>
  )
}

export function AppInterface(props: { defaultUrl?: string }) {
  const defaultServerUrl = () => {
    if (props.defaultUrl) return props.defaultUrl
    if (location.hostname.includes("opencode.ai")) return "http://localhost:4096"
    if (import.meta.env.DEV)
      return `http://${import.meta.env.VITE_OPENCODE_SERVER_HOST ?? "localhost"}:${import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"}`

    return window.location.origin
  }

  return (
    <ServerProvider defaultUrl={defaultServerUrl()}>
      <ServerKey>
        <GlobalSDKProvider>
          <GlobalSyncProvider>
            <Router
              root={(props) => (
                <SettingsProvider>
                  <PermissionProvider>
                    <LayoutProvider>
                      <NotificationProvider>
                        <CommandProvider>
                          <Layout>{props.children}</Layout>
                        </CommandProvider>
                      </NotificationProvider>
                    </LayoutProvider>
                  </PermissionProvider>
                </SettingsProvider>
              )}
            >
              <Route
                path="/"
                component={() => (
                  <Suspense fallback={<Loading />}>
                    <Home />
                  </Suspense>
                )}
              />
              <Route path="/:dir" component={DirectoryLayout}>
                <Route path="/" component={() => <Navigate href="session" />} />
                <Route
                  path="/session/:id?"
                  component={(p) => (
                    <Show when={p.params.id ?? "new"}>
                      <TerminalProvider>
                        <FileProvider>
                          <PromptProvider>
                            <CommentsProvider>
                              <Suspense fallback={<Loading />}>
                                <Session />
                              </Suspense>
                            </CommentsProvider>
                          </PromptProvider>
                        </FileProvider>
                      </TerminalProvider>
                    </Show>
                  )}
                />
              </Route>
            </Router>
          </GlobalSyncProvider>
        </GlobalSDKProvider>
      </ServerKey>
    </ServerProvider>
  )
}
