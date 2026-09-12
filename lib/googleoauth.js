// Google OAuth2 (YouTube kanal baglama: Shorts yukleme + yorum yaniti)
import fs from 'fs/promises'

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
]

function need(name) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} tanimli degil (.env)`) 
  return v
}

export function googleConfigured() {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
}

export function redirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_BASE_URL}/api/oauth/google/callback`
}

export function authorizeUrl(state) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.search = new URLSearchParams({
    client_id: need('GOOGLE_CLIENT_ID'),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: state || 'cockpit',
  }).toString()
  return u.toString()
}

export async function exchangeCode(code) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: need('GOOGLE_CLIENT_ID'),
      client_secret: need('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data?.error_description || data?.error || 'Token degisimi basarisiz')
  return data
}

export async function refreshAccessToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: need('GOOGLE_CLIENT_ID'),
      client_secret: need('GOOGLE_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data?.error_description || data?.error || 'Token yenileme basarisiz')
  return data
}

// db'den saklanan token'i alir, gerekiyorsa yeniler. Yoksa null.
export async function getValidAccessToken(database) {
  const doc = await database.collection('oauth_tokens').findOne({ id: 'youtube' })
  if (!doc) return null
  const now = Date.now()
  if (doc.accessToken && doc.expiresAt && new Date(doc.expiresAt).getTime() > now + 60000) {
    return doc.accessToken
  }
  if (!doc.refreshToken) return doc.accessToken || null
  const fresh = await refreshAccessToken(doc.refreshToken)
  const expiresAt = new Date(now + (fresh.expires_in || 3600) * 1000)
  await database.collection('oauth_tokens').updateOne(
    { id: 'youtube' },
    { $set: { accessToken: fresh.access_token, expiresAt, updatedAt: new Date() } }
  )
  return fresh.access_token
}

export async function uploadShort(accessToken, filePath, title, description = '') {
  const bytes = await fs.readFile(filePath)
  const metadata = {
    snippet: { title: title || 'Reels', description, categoryId: '22' },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  }
  const start = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': String(bytes.length),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    }
  )
  if (!start.ok) {
    const t = await start.text().catch(() => '')
    throw new Error('YouTube upload start hatasi: ' + t.slice(0, 200))
  }
  const uploadUrl = start.headers.get('location')
  if (!uploadUrl) throw new Error('YouTube resumable Location donmedi')
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) },
    body: bytes,
  })
  const data = await put.json()
  if (!put.ok) throw new Error(data?.error?.message || 'YouTube upload PUT hatasi')
  return data
}

export async function replyComment(accessToken, parentId, text) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { parentId, textOriginal: text } }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data?.error?.message || 'YouTube yorum yaniti hatasi')
  return data
}
