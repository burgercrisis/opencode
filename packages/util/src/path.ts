export function normalize(path: string | undefined) {
  if (!path) return ""

  const slashed = collapse(path.replace(/\\/g, "/"))

  if (slashed.startsWith("//?/UNC/")) return "//" + slashed.slice("//?/UNC/".length)
  if (slashed.startsWith("//?/")) return slashed.slice("//?/".length)

  if (slashed.startsWith("//./pipe/")) return slashed
  if (slashed.startsWith("//./")) {
    const root = slashed.slice("//./".length)
    if (/^[a-zA-Z]:\//.test(root)) return root
    return slashed
  }

  const msys = slashed.replace(/^\/(?:cygdrive\/)?([a-zA-Z])\//, (_, d) => `${d.toUpperCase()}:/`)
  const trimmed = msys.endsWith("/*") ? msys.slice(0, -2) + "/*" : msys
  return trimmed
}

function collapse(path: string) {
  if (!path.startsWith("//")) return path.replace(/\/{2,}/g, "/")
  const rest = path.slice(2).replace(/^\/+/, "")
  return "//" + rest.replace(/\/{2,}/g, "/")
}

export function getFilename(path: string | undefined) {
  if (!path) return ""
  const normalized = normalize(path)
  const trimmed = normalized.replace(/\/+$/, "")
  const parts = trimmed.split("/")
  return parts[parts.length - 1] ?? ""
}

export function getDirectory(path: string | undefined) {
  if (!path) return ""
  const normalized = normalize(path)
  const parts = normalized.split("/")
  return parts.slice(0, parts.length - 1).join("/") + "/"
}

export function getFileExtension(path: string | undefined) {
  if (!path) return ""
  const parts = path.split(".")
  return parts[parts.length - 1]
}

export function getFilenameTruncated(path: string | undefined, maxLength: number = 20) {
  const filename = getFilename(path)
  if (filename.length <= maxLength) return filename
  const lastDot = filename.lastIndexOf(".")
  const name = lastDot <= 0 ? filename : filename.slice(0, lastDot)
  const ext = lastDot <= 0 ? "" : filename.slice(lastDot)
  const available = maxLength - ext.length
  if (available <= 1) return truncateMiddle(filename, maxLength)
  return truncateMiddle(name, available) + ext
}

export function truncateMiddle(text: string, maxLength: number = 20) {
  if (text.length <= maxLength) return text
  const available = maxLength - 1 // -1 for ellipsis
  const start = Math.ceil(available / 2)
  const end = Math.floor(available / 2)
  return text.slice(0, start) + "…" + text.slice(-end)
}
