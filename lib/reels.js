// Afisten dikey (1080x1920) Reels uretimi - hizli still + hafif kaydirma (zoompan yok)
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

const XFADES = new Set([
  'fade', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'circleopen', 'circleclose', 'dissolve', 'smoothleft', 'smoothright',
  'radial', 'fadeblack', 'fadewhite', 'zoomin',
])

const RENDER_TIMEOUT_MS = 90_000

export function presetPath(id) {
  const p = path.join(MUSIC_DIR, `${id}.mp3`)
  return fs.existsSync(p) ? p : null
}

export function renderReels({ posterPath, outPath, audioPath = null, duration = 6 }) {
  return renderMultiScene({ scenes: [{ posterPath, duration }], outPath, audioPath })
}

// Coklu sahne: afisleri xfade ile birlestir. zoompan kullanilmaz (Render 0.5 CPU'da dakikalar surer).
export function renderMultiScene({ scenes, transition = 'fade', transitionDur = 0.7, outPath, audioPath = null }) {
  return new Promise((resolve, reject) => {
    if (!scenes || !scenes.length) return reject(new Error('sahne yok'))
    const N = scenes.length
    const tDur = Math.max(0.2, Math.min(2, Number(transitionDur) || 0.7))
    const trans = XFADES.has(String(transition)) ? String(transition) : 'fade'
    const args = ['-y']
    scenes.forEach((s) => {
      const d = Math.max(1, Number(s.duration) || 3)
      args.push('-loop', '1', '-framerate', '25', '-t', String(d), '-i', s.posterPath)
    })
    if (audioPath) args.push('-i', audioPath)

    const parts = scenes.map((s, i) => {
      const d = Math.max(1, Number(s.duration) || 3)
      // %8 ken burns: crop kaydirma — zoompan'dan onlarca kat hizli
      return `[${i}:v]scale=1166:2074:force_original_aspect_ratio=increase,` +
        `crop=1080:1920:'min(iw-ow\\,(iw-ow)*t/${d})':'min(ih-oh\\,(ih-oh)*t/${d * 2})',` +
        `fps=25,setsar=1,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`
    })
    let lastLabel = 'v0'
    let cum = Math.max(1, Number(scenes[0].duration) || 3)
    for (let i = 1; i < N; i++) {
      const offset = Math.max(0.1, cum - tDur).toFixed(3)
      const out = `vx${i}`
      parts.push(`[${lastLabel}][v${i}]xfade=transition=${trans}:duration=${tDur}:offset=${offset}[${out}]`)
      cum = cum + (Math.max(1, Number(scenes[i].duration) || 3) - tDur)
      lastLabel = out
    }
    args.push('-filter_complex', parts.join(';'), '-map', `[${lastLabel}]`)
    if (audioPath) args.push('-map', `${N}:a`, '-c:a', 'aac', '-b:a', '128k', '-shortest')
    else args.push('-an')
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart', outPath)

    const ff = spawnFfmpeg(args)
    let err = ''
    let settled = false
    const finish = (fn) => (arg) => {
      if (settled) return
      settled = true
      clearTimeout(killer)
      fn(arg)
    }
    const killer = setTimeout(() => {
      try { ff.kill('SIGKILL') } catch (e) {}
      finish(reject)(new Error('Render zaman asimi (90sn). Daha az sahne veya sessiz deneyin.'))
    }, RENDER_TIMEOUT_MS)
    ff.stderr.on('data', (d) => { err += d.toString() })
    ff.on('error', finish((e) => reject(new Error('ffmpeg baslatilamadi: ' + e.message))))
    ff.on('close', finish((code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath)
      else reject(new Error('ffmpeg render hatasi (code ' + code + '): ' + err.slice(-400)))
    }))
  })
}
