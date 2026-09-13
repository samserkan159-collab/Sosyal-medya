import { spawn } from 'child_process'

export function ffmpegBin() {
  return process.env.FFMPEG_PATH || 'ffmpeg'
}

export function ffprobeBin() {
  return process.env.FFPROBE_PATH || 'ffprobe'
}

export function spawnFfmpeg(args, opts) {
  return spawn(ffmpegBin(), args, opts)
}

export function spawnFfprobe(args, opts) {
  return spawn(ffprobeBin(), args, opts)
}
