import fs from 'fs'
import path from 'path'

// Render disk: DATA_DIR=/var/data  |  yerel: proje kökü
const dataRoot = process.env.DATA_DIR || process.cwd()

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(dataRoot, 'uploads')
export const MUSIC_DIR = process.env.MUSIC_DIR || path.join(process.cwd(), 'assets', 'music')

export function ensureDirs() {
  for (const d of [UPLOAD_DIR, MUSIC_DIR]) {
    try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) } catch (e) {}
  }
}

export function safeName(name) {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}
