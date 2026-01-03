export async function GET() {
  const response = await fetch(
<<<<<<< HEAD
    "https://raw.githubusercontent.com/sst/opencode/refs/heads/dev/packages/sdk/openapi.json",
=======
    "https://raw.githubusercontent.com/anomalyco/opencode/refs/heads/dev/packages/sdk/openapi.json",
>>>>>>> upstream/dev
  )
  const json = await response.json()
  return json
}
