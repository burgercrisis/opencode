#!/usr/bin/env bun
import { $ } from "bun"
import fs from "fs"
import path from "path"

import { copyBinaryToSidecarFolder, getCurrentSidecar } from "./utils"

const sidecarConfig = getCurrentSidecar()

const dir = "src-tauri/target/opencode-binaries"

// Cross-platform directory creation
await fs.promises.mkdir(dir, { recursive: true });
await $`gh run download ${Bun.env.GITHUB_RUN_ID} -n opencode-cli`.cwd(dir)

await copyBinaryToSidecarFolder(
  `${dir}/${sidecarConfig.ocBinary}/bin/opencode${process.platform === "win32" ? ".exe" : ""}`,
)
