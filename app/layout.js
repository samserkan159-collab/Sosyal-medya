import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'Command Cockpit — Otomasyon Motoru',
  description: 'Facebook Denetim, Comment-to-DM ve Coklu Platform Icerik Fabrikasi',
}

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}