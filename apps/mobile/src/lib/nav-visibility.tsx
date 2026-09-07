import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/**
 * Whether the floating bottom nav is on screen.
 *
 * Two screens hide it while they are doing something: the Bible reader when you scroll
 * down into a chapter, and Focus while a prayer session runs. Both are tabs, so they
 * cannot simply not render it — hence a shared switch rather than a prop threaded
 * through the tab layout.
 *
 * Screens that are not tabs (onboarding, Settings, Streak, the reader, the summary and
 * the celebration) do not need this at all: they are stack routes above the tab
 * navigator and the nav is not in their tree.
 */

interface NavVisibility {
  hidden: boolean
  setHidden: (next: boolean) => void
}

const NavVisibilityContext = createContext<NavVisibility>({
  hidden: false,
  setHidden: () => {},
})

export function NavVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHiddenState] = useState(false)

  /* Identity-stable so a screen can hold it in a scroll handler without re-subscribing. */
  const setHidden = useCallback((next: boolean) => {
    setHiddenState((current) => (current === next ? current : next))
  }, [])

  const value = useMemo(() => ({ hidden, setHidden }), [hidden, setHidden])
  return <NavVisibilityContext.Provider value={value}>{children}</NavVisibilityContext.Provider>
}

export const useNavVisibility = () => useContext(NavVisibilityContext)
