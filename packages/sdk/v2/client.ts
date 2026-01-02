import { createClient, createConfig } from "../js/src/v2/gen/client/index.js"
import type { Client, Config as ClientConfig } from "../js/src/v2/gen/client/types.gen.js"
import { OpencodeClient } from "../js/src/v2/gen/sdk.gen.js"

export * from "../js/src/v2/gen/types.gen.js"
export { OpencodeClient }

export type CreateOpencodeClientOptions = ClientConfig & {
  directory?: string
  key?: string
}

export function createOpencodeClient(config: CreateOpencodeClientOptions = {}) {
  const { directory, key, ...clientConfig } = config

  const client = createClient(createConfig(clientConfig)) as Client

  if (directory) {
    client.interceptors.request.use(async (request) => {
      const url = new URL(request.url)
      if (!url.pathname.startsWith("/global/") && !url.searchParams.has("directory")) {
        url.searchParams.set("directory", directory)
        return new Request(url.toString(), request)
      }
      return request
    })
  }

  return new OpencodeClient({ client, key })
}
