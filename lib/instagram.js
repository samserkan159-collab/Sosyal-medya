// Instagram Reels yayinlama (Graph API container akisi: create -> poll -> publish)
const V = () => process.env.META_GRAPH_VERSION || 'v21.0'
const graph = () => `https://graph.facebook.com/${V()}`

export function igConfigured() {
  return !!process.env.IG_USER_ID && !!process.env.PAGE_ACCESS_TOKEN
}

export async function publishInstagramReel({ videoUrl, caption = '', igUserId, token }) {
  const uid = igUserId || process.env.IG_USER_ID
  const tok = token || process.env.PAGE_ACCESS_TOKEN
  if (!uid || !tok) throw new Error('IG_USER_ID / PAGE_ACCESS_TOKEN tanimli degil')

  // 1) media container olustur
  const create = await fetch(`${graph()}/${uid}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'REELS', video_url: videoUrl, caption, access_token: tok }),
  })
  const c = await create.json()
  if (!create.ok) throw new Error(c?.error?.message || 'IG container hatasi')
  const creationId = c.id

  // 2) isleme durumunu bekle (FINISHED)
  let status = 'IN_PROGRESS'
  let tries = 0
  while (tries < 20) {
    await new Promise((r) => setTimeout(r, 3000))
    const s = await fetch(`${graph()}/${creationId}?fields=status_code&access_token=${tok}`)
    const sd = await s.json()
    status = sd.status_code
    if (status === 'FINISHED') break
    if (status === 'ERROR') throw new Error('IG video isleme hatasi')
    tries++
  }
  if (status !== 'FINISHED') throw new Error('IG video islenemedi (zaman asimi)')

  // 3) yayinla
  const pub = await fetch(`${graph()}/${uid}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: tok }),
  })
  const p = await pub.json()
  if (!pub.ok) throw new Error(p?.error?.message || 'IG publish hatasi')
  return { id: p.id, creationId }
}
