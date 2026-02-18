const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      // Cast to BufferSource to satisfy TS in strict DOM typings
      salt: salt as unknown as BufferSource,
      iterations: 120_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export type EncryptedPayload = {
  iv: string
  salt: string
  cipher: string
}

export async function encryptToLocalStorage(key: string, passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aesKey = await deriveKey(passphrase, salt)
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    TEXT_ENCODER.encode(key),
  )
  const payload: EncryptedPayload = {
    iv: btoa(String.fromCharCode(...new Uint8Array(iv))),
    salt: btoa(String.fromCharCode(...new Uint8Array(salt))),
    cipher: btoa(String.fromCharCode(...new Uint8Array(cipherBuf))),
  }
  localStorage.setItem('enc_api_key', JSON.stringify(payload))
}

export function hasEncryptedKey(): boolean {
  return !!localStorage.getItem('enc_api_key')
}

export async function decryptFromLocalStorage(passphrase: string): Promise<string | null> {
  const raw = localStorage.getItem('enc_api_key')
  if (!raw) return null
  try {
    const payload: EncryptedPayload = JSON.parse(raw)
    const salt = Uint8Array.from(atob(payload.salt), c => c.charCodeAt(0))
    const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0))
    const cipher = Uint8Array.from(atob(payload.cipher), c => c.charCodeAt(0))
    const aesKey = await deriveKey(passphrase, salt)
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      cipher,
    )
    return TEXT_DECODER.decode(plainBuf)
  } catch {
    return null
  }
}
