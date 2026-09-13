// YouTube Data API v3 istemcisi (gercek HTTP cagrilari)
// API key => sadece OKUMA (yorum tarama). Yanit/yukleme => OAuth2 access token gerekir.
const API = 'https://www.googleapis.com/youtube/v3'

export function youtubeConfigured() {
  return !!process.env.YOUTUBE_API_KEY
}
export function youtubeChannelId() {
  return process.env.YOUTUBE_CHANNEL_ID || ''
}
export function youtubeOAuthToken() {
  return process.env.YOUTUBE_OAUTH_ACCESS_TOKEN || ''
}

function apiKey() {
  const k = process.env.YOUTUBE_API_KEY
  if (!k) throw new Error('YOUTUBE_API_KEY tanimli degil')
  return k
}

export async function ytGet(resource, params) {
  const url = new URL(`${API}/${resource}`)
  Object.entries({ ...params, key: apiKey() }).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data?.error?.message || `YouTube API hatasi (${res.status})`)
  return data
}

export async function ytPost(resource, params, accessToken, body) {
  const url = new URL(`${API}/${resource}`)
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data?.error?.message || `YouTube API hatasi (${res.status})`)
  return data
}

export async function listChannelCommentThreads(channelId, pageToken) {
  return ytGet('commentThreads', {
    part: 'snippet,replies',
    allThreadsRelatedToChannelId: channelId,
    maxResults: '50',
    order: 'time',
    ...(pageToken ? { pageToken } : {}),
  })
}

export async function listVideoCommentThreads(videoId, pageToken) {
  return ytGet('commentThreads', {
    part: 'snippet,replies',
    videoId,
    maxResults: '50',
    order: 'time',
    ...(pageToken ? { pageToken } : {}),
  })
}

// Bir yoruma yanit (OAuth2 access token gerekir - youtube.force-ssl)
export async function replyToYoutubeComment(parentId, text, accessToken) {
  return ytPost('comments', { part: 'snippet' }, accessToken, {
    snippet: { parentId, textOriginal: text },
  })
}
