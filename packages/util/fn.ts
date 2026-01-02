import { z } from "zod"

export const fn = Object.assign(
  function <S extends z.ZodSchema, R>(schema: S, body: (arg: z.infer<S>) => Promise<R>) {
    return async (arg: z.infer<S>) => {
      const parsed = schema.parse(arg)
      return await body(parsed)
    }
  },
  {
    debounce: <T extends (...args: any[]) => any>(func: T, wait: number): T => {
      let timeout: any
      return ((...args: any[]) => {
        clearTimeout(timeout)
        timeout = setTimeout(() => func(...args), wait)
      }) as T
    },
    throttle: <T extends (...args: any[]) => any>(func: T, limit: number): T => {
      let inThrottle: boolean
      return ((...args: any[]) => {
        if (!inThrottle) {
          func(...args)
          inThrottle = true
          setTimeout(() => (inThrottle = false), limit)
        }
      }) as T
    },
  },
)
