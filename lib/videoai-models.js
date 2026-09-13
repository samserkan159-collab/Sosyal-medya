export const VIDEO_AI_MODELS = [
  {
    id: 'veo-lite',
    name: 'Veo 3.1 Lite',
    model: 'veo-3.1-lite-generate-preview',
    blurb: 'En ucuz test. Foto + yazidan kisa video.',
    usdPerSec: 0.05,
    durations: [4, 6, 8],
    resolution: '720p',
  },
  {
    id: 'omni',
    name: 'Omni Flash',
    model: 'gemini-omni-1.1-flash',
    blurb: 'Takilabiliyor — video icin Veo Lite daha saglam.',
    usdPerSec: 0.10,
    durations: [5, 8, 10],
    resolution: '720p',
  },
  {
    id: 'veo-fast',
    name: 'Veo 3.1 Fast',
    model: 'veo-3.1-fast-generate-preview',
    blurb: 'Daha hizli, Lite\'dan pahali.',
    usdPerSec: 0.10,
    durations: [4, 6, 8],
    resolution: '720p',
  },
  {
    id: 'veo-std',
    name: 'Veo 3.1 Standard',
    model: 'veo-3.1-generate-preview',
    blurb: 'En kaliteli, en pahali.',
    usdPerSec: 0.40,
    durations: [4, 6, 8],
    resolution: '720p',
  },
]

export function modelCatalog() {
  return VIDEO_AI_MODELS.map((m) => ({
    ...m,
    prices: m.durations.map((sec) => ({
      seconds: sec,
      usd: Number((m.usdPerSec * sec).toFixed(2)),
      label: `${sec} sn ≈ $${(m.usdPerSec * sec).toFixed(2)}`,
    })),
  }))
}
