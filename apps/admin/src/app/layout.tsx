import type { Metadata } from 'next'
import './globals.css'
import { SessionProvider } from '../lib/session'
import { Nav } from '../components/Nav'

export const metadata: Metadata = {
  title: 'Abide Admin',
  description: 'Content and scheduling for the Abide devotion app',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        Browser extensions (Grammarly and friends) add attributes to <body> before
        React hydrates, which React reports as a mismatch it cannot patch. This
        suppresses the warning for this element's own attributes only — a genuine
        mismatch anywhere inside the app is still reported.
      */}
      <body suppressHydrationWarning>
        <SessionProvider>
          <div className="shell">
            <Nav />
            <main className="main">{children}</main>
          </div>
        </SessionProvider>
      </body>
    </html>
  )
}
