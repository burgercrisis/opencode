// Binary utilities for OpenCode
export const Binary = {
  toString: (buffer: ArrayBuffer | Uint8Array): string => {
    return new TextDecoder().decode(buffer)
  },

  fromString: (str: string): Uint8Array => {
    return new TextEncoder().encode(str)
  },

  search: <T, K>(list: T[], key: K, keyFn: (item: T) => K): { found: boolean; index: number } => {
    let low = 0
    let high = list.length - 1
    while (low <= high) {
      const mid = (low + high) >> 1
      const midKey = keyFn(list[mid])
      if (midKey === key) return { found: true, index: mid }
      if (midKey < key) low = mid + 1
      else high = mid - 1
    }
    return { found: false, index: low }
  },
}
