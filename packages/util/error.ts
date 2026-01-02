import { z } from "zod"

export const NamedError = Object.assign(
  {
    create: <S extends z.ZodSchema>(name: string, schema?: S) => {
      return class extends Error {
        public data?: z.infer<S>

        constructor(data: z.infer<S>, message?: string)
        constructor(message: string, data?: z.infer<S>)
        constructor(arg1?: any, arg2?: any) {
          if (typeof arg1 === "string") {
            super(arg1)
            this.data = arg2
          } else {
            super(name)
            this.data = arg1
          }
          this.name = name
          if (this.data && schema) {
            this.data = schema.parse(this.data)
          }
        }

        static get Schema() {
          return z.object({
            name: z.string(),
            message: z.string(),
            data: schema || z.any().optional(),
          })
        }

        toObject() {
          return {
            name: this.name,
            message: this.message,
            data: this.data,
          }
        }

        static isInstance(error: any): error is any {
          return error instanceof Error && error.name === name
        }
      }
    },
  },
  {
    Unknown: class extends Error {
      public data?: { message: string }
      constructor(data: { message: string }, options?: { cause?: any }) {
        super(data.message, options)
        this.name = "UnknownError"
        this.data = data
      }
      static get Schema() {
        return z.object({
          name: z.string(),
          message: z.string(),
          data: z.object({ message: z.string() }),
        })
      }
      toObject() {
        return {
          name: this.name,
          message: this.message,
          data: this.data,
        }
      }
      static isInstance(error: any): error is any {
        return error instanceof Error && error.name === "UnknownError"
      }
    },
  },
)

export type NamedErrorInstance = {
  name: string
  message: string
  data: any
}
