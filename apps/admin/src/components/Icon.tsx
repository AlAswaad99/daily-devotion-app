/**
 * One stroke-based icon set on a 20px grid.
 *
 * Drawn rather than imported: the dashboard needs about a dozen glyphs, and a
 * dependency that ships a thousand of them would be the largest thing in the
 * bundle. They inherit `currentColor` so a row's colour carries its icon.
 */

const PATHS = {
  overview: <path d="M3 3h6v7H3zM3 12h6v5H3zM11 3h6v5h-6zM11 10h6v7h-6z" />,
  analytics: <path d="M3 16.5V9M7.5 16.5V4M12 16.5v-5M16.5 16.5V7" />,
  library: (
    <>
      <path d="M3.5 4.5A1.5 1.5 0 0 1 5 3h4v14H5a1.5 1.5 0 0 0-1.5 1.5z" />
      <path d="M9 3h5a1.5 1.5 0 0 1 1.5 1.5V17H9z" />
    </>
  ),
  schedule: (
    <>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8.5h14M7 3v3M13 3v3" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a4 4 0 0 1 8 0c0 3 1 4.5 1.5 5h-11C5 12.5 6 11 6 8z" />
      <path d="M8.25 16a1.9 1.9 0 0 0 3.5 0" />
    </>
  ),
  users: (
    <>
      <circle cx="8" cy="7" r="2.6" />
      <path d="M3.5 16.5c0-2.5 2-4.2 4.5-4.2s4.5 1.7 4.5 4.2" />
      <path d="M13.2 5.2a2.4 2.4 0 0 1 0 4.3M14 12.6c1.6.5 2.7 1.9 2.7 3.9" />
    </>
  ),
  search: (
    <>
      <circle cx="9" cy="9" r="5.2" />
      <path d="M12.8 12.8 16.5 16.5" />
    </>
  ),
  chevron: <path d="M7.5 4.5 12.5 10l-5 5.5" />,
  arrow: <path d="M4 10h11M10.5 5.5 15 10l-4.5 4.5" />,
  alert: (
    <>
      <path d="M10 3.2 18 16.8H2z" />
      <path d="M10 8v3.6M10 14.1v.1" />
    </>
  ),
  check: <path d="M4 10.5 8 14.5 16 5.5" />,
  clock: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 5.8V10l3 1.8" />
    </>
  ),
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  close: <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />,
  filter: <path d="M3.5 5h13l-5 5.6v4.6l-3 1.6v-6.2z" />,
  download: <path d="M10 3.5v9M6 9l4 4 4-4M3.5 16.5h13" />,
  globe: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c1.9 2 2.9 4.4 2.9 7s-1 5-2.9 7c-1.9-2-2.9-4.4-2.9-7S8.1 5 10 3z" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v11.5H5.5A1.5 1.5 0 0 0 4 16z" />
      <path d="M4 16a1.5 1.5 0 0 1 1.5-1.5H16V17H5.5A1.5 1.5 0 0 1 4 15.5z" />
    </>
  ),
  send: <path d="M17 3 9 11M17 3l-5.2 14-2.8-6-6-2.8z" />,
  lock: (
    <>
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.6" />
      <path d="M7 9V6.8a3 3 0 0 1 6 0V9" />
    </>
  ),
  signOut: <path d="M8 17H4.5A1.5 1.5 0 0 1 3 15.5v-11A1.5 1.5 0 0 1 4.5 3H8M12.5 13.5 17 10l-4.5-3.5M17 10H7.5" />,
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.5,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
