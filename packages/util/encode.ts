// Encoding utilities for OpenCode
export function checksum(data: string | ArrayBuffer | Uint8Array): string {
    let str: string
    if (typeof data === 'string') {
        str = data
    } else {
        str = new TextDecoder().decode(data)
    }

    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(16)
}

export function base64Encode(data: string): string {
    return btoa(data)
}

export function base64Decode(data: string): string {
    return atob(data)
}
