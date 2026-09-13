// Afisten 6 saniyelik dikey (1080x1920) Reels uretimi - FFmpeg Ken Burns zoom + opsiyonel muzik
import fs from 'fs'
import path from 'path'
import { MUSIC_DIR } from './paths'
import { spawnFfmpeg } from './ffmpeg'

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
  return renderMultiScene({ scenes: [{ posterPath, duration }], outPath, audioPath })
}

// Coklu sahne: birden fazla afisi secilen gecis efektiyle birlestir (xfade)
export function renderMultiScene({ scenes, transition = 'fade', transitionDur = 0.7, outPath, audioPath = null }) {
  return new Promise((resolve, reject) => {
    if (!scenes || !scenes.length) return reject(new Error('sahne yok'))
    const N = scenes.length
    const tDur = Math.max(0.2, Math.min(2, Number(transitionDur) || 0.7))
    const args = ['-y']
    scenes.forEach((s) => { args.push('-i', s.posterPath) })
    if (audioPath) args.push('-i', audioPath)

    const parts = []
    scenes.forEach((s, i) => {
      const frames = Math.round((s.duration || 3) * 25)
      parts.push(
        `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,` +
        `zoompan=z='min(zoom+0.0012,1.15)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25,setsar=1,format=yuv420p[v${i}]`
      )
    })
    let lastLabel = 'v0'
    let cum = scenes[0].duration || 3
    for (let i = 1; i < N; i++) {
      const offset = (cum - tDur).toFixed(3)
      const out = `vx${i}`
      parts.push(`[${lastLabel}][v${i}]xfade=transition=${transition}:duration=${tDur}:offset=${offset}[${out}]`)
      cum = cum + (scenes[i].duration || 3) - tDur
      lastLabel = out
    }
    const filter = parts.join(';')
    args.push('-filter_complex', filter, '-map', `[${lastLabel}]`)
    if (audioPath) args.push('-map', `${N}:a`, '-c:a', 'aac', '-b:a', '128k', '-shortest')
    else args.push('-an')
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25', '-preset', 'veryfast', outPath)

    const ff = spawnFfmpeg(args)
    let err = ''
    ff.stderr.on('data', (d) => { err += d.toString() })
    ff.on('error', (e) => reject(new Error('ffmpeg baslatilamadi: ' + e.message)))
    ff.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath)
      else reject(new Error('ffmpeg render hatasi (code ' + code + '): ' + err.slice(-400)))
    })
  })
}
