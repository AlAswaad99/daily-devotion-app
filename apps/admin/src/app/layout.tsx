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
      <body>
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
