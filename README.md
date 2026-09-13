# 🚀 Command Cockpit — Kurumsal Otomasyon & Sosyal Medya Motoru

Facebook denetimi, Comment-to-DM otomasyonu, çok platformlu içerik üretimi, Reels stüdyosu ve video kesme/bölme özelliklerini tek bir **karanlık temalı komuta paneli**nde birleştiren, uçtan uca çalışan bir Next.js + MongoDB uygulaması.

> **Not:** Uygulama tamamen gerçek veri ve gerçek API çağrılarıyla çalışır — **hiçbir mock (sahte) veri yoktur.** Anahtar tanımlı değilse ilgili özellik kullanıcıyı nazikçe uyarır (ör. "OAuth gerekli"), sahte başarı üretmez.

---

## 📋 İçindekiler
1. [Ne İşe Yarar? (Özellikler)](#-özellikler)
2. [Kullanılan Teknolojiler (Altyapı)](#-kullanılan-teknolojiler-altyapı)
3. [Proje Yapısı](#-proje-yapısı)
4. [Kurulum & Çalıştırma](#-kurulum--çalıştırma)
5. [Ortam Değişkenleri (.env) — Nasıl Bağlanılır?](#-ortam-değişkenleri-env--nasıl-bağlanılır)
6. [Modüller & Nasıl Çalışır?](#-modüller--nasıl-çalışır)
7. [API Uç Noktaları (Endpoints)](#-api-uç-noktaları-endpoints)
8. [Veritabanı Şeması](#-veritabanı-şeması)
9. [Üçüncü Parti Entegrasyonlar](#-üçüncü-parti-entegrasyonlar)

---

## ✨ Özellikler

| Modül | Ne Yapar? |
|-------|-----------|
| **📊 Genel Bakış** | Sayfa sağlık skoru, yakalanan müşteri, fiyat sorgusu, YouTube lead istatistikleri; canlı Comment-to-DM & YouTube yorum simülatörü |
| **🛡️ FB Denetim** | Facebook sayfasını Graph API ile tarar, sağlık skoru üretir, eksik alanları AI ile önerir, görsel OCR (Vision) ile analiz eder, otomatik düzeltir |
| **💬 Comment-to-DM Motoru** | Facebook videosuna gelen "fiyat" yorumlarını tarar → herkese açık yanıt + Messenger DM + Telegram bildirimi gönderir, Lead oluşturur |
| **✍️ İçerik Fabrikası — Metin Üretici** | Gemini ile FB/IG/YT/TikTok için içerik üretir, telefon mockup önizlemesi gösterir |
| **🎨 İçerik Fabrikası — Afiş & Reels Stüdyosu** | Fabric.js sürükle-bırak 9:16 tuval editörü: yazı, ok, şekil, logo, AI metin önerileri, hizalama kılavuzları, kilitleme, **Logo Kütüphanesi (max 5)** |
| **🎬 İçerik Fabrikası — Video Kesici** | Yüklenen videoyu **kesme (trim)** ve **bölme (split)** — görsel zaman çizelgesi, parçalı yükleme, indir + yayınla + zamanla. Ayrıca: **kapak (thumbnail) alma**, **9:16 dikey dönüştürme**, **sesi kaldırma / müzik bindirme** ve **hazırlanan afişi videonun önüne giriş (intro) olarak ekleme** |
| **🎞️ Reels Render Motoru** | FFmpeg ile çok sahneli dikey video (MP4) üretir: Ken Burns zoom, geçiş efektleri (ayarlanabilir süre), telifsiz müzik |
| **📅 Takvim & Zamanlama** | Aylık takvim ızgarası; videoları IG/FB/YT'ye otomatik yayınlayan cron zamanlayıcı |
| **👥 Müşteri Masası (CRM)** | Tüm platformlardan gelen lead'leri durum takibiyle listeler |
| **🤖 Telegram Bot** | Webhook üzerinden bildirim ve ses→metin (Gemini Transcribe) girişi |
| **⚙️ Ayarlar** | Entegrasyon durumları, arka plan silme, cron aç/kapa, YouTube OAuth (Kanal Bağla) |

---

## 🧱 Kullanılan Teknolojiler (Altyapı)

- **Framework:** Next.js 15 (App Router) — hem frontend hem backend tek projede
- **Dil/UI:** React 18, TailwindCSS, shadcn/ui, lucide-react ikonları, `sonner` (toast)
- **Veritabanı:** MongoDB (`mongodb` sürücüsü) — ObjectID yerine UUID kullanılır
- **Canvas Editör:** Fabric.js 6 (HTML5 Canvas)
- **Video/Ses İşleme:** FFmpeg + FFprobe (sistem seviyesi bağımlılık)
- **AI:** `@google/genai` (Gemini Flash metin + görsel analiz, Gemini 3.5 Transcribe ses→metin)
- **Backend mimari:** Tek catch-all route (`/app/api/[[...path]]/route.js`) + `lib/` altında servis modülleri
- **Çalıştırma:** `npm run dev` / `npm start` (port 3000)

---

## 📁 Proje Yapısı

```text
/app/
├── app/
│   ├── api/[[...path]]/route.js   # TÜM backend mantığı (routing, DB, entegrasyonlar)
│   ├── page.js                    # Ana panel arayüzü (tüm modüller)
│   ├── layout.js                  # Kök layout
│   └── globals.css                # Global stiller
├── components/
│   ├── studio/ReelsStudio.jsx     # Fabric.js sürükle-bırak tuval editörü + Logo Kütüphanesi
│   ├── studio/VideoCutter.jsx     # Video kesme & bölme arayüzü (timeline)
│   └── ui/                        # shadcn bileşenleri
├── lib/
│   ├── ai.js          # Gemini metin / Vision / Transcribe
│   ├── meta.js        # Facebook Graph API
│   ├── telegram.js    # Telegram webhook & bildirim
│   ├── youtube.js     # YouTube Data API v3 & OAuth
│   ├── instagram.js   # Instagram yayınlama
│   ├── fbreels.js     # Facebook Reels yayınlama
│   ├── reels.js       # FFmpeg render motoru (çok sahne + geçiş)
│   ├── video.js       # FFmpeg kesme (trim) & süre okuma (ffprobe)
│   ├── scheduler.js   # Cron zamanlama mantığı
│   ├── googleoauth.js # Google/YouTube OAuth2
│   ├── bgremoval.js   # Arka plan silme (Remove.bg / Photoroom)
│   └── paths.js       # Yükleme & müzik klasör yolları
├── assets/music/      # Sistem tarafından üretilen telifsiz MP3'ler
├── .env               # Ortam yapılandırması
└── README.md
```

---

## ⚙️ Kurulum & Çalıştırma

Gereksinimler: Node.js, npm, MongoDB, FFmpeg.

```bash
# 1) Bağımlılıklar
npm install

# 2) FFmpeg (video render/kesme için zorunlu — sisteminize kurulu olmalı)

# 3) .env dosyasını doldurun (aşağıya bakın)

# 4) Geliştirme
npm run dev
```

Uygulama `http://localhost:3000` üzerinde çalışır; tüm backend istekleri `/api` ön eki ile yönlendirilir.

---

## 🔑 Ortam Değişkenleri (.env) — Nasıl Bağlanılır?

> AI özellikleri `GEMINI_API_KEY` ile çalışır. Diğer entegrasyonlar için ilgili anahtarları girmeniz yeterlidir; girmezseniz o özellik "anahtar gerekli" uyarısı verir.

### Zorunlu (MongoDB + Render)
| Değişken | Açıklama |
|----------|----------|
| `MONGO_URL` | MongoDB Atlas / Render Mongo bağlantısı |
| `DB_NAME` | Veritabanı adı |
| `NEXT_PUBLIC_BASE_URL` | Dış URL (Render: `https://....onrender.com`) |
| `CORS_ORIGINS` | İzinli origin'ler |
| `DATA_DIR` | Video/yükleme kökü (Render disk: `/var/data`) |

### AI (Gemini)
| Değişken | Nereden? |
|----------|----------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `AI_MODEL` | Metin + görsel model (varsayılan `gemini-3.8-flash`) |
| `AI_STT_MODEL` | Ses→metin model (varsayılan `gemini-3.5-transcribe`) |

### Meta (Facebook & Instagram)
| Değişken | Nereden? |
|----------|----------|
| `META_APP_ID`, `META_APP_SECRET` | [developers.facebook.com](https://developers.facebook.com) → App |
| `META_VERIFY_TOKEN` | Webhook doğrulama için kendi belirlediğiniz metin |
| `PAGE_ACCESS_TOKEN`, `PAGE_ID` | Facebook Sayfa erişim token'ı ve sayfa ID'si |
| `IG_USER_ID` | Instagram Business hesap ID'si |
| `META_GRAPH_VERSION` | Graph API sürümü (ör. v21.0) |

### Telegram
| Değişken | Nereden? |
|----------|----------|
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Bildirim gönderilecek sohbet ID'si |

### YouTube / Google OAuth
| Değişken | Nereden? |
|----------|----------|
| `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` | Google Cloud Console → YouTube Data API v3 (okuma) |
| `YOUTUBE_OAUTH_ACCESS_TOKEN` | Yorum yanıtı + Shorts yükleme için OAuth2 token |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth2 kimlik bilgileri |
| `GOOGLE_REDIRECT_URI` | Boşsa `NEXT_PUBLIC_BASE_URL + /api/oauth/google/callback` kullanılır |
| `OAUTH_STATE_SECRET` | OAuth state imzalama |

### Arka Plan Silme (opsiyonel)
| Değişken | Nereden? |
|----------|----------|
| `BACKGROUND_PROVIDER` | `remove_bg` veya `photoroom` |
| `REMOVE_BG_API_KEY` / `PHOTOROOM_API_KEY` | İlgili servisin API anahtarı |

### Cron
| Değişken | Açıklama |
|----------|----------|
| `CRON_SCAN_SCHEDULE` | Otomatik yorum tarama zamanlaması (cron ifadesi) |

---

## 🧩 Modüller & Nasıl Çalışır?

### Comment-to-DM Motoru
Meta webhook'a gelen yorum → `lib/meta.js` yorumu tarar → "fiyat/kaç tl" gibi anahtarları tespit eder → herkese açık yanıt + özel DM + `lib/telegram.js` ile bildirim → MongoDB'ye `PRICE_INQUIRY` lead'i yazar.

### Reels Stüdyosu
`components/studio/ReelsStudio.jsx` tuvale tasarım yapar → PNG olarak dışa aktarılır → `/api/studio/render` → `lib/reels.js` FFmpeg ile 9:16 MP4 üretir (çok sahne + `xfade` geçişleri, geçiş süresi 0.3–2sn ayarlanabilir + müzik). **Logo Kütüphanesi** logoları base64 olarak `studio_logos` koleksiyonunda saklar (max 5), tek tıkla tuvale ekler.

### Video Kesici
`components/studio/VideoCutter.jsx` videoyu **parçalı (chunked, 4MB)** yükler → `ffprobe` ile süre okunur → görsel timeline'da başlangıç/bitiş seçilir. **Kes (trim)** tek parça, **Böl (split)** eşit parça veya nokta bazlı böler (`lib/video.js`). Her parça `renders` koleksiyonuna `DONE` olarak kaydedilir → indirilebilir veya doğrudan YouTube/FB/IG'ye yayınlanır ya da takvime zamanlanır.

Her sonuç parçası için ek araçlar:
- **Kapak Al**: Videoyu istenen ana getirip o kareden PNG kapak üretir (`extractThumbnail`)
- **9:16 Yap**: Videoyu dikey Reels formatına (1080×1920, merkez kırpma) çevirir (`toVertical`)
- **Sesi Kaldır / Müzik Bindir**: Sesi kaldırır veya telifsiz preset müzik bindirir (`stripAudio` / `replaceAudio`)

### Afişi Video Önüne Ekleme (Intro)
Reels Stüdyosu'nda tasarlanan afiş **"Afişi Video Girişi İçin Kaydet"** ile `posters` koleksiyonuna (PNG + thumbnail) kaydedilir. Video Kesici'deki **"Afiş / Giriş Ekle"** panelinden bu afiş (veya yeni yüklenen bir görsel) seçilir, süre (0.5–10sn) belirlenir ve `POST /api/video/prepend-poster` ile afiş, videonun resolüsyonuna uyumlanıp başına giriş olarak eklenir (`prependPoster`, FFmpeg concat filtresi + sessiz videolar için otomatik sessiz ses ekleme).

### Zamanlama
Üretilen/kesilen her video `renders` koleksiyonunda bir `jobId` alır. `/api/schedule` ile platform + tarih seçilir; `lib/scheduler.js` cron zamanı gelince ilgili yayınlama modülünü tetikler.

---

## 🔌 API Uç Noktaları (Endpoints)

Tümü `/api` ön ekiyle çalışır.

**Sistem:** `GET /health`, `GET /config`, `GET /stats`, `GET /logs`
**Sayfalar:** `GET/POST /pages`, `GET/PUT/DELETE /pages/:id`
**Denetim:** `POST /audit/crawl`, `POST /audit/fix`, `POST /audit/vision`, `GET /audit/reports`
**İçerik:** `POST /content/generate`, `POST /content/publish`, `GET /content`, `POST /content/telegram-approval`
**Comment-to-DM:** `POST /simulate/comment`, `POST /webhooks/meta`, `POST /webhooks/telegram`
**Lead:** `GET /leads`, `PUT /leads/:id`
**Stüdyo:** `GET /studio/presets`, `POST /studio/render`, `GET /studio/render/:id`, `POST /studio/suggest-labels`, `POST /studio/custom-boxes`, `POST /studio/remove-bg`, `POST /studio/save-poster`, `POST /studio/upload-audio`
**Logo Kütüphanesi:** `GET/POST /studio/logos`, `DELETE /studio/logos/:id`
**Afiş (Poster) Kütüphanesi:** `GET/POST /posters`, `DELETE /posters/:id`
**Video Kesici:** `POST /video/upload-chunk`, `POST /video/trim`, `POST /video/split`, `POST /video/thumbnail`, `POST /video/vertical`, `POST /video/audio`, `POST /video/prepend-poster`
**Yayınlama:** `POST /reels/publish-fb`, `POST /reels/publish-ig`, `POST /youtube/upload-short`, `POST /youtube/publish`
**YouTube:** `GET /youtube/status`, `POST /youtube/scan`, `POST /youtube/simulate`
**OAuth:** `GET /oauth/google/url`, `GET /oauth/google/callback`, `GET /oauth/google/status`
**Zamanlama & Cron:** `GET/POST /schedule`, `DELETE /schedule/:id`, `POST /schedule/:id/publish-now`, `GET /cron/status`, `POST /cron/toggle`, `POST /cron/run`
**Medya:** `GET /media?dir=uploads|music&file=...`

---

## 🗄️ Veritabanı Şeması (MongoDB)

| Koleksiyon | Alanlar (özet) |
|------------|----------------|
| `facebook_pages` | id, pageId, accessToken, commentTemplate, dmTemplate, healthScore |
| `audit_reports` | pageId, status, score, missingFields, aiSuggestions |
| `content_posts` | rawInputText, platform, status |
| `leads` | platform, externalUserId, userMessage, sentiment, status |
| `renders` | id, status, outFile, videoUrl, source, duration (Reels & video kesici çıktıları) |
| `studio_logos` | id, name, image (base64), createdAt (max 5) |
| `posters` | id, name, file, url, thumb, createdAt (Reels afişleri — video girişi için, max 12) |
| `schedules` | jobId, platforms, caption, scheduledAt, status |
| `system_logs` | type, level, message, createdAt |

---

## 🔗 Üçüncü Parti Entegrasyonlar

| Servis | Kullanım | Gereksinim |
|--------|----------|-----------|
| **Gemini Flash / 3.5 Transcribe** | İçerik üretimi, görsel OCR, ses→metin | `GEMINI_API_KEY` |
| **Meta Graph API** | Facebook & Instagram yönetimi/yayınlama | Kullanıcı API anahtarı |
| **Telegram Bot API** | Bildirim & giriş | Kullanıcı bot token'ı |
| **YouTube Data API v3** | Yorum tarama & Shorts yükleme | API key / OAuth |
| **Remove.bg / Photoroom** | Arka plan silme | Opsiyonel API anahtarı |
| **FFmpeg / FFprobe** | Video render, kesme, süre okuma | Sistem seviyesi bağımlılık |

---

## 📝 Notlar
- ObjectID yerine **UUID** kullanılır (JSON serileştirme uyumu için).
- Tüm URL'ler ortam değişkenlerinden okunur; hiçbir yerde sabit (hardcoded) URL/port yoktur.
- Video render/kesme sistem `ffmpeg`'ine bağlıdır; ortam sıfırlanırsa yeniden kurun.

---

_Command Cockpit — tek panelden kurumsal otomasyon._
