import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Identifier } from "@/id/id"
import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import z from "zod"

export namespace Question {
  const log = Log.create({ service: "question" })

  export const Option = z
    .object({
      label: z.string().max(30).describe("Display text (1-5 words, concise)"),
      description: z.string().describe("Explanation of choice"),
    })
    .meta({
      ref: "QuestionOption",
    })
  export type Option = z.infer<typeof Option>

  export const Info = z
    .object({
      question: z.string().describe("Complete question"),
      header: z.string().max(30).describe("Very short label (max 30 chars)"),
      options: z.array(Option).describe("Available choices"),
      multiple: z.boolean().optional().describe("Allow selecting multiple choices"),
      custom: z.boolean().optional().describe("Allow typing a custom answer (default: true)"),
    })
    .meta({
      ref: "QuestionInfo",
    })
  export type Info = z.infer<typeof Info>

  export const Request = z
    .object({
      id: Identifier.schema("question"),
      sessionID: Identifier.schema("session"),
      questions: z.array(Info).describe("Questions to ask"),
      tool: z
        .object({
          messageID: z.string(),
          callID: z.string(),
        })
        .optional(),
    })
    .meta({
      ref: "QuestionRequest",
    })
  export type Request = z.infer<typeof Request>

  export const Answer = z.array(z.string()).meta({
    ref: "QuestionAnswer",
  })
  export type Answer = z.infer<typeof Answer>

  export const Reply = z.object({
    answers: z
      .array(Answer)
      .describe("User answers in order of questions (each answer is an array of selected labels)"),
  })
  export type Reply = z.infer<typeof Reply>

  export const Event = {
    Asked: BusEvent.define("question.asked", Request),
    Replied: BusEvent.define(
      "question.replied",
      z.object({
        sessionID: z.string(),
        requestID: z.string(),
        answers: z.array(Answer),
      }),
    ),
    Rejected: BusEvent.define(
      "question.rejected",
      z.object({
        sessionID: z.string(),
        requestID: z.string(),
      }),
    ),
  }

  const state = Instance.state(async () => {
    const pending: Record<
      string,
      {
        info: Request
        resolve: (answers: Answer[]) => void
        reject: (e: any) => void
      }
    > = {}

    return {
      pending,
    }
  })

  export async function ask(input: {
    sessionID: string
    questions: Info[]
    tool?: { messageID: string; callID: string }
  }): Promise<Answer[]> {
    const s = await state()
    const id = Identifier.ascending("question")

    log.info("asking", { id, questions: input.questions.length })

    return new Promise<Answer[]>((resolve, reject) => {
      const info: Request = {
        id,
        sessionID: input.sessionID,
        questions: input.questions,
        tool: input.tool,
      }
      s.pending[id] = {
        info,
        resolve,
        reject,
      }
      Bus.publish(Event.Asked, info)
    })
  }

  export async function reply(input: { requestID: string; answers: Answer[] }): Promise<void> {
    const s = await state()
    const existing = s.pending[input.requestID]
    if (!existing) {
      log.warn("reply for unknown request", { requestID: input.requestID })
      return
    }
    delete s.pending[input.requestID]

    log.info("replied", { requestID: input.requestID, answers: input.answers })

    Bus.publish(Event.Replied, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
      answers: input.answers,
    })

    existing.resolve(input.answers)
  }

  export async function reject(requestID: string): Promise<void> {
    const s = await state()
    const existing = s.pending[requestID]
    if (!existing) {
      log.warn("reject for unknown request", { requestID })
      return
    }
    delete s.pending[requestID]

    log.info("rejected", { requestID })

    Bus.publish(Event.Rejected, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
    })

    existing.reject(new RejectedError())
  }

  export class RejectedError extends Error {
    constructor() {
      super("The user dismissed this question")
    }
  }

  export async function list() {
    return state().then((x) => Object.values(x.pending).map((x) => x.info))
  }
}

  const state = Instance.state(async () => {
    const pending: Record<
      string,
      {
        info: Request
        resolve: (answers: Answer[]) => void
        reject: (e: any) => void
      }
    > = {}

    return {
      pending,
    }
  })

  export async function ask(input: {
    sessionID: string
    questions: Info[]
    tool?: { messageID: string; callID: string }
  }): Promise<Answer[]> {
    const s = await state()
    const id = Identifier.ascending("question")

    log.info("asking", { id, questions: input.questions.length })

    return new Promise<Answer[]>((resolve, reject) => {
      const info: Request = {
        id,
        sessionID: input.sessionID,
        questions: input.questions,
        tool: input.tool,
      }
      s.pending[id] = {
        info,
        resolve,
        reject,
      }
      Bus.publish(Event.Asked, info)
    })
  }

  export async function reply(input: { requestID: string; answers: Answer[] }): Promise<void> {
    const s = await state()
    const existing = s.pending[input.requestID]
    if (!existing) {
      log.warn("reply for unknown request", { requestID: input.requestID })
      return
    }
    delete s.pending[input.requestID]

    log.info("replied", { requestID: input.requestID, answers: input.answers })

    Bus.publish(Event.Replied, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
      answers: input.answers,
    })

    existing.resolve(input.answers)
  }

  export async function reject(requestID: string): Promise<void> {
    const s = await state()
    const existing = s.pending[requestID]
    if (!existing) {
      log.warn("reject for unknown request", { requestID })
      return
    }
    delete s.pending[requestID]

    log.info("rejected", { requestID })

    Bus.publish(Event.Rejected, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
    })

    existing.reject(new RejectedError())
  }

  export class RejectedError extends Error {
    constructor() {
      super("The user dismissed this question")
    }
  }

  export async function list() {
    return state().then((x) => Object.values(x.pending).map((x) => x.info))
  }
=======
import z from "zod"
import { Identifier } from "../id/id"

export namespace Question {
  // Question types
  export const SelectOption = z.object({
    value: z.string(),
    label: z.string(),
    hint: z.string().optional(),
  })
  export type SelectOption = z.infer<typeof SelectOption>

  export const SelectQuestion = z.object({
    type: z.literal("select"),
    id: z.string(),
    message: z.string(),
    options: z.array(SelectOption),
    defaultValue: z.string().optional(),
  })
  export type SelectQuestion = z.infer<typeof SelectQuestion>

  export const MultiSelectQuestion = z.object({
    type: z.literal("multi-select"),
    id: z.string(),
    message: z.string(),
    options: z.array(SelectOption),
    defaultValue: z.array(z.string()).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  export type MultiSelectQuestion = z.infer<typeof MultiSelectQuestion>

  export const ConfirmQuestion = z.object({
    type: z.literal("confirm"),
    id: z.string(),
    message: z.string(),
    defaultValue: z.boolean().optional(),
  })
  export type ConfirmQuestion = z.infer<typeof ConfirmQuestion>

  export const TextQuestion = z.object({
    type: z.literal("text"),
    id: z.string(),
    message: z.string(),
    placeholder: z.string().optional(),
    defaultValue: z.string().optional(),
    validate: z.string().optional(), // regex pattern for validation
  })
  export type TextQuestion = z.infer<typeof TextQuestion>

  export const Item = z.discriminatedUnion("type", [SelectQuestion, MultiSelectQuestion, ConfirmQuestion, TextQuestion])
  export type Item = z.infer<typeof Item>

  // Answer types
  export const SelectAnswer = z.object({
    type: z.literal("select"),
    id: z.string(),
    value: z.string(),
  })
  export type SelectAnswer = z.infer<typeof SelectAnswer>

  export const MultiSelectAnswer = z.object({
    type: z.literal("multi-select"),
    id: z.string(),
    values: z.array(z.string()),
  })
  export type MultiSelectAnswer = z.infer<typeof MultiSelectAnswer>

  export const ConfirmAnswer = z.object({
    type: z.literal("confirm"),
    id: z.string(),
    value: z.boolean(),
  })
  export type ConfirmAnswer = z.infer<typeof ConfirmAnswer>

  export const TextAnswer = z.object({
    type: z.literal("text"),
    id: z.string(),
    value: z.string(),
  })
  export type TextAnswer = z.infer<typeof TextAnswer>

  export const Answer = z.discriminatedUnion("type", [SelectAnswer, MultiSelectAnswer, ConfirmAnswer, TextAnswer])
  export type Answer = z.infer<typeof Answer>

  // Request/Response schemas for TUI events
  export const Request = z.object({
    questionID: Identifier.schema("question"),
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message"),
    callID: z.string(),
    questions: z.array(Item),
    title: z.string().optional(),
    timeout: z.number().optional(), // timeout in ms
  })
  export type Request = z.infer<typeof Request>

  export const ResponseStatus = z.enum(["ok", "cancel", "timeout"])
  export type ResponseStatus = z.infer<typeof ResponseStatus>

  export const Response = z.object({
    questionID: Identifier.schema("question"),
    status: ResponseStatus,
    answers: z.array(Answer).optional(),
    comment: z.string().optional(),
  })
  export type Response = z.infer<typeof Response>
>>>>>>> 2d0af957f51fcfdc093c8ab6b5075c8c8fea5a2d
}
