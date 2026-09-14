import fs from 'fs'
import path from 'path'
import { UPLOAD_DIR } from '@/lib/paths'

export const KEEP_VIDEOS = 2

function unlinkQuiet(file) {
  if (!file) return
  const abs = path.isAbsolute(file) ? file : path.join(UPLOAD_DIR, file)
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs)
  } catch {
    /* ignore */
  }
}

export async function pruneOldVideos(database, keep = KEEP_VIDEOS) {
  if (!database) return { dropped: 0 }
  const specs = [
    { name: 'renders', fileKey: 'outFile' },
    { name: 'video_ai_jobs', fileKey: 'outFile' },
  ]
  let dropped = 0
  for (const spec of specs) {
    const done = await database
      .collection(spec.name)
      .find({ status: { $in: ['DONE', 'done'] }, [spec.fileKey]: { $nin: [null, ''] } })
      .sort({ createdAt: -1, updatedAt: -1 })
      .toArray()
    const extra = done.slice(keep)
    for (const doc of extra) {
      unlinkQuiet(doc[spec.fileKey])
      const q = doc.id ? { id: doc.id } : { _id: doc._id }
      await database.collection(spec.name).deleteOne(q)
      dropped += 1
    }
  }
  return { dropped, keep }
}
