'use client'

import { usePathname } from 'next/navigation'
import { Nav } from './Nav'
import { TopBar } from './TopBar'

/**
 * Sign-in has no navigation to sit inside, so it renders alone on the viewport
 * rather than in a content column with an empty rail beside it.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  if (path === '/sign-in') return <>{children}</>

  return (
    <div className="app">
      <Nav />
      <div className="app-body">
        <TopBar />
        <main className="scroll">{children}</main>
      </div>
    </div>
  )
}
