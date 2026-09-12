// Afisten 6 saniyelik dikey (1080x1920) Reels uretimi - FFmpeg Ken Burns zoom + opsiyonel muzik
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { MUSIC_DIR } from './paths'

export const PRESETS = [
  { id: 'enerjik', name: 'Enerjik' },
  { id: 'tekno', name: 'Tekno' },
  { id: 'sakin', name: 'Sakin' },
  { id: 'kurumsal', name: 'Kurumsal' },
]

export function presetPath(id) {
  const p = path.join(MUSIC_DIR, `${id}.mp3`)
  return fs.existsSync(p) ? p : null
}

// posterPath (PNG/JPG) -> outPath (mp4). audioPath null ise sessiz.
export function renderReels({ posterPath, outPath, audioPath = null, duration = 6 }) {
  return new Promise((resolve, reject) => {
    const frames = duration * 25
    const vf =
      `scale=1080:1920:force_original_aspect_ratio=increase,` +
      `crop=1080:1920,` +
      `zoompan=z='min(zoom+0.0012,1.15)':d=${frames}:` +
      `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25`

    const args = ['-y', '-loop', '1', '-i', posterPath]
    if (audioPath) args.push('-i', audioPath)
    args.push('-t', String(duration), '-vf', vf, '-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast')
    if (audioPath) {
      args.push('-c:a', 'aac', '-b:a', '128k', '-map', '0:v:0', '-map', '1:a:0', '-shortest')
    } else {
      args.push('-an')
    }
    args.push(outPath)

    const ff = spawn('ffmpeg', args)
    let err = ''
    ff.stderr.on('data', (d) => { err += d.toString() })
    ff.on('error', (e) => reject(new Error('ffmpeg baslatilamadi: ' + e.message)))
    ff.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath)
      else reject(new Error('ffmpeg render hatasi (code ' + code + '): ' + err.slice(-400)))
    })
  })
}
