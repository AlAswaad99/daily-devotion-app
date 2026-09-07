import type { Language } from '@abide/domain'

/**
 * The design tokens, from the approved v3 design.
 *
 * Two surface families, and the split is semantic rather than a light/dark mode.
 * Ritual screens — Today, Streak, Focus, onboarding, celebration — are ink: near
 * black with an olive cast. Reading screens — devotion detail, Bible, the library,
 * reflections, settings — are paper: a warm green-grey card stack. There is no user
 * toggle, so nothing here is conditional on a colour scheme.
 *
 * The key names are unchanged from the previous cream/terracotta palette on purpose:
 * every screen picked up the new colours the moment this file landed, and the per-screen
 * restyle that followed changed layout rather than chasing renamed tokens.
 *
 * There is no flat `font` map any more. Latin and Ethiopic are different families here —
 * Archivo and Newsreader have no Ethiopic coverage — so a face cannot be named without
 * knowing the language, and every caller goes through `fonts(language)` below.
 */
export const theme = {
  color: {
    /* Paper — the reading surfaces. The gradient runs bg → bgDeep top to bottom. */
    bg: '#F2F3E2',
    bgDeep: '#E9EDD4',
    surface: '#ffffff',
    /** Inset fields: search boxes, textareas, summary rows. */
    field: '#F3F5E6',
    /** Muted panel: stepper buttons, unanswered question chips. */
    panel: '#eef1e2',
    line: '#dde3c4',

    /* Ink — the ritual surfaces, and the bottom nav on every screen. */
    ink: '#1f2612',
    inkDeep: '#16200c',
    inkDeeper: '#121a0b',
    inkDarkest: '#0b0f04',

    /* Text on paper. `ink` doubles as the primary text colour. */
    inkBody: '#333c22',
    inkBodySoft: '#4a5436',
    inkSecondary: '#5b6647',
    inkMuted: '#8a9670',
    inkFaint: '#93a17a',
    kicker: '#75844a',

    /* Text on ink. */
    onInk: '#F2F3E2',
    onInkBright: '#f3f5e4',
    onInkSecondary: '#a3b573',
    onInkMuted: '#93a17a',
    onInkDim: '#7c8a63',

    /* Lime — the action colour. `accent` is the cut that reads on paper. */
    accent: '#5E7E33',
    accentDeep: '#3f5622',
    /** The cut that reads on ink: nav active tint, CTA fill, streak faces. */
    accentBright: '#A9C86A',
    accentMid: '#8FB052',
    accentPale: '#D9E8A8',
    accentSoft: '#eef1e2',
    /** The lime that reads on the ink card's own ground: bible bar, verse-card label. */
    accentOnInk: '#dfe9c4',

    /* Chrome the design names once each, and only in one place. */
    /** Idle chip text in the library and reflect filter rows. */
    chipIdle: '#5a6749',
    /** Idle nav label and icon. */
    navIdle: '#9aa87e',
    /** Progress-bar track on paper. Lighter than `line`, which is a border colour. */
    track: '#e7ebd6',
    /** Calendar day numbers for days that were read. */
    calRead: '#e8eed6',
    /** Calendar day numbers outside the member's record. */
    calDim: '#5a6749',
    /** The settings version footer, quieter than any text token. */
    footnote: '#a3ad8f',
    /** Ink-card surfaces that are not the nav: the bible bar under the verse card. */
    inkBar: '#1b2610',
    /** Disabled CTA fill and its label. */
    ctaOff: '#e2e6cf',
    stepOff: '#b3bd97',

    /* Amber — streak, "today", and the reminder window. */
    flame: '#F6BC45',
    flameMid: '#E8843C',
    flameDeep: '#C05A16',
    flamePale: '#FBE8B8',
    /** Reflection date tags in the journal list. */
    tagBg: '#FAEBCF',
    tagInk: '#8a6224',

    danger: '#B4432B',
    /** A day the user missed. Warmer than danger — a gap, not an error. */
    missed: '#E0764A',
    missedSoft: '#c98a6a',

    /** Pre-join days: readable, but visibly outside the user's own record. */
    neutral: '#7c8a63',
    /** Retained for the prayer card, which keeps a warmer ground than the body. */
    prayer: '#F3F5E6',
    success: '#5E7E33',
  },

  /** Mascot and sky are gradients, so they live outside the flat colour map. */
  gradient: {
    cta: ['#D9E8A8', '#8FB052', '#6f9440'] as const,
    ctaStops: [0, 0.72, 1] as const,
    paper: ['#F2F3E2', '#E9EDD4'] as const,
    inkWelcome: ['#2c3a14', '#18220a', '#070c03'] as const,
    inkStreak: ['#22300F', '#141D09', '#0A1005'] as const,
    /** The notification-preview panel's own two-stop mix, lit from directly overhead. */
    inkNotification: ['#2c3a16', '#131a0a', '#131a0a'] as const,
    mascot: ['#A0331F', '#C6452A', '#8E2A18'] as const,
    mascotStops: [0, 0.4, 1] as const,
    flame: ['#F6BC45', '#E8843C', '#C05A16'] as const,
  },

  /**
   * The four skies, lifted from `DayScene`'s own gradient stops so the time cards and
   * the Today backdrop cannot drift apart.
   */
  sky: {
    morning: { colors: ['#FFE9B0', '#FFBF7C', '#FF9C72'], locations: [0, 0.55, 1] },
    afternoon: { colors: ['#A8DBFF', '#6FB7F2', '#3F95E0'], locations: [0, 0.55, 1] },
    evening: {
      colors: ['#FFCB73', '#FB8C6A', '#B5689A', '#6E54A0'],
      locations: [0, 0.38, 0.72, 1],
    },
    night: { colors: ['#3A3E86', '#23254F', '#101230'], locations: [0, 0.5, 1] },
  },

  /** Mascot facial features — eyes, mouth, brows. */
  mascotInk: '#2a160a',

  space: (n: number) => n * 8,

  radius: {
    sm: 8,
    /** Number chips on library and series rows. */
    chip: 11,
    /** Icon tiles: the 46px squares on cards, and the nav's active chip. */
    tile: 15,
    /** Buttons and most cards. */
    md: 18,
    /** Filter pills and the chips in the calendar. */
    pillSoft: 20,
    /** Settings cards and reflection cards. */
    xl: 20,
    /** The streak calendar card. */
    calendar: 22,
    /** Roomier cards and panels. */
    lg: 24,
    /** Bottom sheets, the nav bar's top corners, and the ink devotion card. */
    sheet: 26,
    /** Code entry boxes. */
    code: 14,
    pill: 999,
  },

  size: {
    /** Screen titles. The design runs 34–56; this is the common cut. */
    display: 36,
    title: 22,
    subtitle: 21,
    body: 16,
    label: 13,
    micro: 11,
    /** Kickers: uppercase, letter-spaced, the smallest thing that ships. */
    kicker: 11,
  },

  /**
   * Letter-spacing for uppercase kickers. The design runs 1.6–4px by context: 2px is
   * by far the most common, 1.6 on the smallest labels, 4 on the two hero kickers.
   */
  tracking: { kickerTight: 1.6, kicker: 2, kickerWide: 4 },

  layout: {
    screenPadding: 22,
    safeTop: 45,
    navHeight: 88,
    /** Content must clear the floating nav. */
    navClearance: 124,
    /** The height every primary CTA shares. */
    ctaHeight: 52,
    backButton: 38,
  },

  shadow: {
    /** Cards on paper: a soft lift plus a hairline, since the ground is low-contrast. */
    card: {
      shadowColor: '#1f2612',
      shadowOpacity: 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    /** The roomier lift the design gives series cards and the summary card. */
    cardBig: {
      shadowColor: '#1f2612',
      shadowOpacity: 0.22,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 9 },
      elevation: 3,
    },
    cta: {
      shadowColor: '#5E7E33',
      shadowOpacity: 0.45,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    /** The ink devotion card on Today, and the ink verse card in the reader. */
    inkCard: {
      shadowColor: '#000000',
      shadowOpacity: 0.5,
      shadowRadius: 17,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
    /** The nav's upward cast. RN cannot offset elevation upward; iOS gets the real thing. */
    nav: {
      shadowColor: '#000000',
      shadowOpacity: 0.4,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: -6 },
      elevation: 16,
    },
    /** Under the mascot, which otherwise floats with nothing beneath it. */
    mascot: {
      shadowColor: '#000000',
      shadowOpacity: 0.4,
      shadowRadius: 9,
      shadowOffset: { width: 0, height: 9 },
      elevation: 6,
    },
  },
} as const

/**
 * The type stack, resolved per UI language.
 *
 * Latin and Ethiopic are separate families by design decision: Archivo and Newsreader
 * carry the English voice, the Nokia/Niyala/Menbere set carries the Amharic one. A
 * single family covering both would be simpler, but the approved design treats the two
 * scripts as two voices and the licensing question was settled in favour of shipping
 * the design's faces.
 *
 * Numerals are Arabic in both languages, so `numeric` is a display face rather than a
 * script choice — Anton for English, Nokia Ethiopic Bold for Amharic, per the design.
 */
export const fonts = (language: Language) =>
  language === 'am'
    ? {
        ui: 'Niyala',
        /** UI text the design sets in the label family at 600–700: rows, metas, chips. */
        uiMedium: 'NokiaEthiopicBold',
        label: 'NokiaEthiopicBold',
        /** Kickers and CTA labels, which the design sets at 800. */
        labelStrong: 'NokiaEthiopicBold',
        title: 'NokiaEthiopicBold',
        subtitle: 'NokiaEthiopicLight',
        body: 'Niyala',
        italic: 'Menbere',
        numeric: 'NokiaEthiopicBold',
      }
    : {
        ui: 'Archivo',
        uiMedium: 'ArchivoSemiBold',
        label: 'ArchivoBold',
        labelStrong: 'ArchivoExtraBold',
        title: 'Newsreader',
        subtitle: 'Newsreader',
        body: 'Newsreader',
        italic: 'NewsreaderItalic',
        numeric: 'Anton',
      }

export type FontRole = keyof ReturnType<typeof fonts>

/**
 * Streak day cells.
 *
 * The design names three outcomes — read, missed, and nothing — but the streak engine
 * distinguishes five, because repair and backfill are separate mechanics with separate
 * rules and a member who repaired a day should be able to see that they did. Repair and
 * backfill therefore take the amber ramp rather than the lime: they are the flame's
 * vocabulary, which is already how the rest of the app talks about a rescued streak.
 */
export const dayCellState = {
  counted: theme.color.accentBright,
  repaired: theme.color.flame,
  backfilled: theme.color.flamePale,
  missed: theme.color.missed,
  future: 'transparent',
  preJoin: theme.color.neutral,
} as const
