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
export function trimVideo({ inputPath, start, end, outPath }) {  return new Promise((resolve, reject) => {
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

// Genel ffmpeg calistirici
function runFfmpeg(args, outPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args)
    let err = ''
    ff.stderr.on('data', (d) => { err += d.toString() })
    ff.on('error', (e) => reject(new Error('ffmpeg baslatilamadi: ' + e.message)))
    ff.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath)
      else reject(new Error('ffmpeg hatasi (code ' + code + '): ' + err.slice(-300)))
    })
  })
}

// Video akis bilgisi: cozunurluk, fps, ses var mi, sure
export function probeVideoInfo(inputPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(inputPath)) return reject(new Error('video dosyasi bulunamadi'))
    const args = ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration', '-of', 'json', inputPath]
    const ff = spawn('ffprobe', args)
    let out = '', err = ''
    ff.stdout.on('data', (d) => { out += d.toString() })
    ff.stderr.on('data', (d) => { err += d.toString() })
    ff.on('error', (e) => reject(new Error('ffprobe baslatilamadi: ' + e.message)))
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffprobe hatasi: ' + err.slice(-200)))
      try {
        const j = JSON.parse(out)
        const streams = j.streams || []
        const v = streams.find((s) => s.codec_type === 'video')
        const hasAudio = streams.some((s) => s.codec_type === 'audio')
        if (!v) return reject(new Error('video akisi bulunamadi'))
        let width = Number(v.width) || 1080
        let height = Number(v.height) || 1920
        if (width % 2) width -= 1
        if (height % 2) height -= 1
        const fps = v.r_frame_rate && v.r_frame_rate !== '0/0' ? v.r_frame_rate : '25'
        const duration = parseFloat(j.format?.duration) || 0
        resolve({ width, height, fps, hasAudio, duration })
      } catch (e) { reject(new Error('ffprobe cikti ayristirilamadi')) }
    })
  })
}

// Afisi (PNG) videonun onune D saniyelik giris (intro) olarak ekle
export function prependPoster({ posterPath, videoPath, duration = 2, outPath, info }) {
  if (!fs.existsSync(posterPath)) return Promise.reject(new Error('afis dosyasi bulunamadi'))
  if (!fs.existsSync(videoPath)) return Promise.reject(new Error('video dosyasi bulunamadi'))
  const D = Math.max(0.5, Math.min(10, Number(duration) || 2))
  const W = info.width, H = info.height, FPS = info.fps, hasAudio = info.hasAudio
  const mainDur = info.duration || 60
  const sc = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS},format=yuv420p`

  const args = ['-y', '-loop', '1', '-t', String(D), '-i', posterPath, '-i', videoPath]
  // input2 = intro sessiz ses (her zaman)
  args.push('-f', 'lavfi', '-t', String(D), '-i', 'anullsrc=r=44100:cl=stereo')
  // input3 = ana video sessiz ses (yalnizca video sessizse)
  if (!hasAudio) args.push('-f', 'lavfi', '-t', String(mainDur), '-i', 'anullsrc=r=44100:cl=stereo')
  const mainAudio = hasAudio ? '[1:a]' : '[3:a]'
  const filter = `[0:v]${sc}[v0];[1:v]${sc}[v1];[v0][2:a][v1]${mainAudio}concat=n=2:v=1:a=1[v][a]`
  args.push('-filter_complex', filter, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outPath)
  return runFfmpeg(args, outPath)
}

// Belirli bir saniyeden tek kare (kapak/thumbnail) al -> PNG
export function extractThumbnail({ inputPath, time = 0, outPath }) {
  if (!fs.existsSync(inputPath)) return Promise.reject(new Error('video dosyasi bulunamadi'))
  const t = Math.max(0, Number(time) || 0)
  return runFfmpeg(['-y', '-ss', String(t), '-i', inputPath, '-frames:v', '1', '-q:v', '2', outPath], outPath)
}

// Videoyu dikey 9:16 (1080x1920) formata kirp (merkez crop)
export function toVertical({ inputPath, outPath }) {
  if (!fs.existsSync(inputPath)) return Promise.reject(new Error('video dosyasi bulunamadi'))
  return runFfmpeg([
    '-y', '-i', inputPath,
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', outPath,
  ], outPath)
}

// Videonun sesini kaldir
export function stripAudio({ inputPath, outPath }) {
  if (!fs.existsSync(inputPath)) return Promise.reject(new Error('video dosyasi bulunamadi'))
  return runFfmpeg(['-y', '-i', inputPath, '-c:v', 'copy', '-an', '-movflags', '+faststart', outPath], outPath)
}

// Videonun sesini verilen muzikle degistir (loop + shortest)
export function replaceAudio({ inputPath, audioPath, outPath }) {
  if (!fs.existsSync(inputPath)) return Promise.reject(new Error('video dosyasi bulunamadi'))
  if (!audioPath || !fs.existsSync(audioPath)) return Promise.reject(new Error('muzik dosyasi bulunamadi'))
  return runFfmpeg([
    '-y', '-i', inputPath, '-stream_loop', '-1', '-i', audioPath,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
    '-shortest', '-movflags', '+faststart', outPath,
  ], outPath)
}

