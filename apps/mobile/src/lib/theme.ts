/**
 * Working tokens, not the finished design. Phase 9 replaces the type stack (the
 * prototype's Nokia and Niyala faces are not licensable) and does the real visual
 * pass; naming the values here means that swap touches one file rather than twenty.
 */
export const theme = {
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
