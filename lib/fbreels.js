// Facebook Page Reels yayinlama (yerel MP4) - Graph API 3 asamali akis
import fs from 'fs/promises'

const V = () => process.env.META_GRAPH_VERSION || 'v21.0'
const graph = () => `https://graph.facebook.com/${V()}`

export async function publishFacebookReel(filePath, description = '', pageId, token) {
  const pid = pageId || process.env.PAGE_ID
  const tok = token || process.env.PAGE_ACCESS_TOKEN
  if (!pid || !tok) throw new Error('PAGE_ID / PAGE_ACCESS_TOKEN tanimli degil')
  const bytes = await fs.readFile(filePath)

  // 1) start
  const startRes = await fetch(`${graph()}/${pid}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'start', access_token: tok }),
  })
  const start = await startRes.json()
  if (!startRes.ok) throw new Error(start?.error?.message || 'Reels start hatasi')

  // 2) upload bytes
  const upRes = await fetch(start.upload_url, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${tok}`,
      offset: '0',
      file_size: String(bytes.length),
      'Content-Type': 'application/octet-stream',
    },
    body: bytes,
  })
  const up = await upRes.json().catch(() => ({}))
  if (!upRes.ok) throw new Error(up?.error?.message || 'Reels upload hatasi')

  // 3) finish + publish
  const finish = new URL(`${graph()}/${pid}/video_reels`)
  finish.search = new URLSearchParams({
    access_token: tok,
    video_id: start.video_id,
    upload_phase: 'finish',
    video_state: 'PUBLISHED',
    description,
  }).toString()
  const finRes = await fetch(finish, { method: 'POST' })
  const fin = await finRes.json()
  if (!finRes.ok) throw new Error(fin?.error?.message || 'Reels finish hatasi')
  return { video_id: start.video_id, ...fin }
}
