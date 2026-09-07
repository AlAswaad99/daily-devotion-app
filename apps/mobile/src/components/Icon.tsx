import Svg, { Circle, Path } from 'react-native-svg'

/**
 * The design's icon set, traced from the `ICONS` map in the prototype.
 *
 * One 24-unit grid, stroke 2, round caps and joins, `currentColor` — so an icon is only
 * ever a size and a colour, and nothing here has to know which screen it is on. These
 * replace the text glyphs (`◔ ▤ ✝ ◎ ✎`) the nav was drawing, which came out of whatever
 * font happened to resolve and differed between the two languages.
 */

export type IconName =
  | 'today'
  | 'bible'
  | 'focus'
  | 'devotions'
  | 'reflect'
  | 'gear'
  | 'clock'
  | 'search'
  | 'devotionLeaf'
  | 'sliders'
  | 'columns'
  | 'bookmark'
  | 'chevronLeft'
  | 'check'

export function Icon({
  name,
  size = 22,
  colour,
  strokeWidth = 2,
}: {
  name: IconName
  size?: number
  colour: string
  strokeWidth?: number
}) {
  const common = {
    stroke: colour,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'today' && (
        <>
          <Circle cx="12" cy="12" r="4.5" {...common} />
          <Path
            d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"
            {...common}
          />
        </>
      )}

      {name === 'bible' && (
        <>
          <Path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" {...common} />
          <Path d="M12 6.5v6M9.5 9h5" {...common} />
        </>
      )}

      {name === 'focus' && (
        <>
          <Circle cx="12" cy="13" r="8" {...common} />
          <Path d="M12 13V8.5M9 2h6" {...common} />
        </>
      )}

      {name === 'devotions' && (
        <>
          <Path d="M4 4.5h5a2.5 2.5 0 0 1 2.5 2.5v12A2 2 0 0 0 9.5 17.5H4z" {...common} />
          <Path d="M20 4.5h-5A2.5 2.5 0 0 0 12.5 7v12a2 2 0 0 1 2-1.5H20z" {...common} />
        </>
      )}

      {name === 'reflect' && (
        <>
          <Path d="M12 20h9" {...common} />
          <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" {...common} />
        </>
      )}

      {name === 'gear' && (
        <>
          <Circle cx="12" cy="12" r="3" {...common} />
          <Path
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
            {...common}
          />
        </>
      )}

      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} strokeWidth={2.2} />
          <Path d="M12 7v5l3.5 2" {...common} strokeWidth={2.2} />
        </>
      )}

      {name === 'search' && (
        <>
          <Circle cx="11" cy="11" r="7" {...common} />
          <Path d="m21 21-4.3-4.3" {...common} />
        </>
      )}

      {/* The sprouting branch on the devotion card and the series cards. */}
      {name === 'devotionLeaf' && (
        <>
          <Path d="M11 20A7 7 0 0 1 4 13V8a4 4 0 0 1 4-4h4a8 8 0 0 1 8 8 8 8 0 0 1-8 8z" {...common} />
          <Path d="M8 12c3 0 6 2.5 6 7" {...common} />
        </>
      )}

      {/* Three sliders, each with its own thumb — the reader's options icon. */}
      {name === 'sliders' && (
        <>
          <Path d="M4 6h9M17 6h3M4 12h3M9 12h11M4 18h13M21 18h-1" {...common} />
          <Circle cx="13" cy="6" r="2.2" {...common} />
          <Circle cx="6.5" cy="12" r="2.2" {...common} />
          <Circle cx="18" cy="18" r="2.2" {...common} />
        </>
      )}

      {/* Two panels side by side — the compare icon. */}
      {name === 'columns' && (
        <>
          <Path d="M4 4.5h16v15H4z" {...common} />
          <Path d="M12 4.5v15" {...common} />
        </>
      )}

      {name === 'bookmark' && (
        <Path d="M6 3.5h12v17l-6-4-6 4z" {...common} />
      )}

      {name === 'chevronLeft' && (
        <Path d="M15 4.5 7 12l8 7.5" {...common} />
      )}

      {name === 'check' && (
        <Path d="M4.5 12.5 9.5 17.5 19.5 6.5" {...common} />
      )}
    </Svg>
  )
}
