import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { GoogleGenAI } from '@google/genai'
import { v4 as uuidv4 } from 'uuid'
import { spawnFfmpeg, spawnFfprobe } from '@/lib/ffmpeg'
import { probeDuration } from '@/lib/video'
import { extractJson } from '@/lib/ai'

const KEEP = 2
const TEXT_MODEL = process.env.AI_MODEL || 'gemini-3.8-flash'
const STT_MODEL = process.env.AI_STT_MODEL || 'gemini-3.5-transcribe'
const TTS_MODEL = process.env.AI_TTS_MODEL || 'gemini-3.1-flash-tts-preview'

function apiKey() {
  return process.env.GEMINI_API_KEY || ''
}

const LANGS = [
  { code: 'zh', name: 'Cince' }, { code: 'tr', name: 'Turkce' }, { code: 'en', name: 'Ingilizce' },
  { code: 'de', name: 'Almanca' }, { code: 'ar', name: 'Arapca' }, { code: 'fr', name: 'Fransizca' },
  { code: 'ru', name: 'Rusca' }, { code: 'ja', name: 'Japonca' }, { code: 'ko', name: 'Korece' },
  { code: 'es', name: 'Ispanyolca' }, { code: 'vi', name: 'Vietnamca' }, { code: 'fa', name: 'Farsca' },
]
const TARGETS = LANGS.map((l) => ({ ...l, english: l.name }))
const VOICES = [
  { id: 'Charon', name: 'Charon (Erkek, akici)', gender: 'male' },
  { id: 'Fenrir', name: 'Fenrir (Erkek, guclu)', gender: 'male' },
  { id: 'Puck', name: 'Puck (Erkek, canli)', gender: 'male' },
  { id: 'Orus', name: 'Orus (Erkek)', gender: 'male' },
  { id: 'Kore', name: 'Kore (Kadin)', gender: 'female' },
  { id: 'Aoede', name: 'Aoede (Kadin)', gender: 'female' },
]
const ALLOWED = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv'])

const running = new Set()

function rootDir() {
  const base = process.env.DATA_DIR || process.cwd()
  return path.join(base, 'dublaj')
}

function jobDir(id) {
  return path.join(rootDir(), id)
}

function indexPath() {
  return path.join(rootDir(), 'index.json')
}

function ensureRoot() {
  fs.mkdirSync(rootDir(), { recursive: true })
}

function client() {
  const key = apiKey()
  if (!key) throw new Error('GEMINI_API_KEY tanimli degil')
  return new GoogleGenAI({ apiKey: key })
}

export function dublajConfigured() {
  return !!apiKey()
}

function dbToAmp(db, fallback) {
  const n = Number(db)
  if (!Number.isFinite(n)) return fallback
  return Math.min(4, Math.max(0.05, Math.pow(10, n / 20)))
}

export function publicJob(job) {
  if (!job) return null
  const { source_path, ...rest } = job
  return rest
}

export function languages() {
  return { languages: LANGS, default: 'zh' }
}

export function targetLanguages() {
  return { languages: TARGETS, default: 'tr' }
}

export function voicesFor() {
  return { voices: VOICES, default: 'Charon' }
}

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(indexPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeIndex(map) {
  ensureRoot()
  fs.writeFileSync(indexPath(), JSON.stringify(map))
}

function saveJob(job) {
  const map = readIndex()
  map[job.id] = job
  writeIndex(map)
  return job
}

export function getJob(id) {
  return readIndex()[id] || null
}

export function listJobs() {
  const items = Object.values(readIndex())
  items.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  return items.map((j) => {
    const { segments, source_path, ...rest } = j
    return rest
  }).slice(0, 20)
}

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

export function deleteJob(id) {
  const map = readIndex()
  if (!map[id]) return false
  delete map[id]
  writeIndex(map)
  rmDir(jobDir(id))
  return true
}

function pruneKeepLast() {
  const map = readIndex()
  const done = Object.values(map)
    .filter((j) => j.status === 'done')
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  done.slice(KEEP).forEach((j) => {
    delete map[j.id]
    rmDir(jobDir(j.id))
  })
  writeIndex(map)
}

function ff(args, outPath) {
  return new Promise((resolve, reject) => {
    const p = spawnFfmpeg(args)
    let err = ''
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', (e) => reject(new Error('ffmpeg: ' + e.message)))
    p.on('close', (code) => {
      if (code === 0 && (!outPath || fs.existsSync(outPath))) resolve()
      else reject(new Error('ffmpeg ' + code + ' ' + err.slice(-280)))
    })
  })
}

function hasAudioStream(inputPath) {
  return new Promise((resolve) => {
    const p = spawnFfprobe(['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', inputPath])
    let out = ''
    p.stdout.on('data', (d) => { out += d.toString() })
    p.on('close', () => resolve(/audio/i.test(out)))
    p.on('error', () => resolve(false))
  })
}

function pcmToWav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

function textOf(response) {
  if (!response) return ''
  if (typeof response.text === 'string' && response.text) return response.text
  const parts = response?.candidates?.[0]?.content?.parts
  if (Array.isArray(parts)) return parts.map((p) => p?.text || '').join('')
  return ''
}

async function transcribeWav(wavPath, srcLang, tgtLang) {
  const buf = await fsp.readFile(wavPath)
  const prompt = `Bu ses bir HVAC/klima egitim videosu. Kaynak dil kodu: ${srcLang}. Hedef dil: ${tgtLang}.
Konusmayi zaman damgali satirlara bol. JSON disinda hicbir sey yazma:
{"segments":[{"id":1,"start":0,"end":2.5,"text_src":"kaynak dil","text_tr":"hedef dil cevirisi","keep":true}]}`
  const response = await client().models.generateContent({
    model: STT_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'audio/wav', data: buf.toString('base64') } },
          { text: prompt },
        ],
      },
    ],
  })
  const parsed = extractJson(textOf(response))
  const segs = Array.isArray(parsed?.segments) ? parsed.segments : []
  if (segs.length) {
    return segs.map((s, i) => ({
      id: Number(s.id) || i + 1,
      start: Math.max(0, Number(s.start) || 0),
      end: Math.max(Number(s.start) || 0, Number(s.end) || 0),
      text_src: String(s.text_src || ''),
      text_tr: String(s.text_tr || ''),
      keep: s.keep !== false,
    }))
  }
  const fallback = textOf(response).trim()
  const translated = await client().models.generateContent({
    model: TEXT_MODEL,
    contents: `Kaynak (${srcLang}) metni ${tgtLang} diline cevir. Sadece ceviri:\n${fallback}`,
  })
  return [{
    id: 1,
    start: 0,
    end: 0,
    text_src: fallback,
    text_tr: textOf(translated).trim(),
    keep: true,
  }]
}

async function ttsWav(text, voice, outPath) {
  const response = await client().models.generateContent({
    model: TTS_MODEL,
    contents: String(text || '').slice(0, 2000),
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Charon' } },
      },
    },
  })
  const part = response?.candidates?.[0]?.content?.parts?.[0]
  let data = part?.inlineData?.data
  if (!data) throw new Error('Gemini TTS bos dondu')
  if (typeof data === 'string') data = Buffer.from(data, 'base64')
  const mime = part?.inlineData?.mimeType || 'audio/L16;rate=24000'
  let rate = 24000
  const m = String(mime).match(/rate=(\d+)/)
  if (m) rate = Number(m[1]) || 24000
  await fsp.writeFile(outPath, pcmToWav(Buffer.from(data), rate))
}

function patchJob(id, patch) {
  const job = getJob(id)
  if (!job) return null
  Object.assign(job, patch, { updated_at: new Date().toISOString() })
  return saveJob(job)
}

async function runPrepare(id) {
  const job = getJob(id)
  if (!job) return
  const dir = jobDir(id)
  const src = job.source_path
  const wav = path.join(dir, 'audio.wav')
  try {
    running.add(id)
    patchJob(id, { status: 'running', stage: 'extract', progress: 10, message: 'Ses cikariliyor' })
    await ff(['-y', '-i', src, '-vn', '-ac', '1', '-ar', '16000', wav], wav)
    patchJob(id, { stage: 'transcribe', progress: 35, message: 'Yaziya dokuluyor (Gemini)' })
    let segs = await transcribeWav(wav, job.language, job.target_language)
    const dur = Number(job.duration) || 0
    if (segs.length === 1 && !segs[0].end && dur) segs[0].end = dur
    patchJob(id, {
      status: 'awaiting_review',
      stage: 'translate',
      progress: 65,
      message: 'Ceviri hazir — satirlari kontrol et',
      segments: segs,
    })
  } catch (e) {
    patchJob(id, { status: 'error', stage: 'error', error: e.message, message: e.message })
  } finally {
    running.delete(id)
  }
}

async function runFinish(id) {
  const job = getJob(id)
  if (!job) return
  const dir = jobDir(id)
  const src = job.source_path
  const voiceWav = path.join(dir, 'voice.wav')
  const out = path.join(dir, 'out.mp4')
  try {
    running.add(id)
    patchJob(id, { status: 'running', stage: 'tts', progress: 72, message: 'Seslendirme (Gemini TTS)' })
    const kept = (job.segments || []).filter((s) => s.keep !== false && String(s.text_tr || '').trim())
    const script = kept.map((s) => s.text_tr).join('. ')
    if (!script) throw new Error('Seslendirilecek satir yok')
    await ttsWav(script, job.voice, voiceWav)
    patchJob(id, { stage: 'mux', progress: 88, message: 'Video birlestiriliyor' })
    const music = job.audio_mode === 'dub_with_music'
    const origAudio = await hasAudioStream(src)
    const vVoice = dbToAmp(job.voice_db, 1)
    const vMusic = dbToAmp(job.music_db, 0.18)
    if (music && origAudio) {
      await ff([
        '-y', '-i', src, '-i', voiceWav,
        '-filter_complex', `[0:a]volume=${vMusic}[a0];[1:a]volume=${vVoice}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=0[a]`,
        '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-shortest',
        '-movflags', '+faststart', out,
      ], out)
    } else {
      await ff([
        '-y', '-i', src, '-i', voiceWav,
        '-filter_complex', `[1:a]volume=${vVoice}[a]`,
        '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-shortest',
        '-movflags', '+faststart', out,
      ], out)
    }
    patchJob(id, {
      status: 'done',
      stage: 'mux',
      progress: 100,
      message: 'Bitti — indir',
      output_url: `/api/dub/job/${id}/download`,
      error: null,
    })
    pruneKeepLast()
  } catch (e) {
    patchJob(id, { status: 'error', stage: 'error', error: e.message, message: e.message })
  } finally {
    running.delete(id)
  }
}

export async function createJobFromUpload({ file, filename, voice, language, target_language, audio_mode, voice_db, music_db }) {
  const ext = path.extname(filename || '').toLowerCase()
  if (!ALLOWED.has(ext)) throw new Error('Desteklenmeyen format')
  const id = uuidv4()
  const dir = jobDir(id)
  fs.mkdirSync(dir, { recursive: true })
  const source_path = path.join(dir, `source${ext}`)
  const buf = Buffer.from(await file.arrayBuffer())
  await fsp.writeFile(source_path, buf)
  let duration = 0
  try { duration = await probeDuration(source_path) } catch { /* ok */ }
  const now = new Date().toISOString()
  const job = saveJob({
    id,
    filename: filename || 'video.mp4',
    status: 'queued',
    stage: 'queued',
    progress: 1,
    message: 'Yuklendi',
    voice: voice || 'Charon',
    language: language || 'zh',
    target_language: target_language || 'tr',
    audio_mode: audio_mode === 'dub_only' ? 'dub_only' : 'dub_with_music',
    voice_db: Number(voice_db),
    music_db: Number(music_db),
    duration,
    segments: [],
    source_path,
    output_url: null,
    error: null,
    created_at: now,
    updated_at: now,
  })
  setTimeout(() => { runPrepare(id).catch(() => {}) }, 10)
  return job
}

export function updateSegments(id, edits) {
  const job = getJob(id)
  if (!job) throw new Error('Is bulunamadi')
  if (job.status !== 'awaiting_review') throw new Error('Satirlar yalnizca kontrol kapisinda duzenlenir')
  const byId = new Map((edits || []).map((e) => [e.id, e]))
  job.segments = (job.segments || []).map((seg) => {
    const ed = byId.get(seg.id)
    if (!ed) return seg
    return {
      ...seg,
      keep: ed.keep == null ? seg.keep : ed.keep,
      text_tr: ed.text_tr == null ? seg.text_tr : ed.text_tr,
      text_src: ed.text_src == null ? seg.text_src : ed.text_src,
      start: ed.start == null ? seg.start : Math.max(0, Number(ed.start)),
      end: ed.end == null ? seg.end : Math.max(seg.start, Number(ed.end)),
    }
  })
  return saveJob(job)
}

export function approveJob(id) {
  const job = getJob(id)
  if (!job) throw new Error('Is bulunamadi')
  if (job.status !== 'awaiting_review') throw new Error('Onay bekleyen is degil')
  patchJob(id, { status: 'running', stage: 'tts', progress: 70, message: 'Onaylandi — seslendirme' })
  setTimeout(() => { runFinish(id).catch(() => {}) }, 10)
  return getJob(id)
}

export function outputFile(id) {
  const p = path.join(jobDir(id), 'out.mp4')
  return fs.existsSync(p) ? p : null
}

export function sourceFile(id) {
  const job = getJob(id)
  if (job?.source_path && fs.existsSync(job.source_path)) return job.source_path
  return null
}
