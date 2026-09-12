// Video kesme (trim) ve bolme (split) - FFmpeg tabanli
import { spawn } from 'child_process'
import fs from 'fs'

// Videonun suresini (saniye) ffprobe ile al
export function probeDuration(inputPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) return reject(new Error('video dosyasi bulunamadi'))
    const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath]
    const ff = spawn('ffprobe', args)
    let out = '', err = ''
    ff.stdout.on('data', (d) => { out += d.toString() })
    ff.stderr.on('data', (d) => { err += d.toString() })
    ff.on('error', (e) => reject(new Error('ffprobe baslatilamadi: ' + e.message)))
    ff.on('close', (code) => {
      const dur = parseFloat(String(out).trim())
      if (code === 0 && !isNaN(dur)) resolve(dur)
      else reject(new Error('sure okunamadi: ' + err.slice(-200)))
    })
  })
}

// start-end araligini kes (kare hassasiyetli, yeniden kodlar). start/end saniye.
export function trimVideo({ inputPath, start, end, outPath }) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) return reject(new Error('video dosyasi bulunamadi'))
    const s = Math.max(0, Number(start) || 0)
    const e = Number(end)
    if (!(e > s)) return reject(new Error('bitis, baslangictan buyuk olmali'))
    const args = [
      '-y', '-i', inputPath, '-ss', String(s), '-to', String(e),
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outPath,
    ]
    const ff = spawn('ffmpeg', args)
    let err = ''
    ff.stderr.on('data', (d) => { err += d.toString() })
    ff.on('error', (er) => reject(new Error('ffmpeg baslatilamadi: ' + er.message)))
    ff.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath)
      else reject(new Error('kesme hatasi (code ' + code + '): ' + err.slice(-300)))
    })
  })
}
