import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'ASM Cockpit',
  description: 'Facebook Denetim, Comment-to-DM ve Coklu Platform Icerik Fabrikasi',
}

export default function RootLayout({ children }) {
  return (
    <html lang="tr" className="dark">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}