export function getFilename(path?: string) {
  if (!path) return ""
  const parts = path.split("/")
  return parts[parts.length - 1]
}

export function getDirectory(path?: string) {
  if (!path) return ""
  const parts = path.split("/")
  return parts.slice(0, parts.length - 1).join("/")
}

export function getFileExtension(path?: string) {
  if (!path) return ""
  const parts = path.split(".")
  return parts[parts.length - 1]
}
