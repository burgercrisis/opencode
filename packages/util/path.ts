export function getFilename(input: string): string {
  const parts = input.split("/")
  return parts[parts.length - 1] || input
}

export function getDirectory(path: string): string {
  const parts = path.split("/")
  parts.pop()
  return parts.join("/") || "/"
}
