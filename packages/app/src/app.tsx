import "@/index.css"
import { File } from "@opencode-ai/ui/file"
import { Diff } from "@opencode-ai/ui/diff"
import { Code } from "@opencode-ai/ui/code"
import { I18nProvider } from "@opencode-ai/ui/context"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { DiffComponentProvider, CodeComponentProvider } from "@opencode-ai/ui/context"
import { Font } from "@opencode-ai/ui/font"
import { ThemeProvider } from "@opencode-ai/ui/theme"
import { MetaProvider } from "@solidjs/meta"
import { BaseRouterProps, Navigate, Route, Router } from "@solidjs/router"
import { Component, ErrorBoundary, type JSX, lazy, type ParentProps, Show, Suspense } from "solid-js"
import { CommandProvider } from "@/context/command"
import { CommentsProvider } from "@/context/comments"
import { FileProvider } from "@/context/file"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { GlobalSyncProvider } from "@/context/global-sync"
import { HighlightsProvider } from "@/context/highlights"
import { LanguageProvider, useLanguage } from "@/context/language"
import { LayoutProvider } from "@/context/layout"
import { ModelsProvider } from "@/context/models"
import { NotificationProvider } from "@/context/notification"
import { PermissionProvider } from "@/context/permission"
import { usePlatform } from "@/context/platform"
import { PromptProvider } from "@/context/prompt"
import { type ServerConnection, ServerProvider, useServer } from "@/context/server"
import { SettingsProvider } from "@/context/settings"
import { TerminalProvider } from "@/context/terminal"
import { Logo } from "@opencode-ai/ui/logo"
import DirectoryLayout from "@/pages/directory-layout"
import Layout from "@/pages/layout"
import { ErrorPage } from "./pages/error"
import { Dynamic } from "solid-js/web"

const Home = lazy(() => import("@/pages/home"))
const Session = lazy(() => import("@/pages/session"))
const Loading = () => <div class="size-full" />

const HomeRoute = () => (
  <Suspense fallback={<Loading />}>
    <Home />
  </Suspense>
)

const SessionRoute = () => (
  <SessionProviders>
    <Suspense fallback={<Loading />}>
      <Session />
    </Suspense>
  </SessionProviders>
)

const SessionIndexRoute = () => <Navigate href="session" />

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.locale, t: language.t }}>{props.children}</I18nProvider>
}

declare global {
  interface Window {
    __OPENCODE__?: {
      updaterEnabled?: boolean
      deepLinks?: string[]
      wsl?: boolean
    }
  }
}

function MarkedProviderWithNativeParser(props: ParentProps) {
  const platform = usePlatform()
  return <MarkedProvider nativeParser={platform.parseMarkdown}>{props.children}</MarkedProvider>
}

// BEST OF BOTH WORLDS: Keep AppProviders that wraps both base providers and interface
export function AppProviders(props: ParentProps<{
  defaultServer: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
}>) {
  return (
    <AppBaseProviders>
      <AppInterface defaultServer={props.defaultServer} servers={props.servers}>
        {props.children}
      </AppInterface>
    </AppBaseProviders>
  )
}

// BEST OF BOTH WORLDS: Keep AppShellProviders from incoming for better organization
function AppShellProviders(props: ParentProps) {
  return (
    <SettingsProvider>
      <PermissionProvider>
        <LayoutProvider>
          <NotificationProvider>
            <ModelsProvider>
              <CommandProvider>
                <HighlightsProvider>
                  <Layout>{props.children}</Layout>
                </HighlightsProvider>
              </CommandProvider>
            </ModelsProvider>
          </NotificationProvider>
        </LayoutProvider>
      </PermissionProvider>
    </SettingsProvider>
  )
}

// BEST OF BOTH WORLDS: Keep SessionProviders from incoming for session-specific context
function SessionProviders(props: ParentProps) {
  return (
    <TerminalProvider>
      <FileProvider>
        <PromptProvider>
          <CommentsProvider>{props.children}</CommentsProvider>
        </PromptProvider>
      </FileProvider>
    </TerminalProvider>
  )
}

// BEST OF BOTH WORLDS: Keep RouterRoot from incoming
function RouterRoot(props: ParentProps<{ appChildren?: JSX.Element }>) {
  return (
    <AppShellProviders>
      {props.appChildren}
      {props.children}
    </AppShellProviders>
  )
}

export function AppBaseProviders(props: ParentProps) {
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider>
        <LanguageProvider>
          <UiI18nBridge>
            <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
              <SettingsProvider>
                <DialogProvider>
                  <MarkedProviderWithNativeParser>
                    <DiffComponentProvider component={Diff}>
                      <CodeComponentProvider component={Code}>
                        <FileComponentProvider component={File}>{props.children}</FileComponentProvider>
                      </CodeComponentProvider>
                    </DiffComponentProvider>
                  </MarkedProviderWithNativeParser>
                </DialogProvider>
              </SettingsProvider>
            </ErrorBoundary>
          </UiI18nBridge>
        </LanguageProvider>
      </ThemeProvider>
    </MetaProvider>
  )
}

function ServerKey(props: ParentProps) {
  const server = useServer()
  return (
    <Show when={server.key} keyed>
      {props.children}
    </Show>
  )
}

export function AppInterface(props: {
  children?: JSX.Element
  defaultServer: ServerConnection.Key
  servers?: Array<ServerConnection.Any>
  router?: Component<BaseRouterProps>
}) {
  return (
    <ServerProvider defaultServer={props.defaultServer} servers={props.servers}>
      <ServerKey>
        <GlobalSDKProvider>
          <GlobalSyncProvider>
            <Router
              // BEST OF BOTH WORLDS: Keep inline router root from HEAD for flexibility
              root={(routerProps) => (
                <PermissionProvider>
                  <LayoutProvider>
                    <NotificationProvider>
                      <ModelsProvider>
                        <CommandProvider>
                          <HighlightsProvider>
                            <Layout>
                              {props.children}
                              {routerProps.children}
                            </Layout>
                          </HighlightsProvider>
                        </CommandProvider>
                      </ModelsProvider>
                    </NotificationProvider>
                  </LayoutProvider>
                </PermissionProvider>
              )}
            >
              <Route path="/" component={HomeRoute} />
              <Route path="/:dir" component={DirectoryLayout}>
                {/* BEST OF BOTH WORLDS: Keep both route approaches */}
                <Route path="/" component={() => <Navigate href="session" />} />
                <Route
                  path="/session/:id?"
                  component={(p) => (
                    <Show when={p.params.id ?? "new"}>
                      <FileProvider>
                        <TerminalProvider>
                          <PromptProvider>
                            <CommentsProvider>
                              <Suspense fallback={<Loading />}>
                                <Session />
                              </Suspense>
                            </CommentsProvider>
                          </PromptProvider>
                        </TerminalProvider>
                      </FileProvider>
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
