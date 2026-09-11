import { rtdb } from "./firebase"
import { ref, onValue, set } from "firebase/database"

const PEPPER = "nova-ai-memory-key-v1"
const DEFAULT_MEMORY = () => ({ name: "", rollup: [], createdAt: Date.now(), updatedAt: Date.now() })

function bufToB64(buf) {
  let bin = ""
  const bytes = new Uint8Array(buf)
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH))
  }
  return btoa(bin)
}

function b64ToBuf(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function deriveKey(uid, salt) {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(`${PEPPER}:${uid}`), "PBKDF2", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 50000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

export async function encryptMemory(uid, obj) {
  if (!crypto?.subtle) return null
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(uid, salt)
  const data = new TextEncoder().encode(JSON.stringify(obj))
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data)
  return {
    v: 1,
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    enc: bufToB64(cipher),
    updatedAt: Date.now()
  }
}

export async function decryptMemory(uid, doc) {
  if (!crypto?.subtle) return null
  if (!doc || !doc.enc || !doc.salt || !doc.iv) return null
  const salt = b64ToBuf(doc.salt)
  const iv = b64ToBuf(doc.iv)
  const key = await deriveKey(uid, salt)
  const cipher = b64ToBuf(doc.enc)
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher)
  const parsed = JSON.parse(new TextDecoder().decode(plain))
  return parsed && typeof parsed === "object" ? parsed : null
}

export function subscribeMemory(uid, cb) {
  const memRef = ref(rtdb, `users/${uid}/memory`)
  return onValue(memRef, async (snap) => {
    const raw = snap.val()
    if (!raw || !raw.enc) {
      cb(DEFAULT_MEMORY())
      return
    }
    let m = null
    try {
      m = await decryptMemory(uid, raw)
    } catch {}
    cb(m && typeof m === "object" ? { ...DEFAULT_MEMORY(), ...m } : DEFAULT_MEMORY())
  })
}

export async function saveMemory(uid, obj) {
  const doc = await encryptMemory(uid, obj)
  if (!doc) return
  await set(ref(rtdb, `users/${uid}/memory`), doc)
}

export const NAME_PATTERNS = [
  /\bmy name (?:is|'s)\s+([A-Za-z][A-Za-z'\- ]{1,24})/i,
  /\b(?:my name's|my name is)\s+([A-Za-z][A-Za-z'\- ]{1,24})/i,
  /\b(?:you can call me|please call me|people call me|just call me|u can call me|call me)\s+([A-Za-z][A-Za-z'\- ]{1,24})/i,
  /\bi(?:'| a)?m called\s+([A-Za-z][A-Za-z'\- ]{1,24})/i,
  /\byou(?: can| may)? call me\s+([A-Za-z][A-Za-z'\- ]{1,24})/i
]

export function extractName(text) {
  if (!text || typeof text !== "string") return null
  for (const re of NAME_PATTERNS) {
    const m = text.match(re)
    if (m && m[1]) {
      let name = m[1].trim().replace(/[.!?,;]+$/, "")
      const cut = name.match(/^(.*?)(?:\s+(?:is|are|and|because|please|can you|can|could|would|thanks|thank you|im? going to|want|need)\b.*)$/i)
      if (cut && cut[1]) name = cut[1].trim()
      const first = name.split(/[\s,]/)[0]
      const clean = (first || name).replace(/[^A-Za-z'\-]/g, "").trim()
      if (clean.length >= 2 && clean.length <= 20) return clean
    }
  }
  return null
}

export { DEFAULT_MEMORY }