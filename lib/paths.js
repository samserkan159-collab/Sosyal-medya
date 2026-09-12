import fs from 'fs'

export const UPLOAD_DIR = '/app/uploads'
export const MUSIC_DIR = '/app/assets/music'

export function ensureDirs() {
  for (const d of [UPLOAD_DIR, MUSIC_DIR]) {
    try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) } catch (e) {}
  }
}

export function safeName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}
