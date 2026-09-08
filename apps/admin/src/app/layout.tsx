import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans, Noto_Sans_Ethiopic } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '../lib/session'
import { Shell } from '../components/Shell'
import { ToastProvider } from '../components/Toast'

/*
 * Three faces, each with a job.
 *
 * Plex Sans is the interface voice; Plex Mono carries every figure that can be
 * compared down a column, with tabular numerals so the columns actually line up.
 * Noto Sans Ethiopic is the same family the mobile app bundles — so a translator
 * editing Amharic here sees what a member will see on a phone, rather than a
 * system fallback with different metrics.
 */
const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

const ethiopic = Noto_Sans_Ethiopic({
  subsets: ['ethiopic'],
  weight: ['400', '500', '600'],
  variable: '--font-ethiopic',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Temuagn Admin',
  description: 'Content, scheduling and analytics for the Temuagn devotion app',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${ethiopic.variable}`}>
      {/*
        Browser extensions (Grammarly and friends) add attributes to <body> before
        React hydrates, which React reports as a mismatch it cannot patch. This
        suppresses the warning for this element's own attributes only — a genuine
        mismatch anywhere inside the app is still reported.
      */}
      <body suppressHydrationWarning>
        <SessionProvider>
          <ToastProvider>
            <Shell>{children}</Shell>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
