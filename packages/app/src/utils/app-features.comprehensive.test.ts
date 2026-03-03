import { describe, expect, test } from "bun:test"
import { createScrollSpy, pickOffsetId, pickVisibleId } from "../pages/session/scroll-spy"
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
import { applyOptimisticAdd, applyOptimisticRemove } from "../context/sync"

// Mock DOMRect for scroll spy tests
const rect = (top: number, height = 80): DOMRect =>
  ({
    x: 0,
    y: top,
    top,
    left: 0,
    right: 800,
    bottom: top + height,
    width: 800,
    height,
    toJSON: () => ({}),
  }) as DOMRect

const setRect = (el: Element, top: number, height = 80) => {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => rect(top, height),
  })
}

// Mock message and part factories
const userMessage = (id: string, sessionID: string): Message => ({
  id,
  sessionID,
  role: "user",
  time: { created: 1 },
  agent: "assistant",
  model: { providerID: "openai", modelID: "gpt" },
})

const textPart = (id: string, sessionID: string, messageID: string): Part => ({
  id,
  sessionID,
  messageID,
  type: "text",
  text: id,
})

describe("app features", () => {
  describe("scroll spy utilities", () => {
    test("pickVisibleId prefers higher intersection ratio", () => {
      const id = pickVisibleId(
        [
          { id: "a", ratio: 0.2, top: 100 },
          { id: "b", ratio: 0.8, top: 300 },
        ],
        120,
      )

      expect(id).toBe("b")
    })

    test("pickVisibleId breaks ratio ties by nearest line", () => {
      const id = pickVisibleId(
        [
          { id: "a", ratio: 0.5, top: 90 },
          { id: "b", ratio: 0.5, top: 140 },
        ],
        130,
      )

      expect(id).toBe("b")
    })

    test("pickVisibleId handles empty candidates", () => {
      const id = pickVisibleId([], 100)
      expect(id).toBeUndefined()
    })

    test("pickVisibleId handles single candidate", () => {
      const id = pickVisibleId(
        [{ id: "only", ratio: 0.3, top: 50 }],
        100
      )
      expect(id).toBe("only")
    })

    test("pickVisibleId handles zero ratio", () => {
      const id = pickVisibleId(
        [
          { id: "a", ratio: 0, top: 100 },
          { id: "b", ratio: 0, top: 200 },
        ],
        150,
      )
      expect(id).toBeUndefined()
    })

    test("pickOffsetId finds closest visible element", () => {
      const id = pickOffsetId(
        [
          { id: "a", top: 90 },
          { id: "b", top: 110 },
          { id: "c", top: 150 },
        ],
        120,
      )

      expect(id).toBe("b")
    })

    test("pickOffsetId handles empty candidates", () => {
      const id = pickOffsetId([], 100)
      expect(id).toBeUndefined()
    })

    test("pickOffsetId handles exact matches", () => {
      const id = pickOffsetId(
        [
          { id: "a", top: 100 },
          { id: "b", top: 120 },
        ],
        120,
      )

      expect(id).toBe("b")
    })

    test("createScrollSpy handles basic functionality", () => {
      const elements = [
        { id: "a", getBoundingClientRect: () => rect(100, 80) },
        { id: "b", getBoundingClientRect: () => rect(200, 80) },
      ] as Element[]

      const spy = createScrollSpy(elements, { threshold: 0.5 })
      const visible = spy.getVisible(150, 300)

      expect(visible).toHaveLength(1)
      expect(visible[0].id).toBe("b")
    })

    test("createScrollSpy handles threshold", () => {
      const elements = [
        { id: "a", getBoundingClientRect: () => rect(100, 40) }, // 40px height, threshold 0.5 = 20px
        { id: "b", getBoundingClientRect: () => rect(200, 80) },
      ] as Element[]

      const spy = createScrollSpy(elements, { threshold: 0.5 })
      const visible = spy.getVisible(90, 110)

      expect(visible).toHaveLength(0) // "a" not visible due to threshold
    })
  })

  describe("sync optimistic reducers", () => {
    test("applyOptimisticAdd inserts message in sorted order and stores parts", () => {
      const sessionID = "ses_1"
      const draft = {
        message: { [sessionID]: [userMessage("msg_2", sessionID)] },
        part: {} as Record<string, Part[] | undefined>,
      }

      applyOptimisticAdd(draft, {
        sessionID,
        message: userMessage("msg_1", sessionID),
        parts: [textPart("prt_2", sessionID, "msg_1"), textPart("prt_1", sessionID, "msg_1")],
      })

      expect(draft.message[sessionID]?.map((x) => x.id)).toEqual(["msg_1", "msg_2"])
      expect(draft.part.msg_1?.map((x) => x.id)).toEqual(["prt_1", "prt_2"])
    })

    test("applyOptimisticRemove removes message and part entries", () => {
      const sessionID = "ses_1"
      const draft = {
        message: { [sessionID]: [userMessage("msg_1", sessionID), userMessage("msg_2", sessionID)] },
        part: {
          msg_1: [textPart("prt_1", sessionID, "msg_1")],
          msg_2: [textPart("prt_2", sessionID, "msg_2")],
        } as Record<string, Part[] | undefined>,
      }

      applyOptimisticRemove(draft, { sessionID, messageID: "msg_1" })

      expect(draft.message[sessionID]?.map((x) => x.id)).toEqual(["msg_2"])
      expect(draft.part.msg_1).toBeUndefined()
      expect(draft.part.msg_2?.map((x) => x.id)).toEqual(["prt_2"])
    })

    test("applyOptimisticAdd handles empty parts array", () => {
      const sessionID = "ses_1"
      const draft = {
        message: {},
        part: {} as Record<string, Part[] | undefined>,
      }

      applyOptimisticAdd(draft, {
        sessionID,
        message: userMessage("msg_1", sessionID),
        parts: [],
      })

      expect(draft.message[sessionID]?.map((x) => x.id)).toEqual(["msg_1"])
      expect(draft.part).toEqual({})
    })

    test("applyOptimisticAdd handles multiple sessions", () => {
      const draft = {
        message: {
          "ses_1": [userMessage("msg_1", "ses_1")],
          "ses_2": [userMessage("msg_2", "ses_2")],
        },
        part: {} as Record<string, Part[] | undefined>,
      }

      applyOptimisticAdd(draft, {
        sessionID: "ses_1",
        message: userMessage("msg_3", "ses_1"),
        parts: [textPart("prt_1", "ses_1", "msg_3")],
      })

      expect(draft.message["ses_1"]?.map((x) => x.id)).toEqual(["msg_1", "msg_3"])
      expect(draft.message["ses_2"]?.map((x) => x.id)).toEqual(["msg_2"])
      expect(draft.part.msg_3?.map((x) => x.id)).toEqual(["prt_1"])
    })

    test("applyOptimisticRemove handles non-existent message", () => {
      const sessionID = "ses_1"
      const draft = {
        message: { [sessionID]: [userMessage("msg_1", sessionID)] },
        part: { msg_1: [textPart("prt_1", sessionID, "msg_1")] },
      } as Record<string, Part[] | undefined>,

      applyOptimisticRemove(draft, { sessionID, messageID: "non-existent" })

      expect(draft.message[sessionID]?.map((x) => x.id)).toEqual(["msg_1"])
      expect(draft.part.msg_1?.map((x) => x.id)).toEqual(["prt_1"])
    })

    test("applyOptimisticRemove handles empty parts", () => {
      const sessionID = "ses_1"
      const draft = {
        message: { [sessionID]: [userMessage("msg_1", sessionID)] },
        part: {} as Record<string, Part[] | undefined>,
      }

      applyOptimisticRemove(draft, { sessionID, messageID: "msg_1" })

      expect(draft.message[sessionID]).toEqual([])
      expect(draft.part).toEqual({})
    })

    test("applyOptimisticAdd preserves existing parts", () => {
      const sessionID = "ses_1"
      const draft = {
        message: { [sessionID]: [userMessage("msg_1", sessionID)] },
        part: { msg_1: [textPart("prt_existing", sessionID, "msg_1")] },
      } as Record<string, Part[] | undefined>,

      applyOptimisticAdd(draft, {
        sessionID,
        message: userMessage("msg_2", sessionID),
        parts: [textPart("prt_new", sessionID, "msg_2")],
      })

      expect(draft.message[sessionID]?.map((x) => x.id)).toEqual(["msg_1", "msg_2"])
      expect(draft.part.msg_1?.map((x) => x.id)).toEqual(["prt_existing"])
      expect(draft.part.msg_2?.map((x) => x.id)).toEqual(["prt_new"])
    })
  })
})
