import type { WorkerPoolManager } from "@pierre/diffs/worker"
import { createSimpleContext } from "./helper"

<<<<<<< HEAD
const ctx = createSimpleContext<WorkerPoolManager | undefined, { pool: WorkerPoolManager | undefined }>({
  name: "WorkerPool",
  init: (props) => props.pool,
})

export const WorkerPoolProvider = ctx.provider
export const useWorkerPool = ctx.use
=======
export type WorkerPools = {
  unified: WorkerPoolManager | undefined
  split: WorkerPoolManager | undefined
}

const ctx = createSimpleContext<WorkerPools, { pools: WorkerPools }>({
  name: "WorkerPool",
  init: (props) => props.pools,
})

export const WorkerPoolProvider = ctx.provider

export function useWorkerPool(diffStyle: "unified" | "split" | undefined) {
  const pools = ctx.use()
  if (diffStyle === "split") return pools.split
  return pools.unified
}
>>>>>>> upstream/dev
