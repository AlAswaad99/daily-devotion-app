/**
 * The design tokens.
 *
 * The type stack is Noto Sans and Noto Serif Ethiopic, both SIL OFL. The prototype's
 * Nokia and Niyala faces could never ship — Nokia's is a proprietary corporate
 * typeface and Niyala's EULA forbids app embedding — so the licensable replacement
 * went in before the visual pass rather than after, because the metrics differ and
 * every Amharic layout shifts with them.
 *
 * One family covers Ethiopic and Latin, which is the point: a member reading English
 * and a member reading Amharic get the same typography rather than two designs that
 * happen to share a screen.
 */
export const theme = {
  /*
   * Serif for scripture and the devotion body — the reading voice. Sans for
   * everything the interface says in its own voice: labels, counts, buttons.
   */
  font: {
    body: 'NotoSans',
    bodyMedium: 'NotoSansMedium',
    bodyBold: 'NotoSansBold',
    reading: 'NotoSerif',
    readingMedium: 'NotoSerifMedium',
  },
  color: {
    bg: '#faf7f0',
    surface: '#ffffff',
    ink: '#16150f',
    inkMuted: '#6b6a63',
    line: '#e4e2da',
    accent: '#b4522a',
    accentSoft: '#f6e6dd',
    flame: '#e07a3f',
    prayer: '#f3ead9',
    success: '#3f7d54',
    danger: '#a33a2a',
    /** Pre-join days: readable, but visibly outside the user's own record. */
    neutral: '#d6d4cc',
  },
  space: (n: number) => n * 8,
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  size: {
    display: 32,
    title: 22,
    body: 16,
    label: 13,
    micro: 11,
  },
} as const

export const dayCellState = {
  counted: theme.color.flame,
  repaired: theme.color.accent,
  backfilled: theme.color.accentSoft,
  missed: theme.color.line,
  future: 'transparent',
  preJoin: theme.color.neutral,
} as const
