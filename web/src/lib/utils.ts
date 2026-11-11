export function checkRoomID(id: string | null): id is string {
  if (id == null) return false
  return typeof id === "string" && /^[A-Za-z0-9]{6}$/.test(id)
}

export function createRoomID() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let id = ""

  while (id.length < 6) {
    for (const byte of crypto.getRandomValues(new Uint8Array(8))) {
      if (byte < 248) id += alphabet[byte % alphabet.length]
      if (id.length === 6) break
    }
  }

  return id
}

export function cleanString(value: unknown) {
  if (typeof value !== "string") return ""
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32)
}

export function createVideoConstraints(facingMode: VideoFacingModeEnum, exact = false): MediaTrackConstraints {
  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: exact ? { exact: facingMode } : { ideal: facingMode },
  }
}

export function createCameraConstraints(deviceID = "", facingMode: VideoFacingModeEnum = "user"): MediaTrackConstraints {
  if (deviceID) {
    return {
      ...createVideoConstraints("user"),
      deviceId: { exact: deviceID },
    }
  } else {
    return createVideoConstraints(facingMode)
  }
}

export function createMicrophoneConstraints(deviceID = ""): MediaTrackConstraints {
  return {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: false,
    ...(deviceID ? { deviceId: { exact: deviceID } } : {}),
  }
}

export async function getUserMediaWithRetry(constraints: MediaStreamConstraints, relaxed: MediaStreamConstraints = constraints, retries = 1): Promise<MediaStream> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await navigator.mediaDevices.getUserMedia(attempt === 0 ? constraints : relaxed)
    } catch (error) {
      const name = asError(error).name
      if (attempt >= retries || !["AbortError", "NotReadableError", "OverconstrainedError"].includes(name)) {
        throw error
      }
      await new Promise<void>(resolve => setTimeout(resolve, 250))
    }
  }
}

export function getMediaErrorMsg(error: unknown): string {
  const issue = asError(error)
  if (issue.name === "NotAllowedError") return "Camera and microphone access is needed to join."
  if (issue.name === "NotFoundError") return "I couldn't find a camera or microphone on this device."
  if (issue.name === "NotReadableError" || issue.name === "AbortError") {
    return "The camera is busy. Close anything else using it and try again."
  }
  if (issue.name === "OverconstrainedError") return "Those camera settings aren't available. Try another camera."
  return issue.message || "Couldn't start the call."
}

export function getCameraErrorMsg(error: unknown): string {
  const issue = asError(error)
  if (issue.name === "NotFoundError" || issue.name === "OverconstrainedError") return "That camera isn't available."
  if (issue.name === "NotAllowedError") return "Camera access was denied."
  return "Couldn't switch cameras. The current camera is still selected."
}

export function getScreenShareErrorMsg(error: unknown): string {
  const issue = asError(error)
  if (issue.name === "NotAllowedError") return "Screen sharing wasn't allowed."
  return issue.message || "Couldn't start screen sharing."
}

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function roomFromInput(value: string): string {
  const match = value.trim().match(/(?:^|\/)([A-Za-z0-9]{6})\/?$/)
  return match ? match[1] : ""
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).map(word => Array.from(word)[0]).join("").slice(0, 2).toUpperCase() || "?"
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor(total / 60) % 60
  const s = String(total % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`
}

const TILE_COLORS = ["#1A2130", "#221B2A", "#1B2622", "#2A221B", "#1B2429", "#281B22"]

export function tileColor(key: string): string {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length]
}
