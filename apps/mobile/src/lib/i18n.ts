import type { Language } from '@abide/domain'

/**
 * UI strings. Content strings (topics, purposes, prayers) are not here — they come
 * from the database as paired _en/_am columns with no fallback chain, so a missing
 * translation is caught before publish rather than degrading silently in the app.
 */
const strings = {
  appName: { en: 'Abide', am: 'ተወው' },

  todayGreeting: { en: 'Good morning', am: 'እንደምን አደርክ' },
  todaysDevotion: { en: "Today's devotion", am: 'የዛሬው ጥናት' },
  alreadyDone: { en: 'Done for today', am: 'ለዛሬ ተጠናቋል' },
  comingSoon: { en: 'Coming soon', am: 'በቅርቡ' },
  comingSoonBody: {
    en: 'This round has finished. The next one has not been published yet — your streak is held, not broken.',
    am: 'ይህ ዙር ተጠናቋል። ቀጣዩ ገና አልታተመም — ተከታታይህ ተይዟል እንጂ አልተቋረጠም።',
  },
  noDevotionToday: { en: 'No devotion scheduled today', am: 'ዛሬ የታቀደ ጥናት የለም' },

  read: { en: 'Read', am: 'አንብብ' },
  continueReading: { en: 'Continue', am: 'ቀጥል' },
  done: { en: 'Done', am: 'ተጠናቀቀ' },
  completed: { en: 'Completed', am: 'ተጠናቋል' },

  passage: { en: 'Passage', am: 'ክፍል' },
  keyVerses: { en: 'Key verses', am: 'ቁልፍ ጥቅሶች' },
  crossReferences: { en: 'Cross references', am: 'ተዛማጅ ጥቅሶች' },
  prayer: { en: 'Prayer', am: 'ጸሎት' },
  purpose: { en: 'Purpose', am: 'ዓላማ' },
  summaryQuestions: { en: 'Summary questions', am: 'ማጠቃለያ ጥያቄዎች' },

  finishedAlready: { en: 'Finished already?', am: 'በዚህ ፈጥነህ ጨርሰሃል?' },
  finishedAlreadyBody: {
    en: "You've been here {seconds} seconds. You can mark it done anyway.",
    am: 'እዚህ የቆየኸው {seconds} ሰከንድ ነው። ለማንኛውም እንደተጠናቀቀ ማድረግ ትችላለህ።',
  },
  markDone: { en: 'Mark it done', am: 'እንደተጠናቀቀ አድርግ' },
  keepReading: { en: 'Keep reading', am: 'ማንበብ ቀጥል' },

  streak: { en: 'Streak', am: 'ተከታታይ' },
  currentStreak: { en: 'Current', am: 'አሁን' },
  bestStreak: { en: 'Best', am: 'ከፍተኛ' },
  totalDays: { en: 'Total days', am: 'ጠቅላላ ቀናት' },
  streakDays: { en: '{count} days', am: '{count} ቀናት' },
  dayNumber: { en: 'Day {n}', am: 'ቀን {n}' },
  noStreakYet: { en: 'Start today', am: 'ዛሬ ጀምር' },

  repairTitle: { en: 'Repair your streak', am: 'ተከታታይህን ጠግን' },
  repairBody: {
    en: 'You missed {date}. Reading it now marks it done, but the streak stays broken unless you repair it.',
    am: '{date} አምልጦሃል። አሁን ማንበብ እንደተጠናቀቀ ያደርገዋል፣ ነገር ግን ካልጠገንከው ተከታታዩ የተቋረጠ ሆኖ ይቀራል።',
  },
  repair: { en: 'Repair', am: 'ጠግን' },
  backfillOnly: { en: 'Just read it', am: 'ብቻ አንብበው' },
  repaired: { en: 'Repaired', am: 'ተጠግኗል' },
  backfilled: { en: 'Read late', am: 'ዘግይቶ የተነበበ' },
  missed: { en: 'Missed', am: 'ያመለጠ' },
  beforeYouJoined: { en: 'Before you joined', am: 'ከመቀላቀልህ በፊት' },

  language: { en: 'Language', am: 'ቋንቋ' },
  english: { en: 'English', am: 'እንግሊዝኛ' },
  amharic: { en: 'Amharic', am: 'አማርኛ' },
  whenDoYouRead: { en: 'When do you read?', am: 'መቼ ታነባለህ?' },
  morning: { en: 'Morning', am: 'ጠዋት' },
  afternoon: { en: 'Afternoon', am: 'ከሰዓት' },
  evening: { en: 'Evening', am: 'ማታ' },
  night: { en: 'Night', am: 'ሌሊት' },
  continueLabel: { en: 'Continue', am: 'ቀጥል' },
  welcome: { en: 'Welcome', am: 'እንኳን ደህና መጣህ' },

  signIn: { en: 'Sign in', am: 'ግባ' },
  createAccount: { en: 'Create account', am: 'መለያ ፍጠር' },
  signInSubtitle: { en: 'Welcome back.', am: 'እንኳን ደህና ተመለስክ።' },
  signUpSubtitle: { en: 'Create your account.', am: 'መለያህን ፍጠር።' },
  email: { en: 'Email', am: 'ኢሜይል' },
  password: { en: 'Password', am: 'የይለፍ ቃል' },
  needAnAccount: { en: 'I need an account', am: 'መለያ እፈልጋለሁ' },
  haveAnAccount: { en: 'I already have an account', am: 'መለያ አለኝ' },
  invalidCredentials: {
    en: 'That email and password do not match an account. If you have not signed up yet, choose "I need an account".',
    am: 'ይህ ኢሜይል እና የይለፍ ቃል ከመለያ ጋር አይዛመድም። ገና ካልተመዘገብክ "መለያ እፈልጋለሁ" የሚለውን ምረጥ።',
  },
  checkYourEmail: {
    en: 'Account created. Check your email to confirm it before signing in.',
    am: 'መለያ ተፈጥሯል። ከመግባትህ በፊት ለማረጋገጥ ኢሜይልህን ተመልከት።',
  },
  useAnotherAccount: { en: 'Use another account', am: 'ሌላ መለያ ተጠቀም' },
  waitingToSync: {
    en: '{count} saved on this phone, waiting for a connection',
    am: '{count} በዚህ ስልክ ተቀምጧል፣ ግንኙነት እየጠበቀ ነው',
  },
  offline: { en: 'Offline', am: 'ከመስመር ውጭ' },
  notSyncedYet: { en: 'Not synced yet', am: 'ገና አልተመሳሰለም' },
  notSyncedYetBody: {
    en: "This phone has not reached the server yet, so it does not know what today's devotion is.",
    am: 'ይህ ስልክ ገና ወደ አገልጋዩ አልደረሰም፣ ስለዚህ የዛሬው ጥናት ምን እንደሆነ አያውቅም።',
  },
  noContentYet: { en: 'Nothing downloaded yet', am: 'ገና ምንም አልወረደም' },
  noContentYetBody: {
    en: 'This phone has not managed to download the study yet. Check your connection and try again.',
    am: 'ይህ ስልክ ጥናቱን ገና ማውረድ አልቻለም። ግንኙነትህን አረጋግጠህ እንደገና ሞክር።',
  },
  devotionsTab: { en: 'Devotions', am: 'ጥናቶች' },
  reflectTab: { en: 'Reflect', am: 'ማስታወሻ' },
  bibleTab: { en: 'Bible', am: 'መጽሐፍ ቅዱስ' },

  focusIntro: {
    en: 'A set time to pray. Notifications are silenced while it runs.',
    am: 'ለጸሎት የተወሰነ ጊዜ። በሚሄድበት ጊዜ ማሳወቂያዎች ጸጥ ይላሉ።',
  },
  focusBegin: { en: 'Begin', am: 'ጀምር' },
  focusEnd: { en: 'End', am: 'ጨርስ' },
  focusDone: { en: 'Prayed', am: 'ጸለይህ' },
  focusMinutes: { en: 'minutes', am: 'ደቂቃ' },
  focusLast30: { en: 'Last 30 days', am: 'ያለፉት 30 ቀናት' },
  focusUninterrupted: { en: 'Undisturbed.', am: 'ሳትቋረጥ።' },
  /* Counted, stated, and left there. A mirror, not a scold. */
  focusSteppedAway: { en: 'Stepped away', am: 'ወጣህ' },
  focusAllowTitle: { en: 'Allow silencing', am: 'ጸጥታን ፍቀድ' },
  focusAllowBody: {
    en: 'Android asks for this once, on its own settings screen. Without it the timer still works, but notifications will not be silenced.',
    am: 'አንድሮይድ ይህን አንድ ጊዜ በራሱ የቅንብር ገጽ ይጠይቃል። ያለ እሱ ሰዓት ቆጣሪው ይሰራል፣ ግን ማሳወቂያዎች ጸጥ አይሉም።',
  },
  focusRestored: {
    en: 'A previous session left notifications silenced. They are back on now.',
    am: 'ቀደም ያለ ክፍለ ጊዜ ማሳወቂያዎችን ጸጥ አድርጎ ነበር። አሁን ተመልሰዋል።',
  },

  readerSearch: { en: 'Search the Bible', am: 'መጽሐፍ ቅዱስን ፈልግ' },
  readerTextSize: { en: 'Text size', am: 'የጽሑፍ መጠን' },
  readerBookmark: { en: 'Bookmark this chapter', am: 'ይህን ምዕራፍ ምልክት አድርግ' },
  readerUnbookmark: { en: 'Remove bookmark', am: 'ምልክቱን አንሳ' },
  streakLabel: { en: 'Streak', am: 'ተከታታይ' },
  readerNoResults: { en: 'Nothing found', am: 'ምንም አልተገኘም' },
  readerPrevious: { en: 'Previous', am: 'ቀዳሚ' },
  readerNext: { en: 'Next', am: 'ቀጣይ' },
  /*
   * Not an error message. Until the text is licensed this is what the reader is,
   * so it offers rather than apologises.
   */
  readerElsewhereTitle: { en: 'Read this passage', am: 'ይህን ክፍል አንብብ' },
  readerElsewhereBody: {
    en: 'The Bible text is not included in this version of Abide yet. You can open the passage in YouVersion instead.',
    am: 'የመጽሐፍ ቅዱስ ጽሑፍ ገና በዚህ የአበደ ቅጂ ውስጥ አልተካተተም። ክፍሉን በ YouVersion መክፈት ትችላለህ።',
  },
  readerOpenElsewhere: { en: 'Open in YouVersion', am: 'በ YouVersion ክፈት' },
  focusTab: { en: 'Focus', am: 'ጸሎት' },
  bibleComing: {
    en: 'The in-app Bible reader arrives in a later phase, once permission for the text is granted.',
    am: 'የመጽሐፍ ቅዱስ አንባቢ ለጽሑፉ ፈቃድ ከተገኘ በኋላ በሚቀጥለው ደረጃ ይመጣል።',
  },
  focusComing: {
    en: 'The prayer timer and distraction blocking arrive in a later phase.',
    am: 'የጸሎት ሰዓት ቆጣሪና የትኩረት መጠበቂያ በሚቀጥለው ደረጃ ይመጣሉ።',
  },
  searchDevotions: { en: 'Search devotions', am: 'ጥናቶችን ፈልግ' },
  searchReflections: { en: 'Search what you have written', am: 'የጻፍከውን ፈልግ' },
  noResults: { en: 'Nothing matches', am: 'ምንም አልተገኘም' },
  noReflectionsYet: {
    en: 'Nothing written yet. Anything you write stays private to you.',
    am: 'ገና ምንም አልተጻፈም። የምትጽፈው ሁሉ የአንተ ብቻ ሆኖ ይቆያል።',
  },
  filter_all: { en: 'All', am: 'ሁሉም' },
  filter_completed: { en: 'Completed', am: 'የተጠናቀቁ' },
  filter_unread: { en: 'Unread', am: 'ያልተነበቡ' },
  filter_reflected: { en: 'Reflected', am: 'ማስታወሻ ያላቸው' },
  filter_favourites: { en: 'Favourites', am: 'ተወዳጆች' },
  daysCompleted: { en: '{done} of {total} days', am: 'ከ{total} ቀናት {done}' },
  readItLate: { en: 'can still be read', am: 'አሁንም ሊነበብ ይችላል' },
  yourReflection: { en: 'Your reflection', am: 'ማስታወሻህ' },
  reflectionPlaceholder: {
    en: 'Optional. Only you can read this.',
    am: 'አማራጭ ነው። ይህን አንተ ብቻ ነህ የምታነበው።',
  },
  savedOnThisPhone: { en: 'Saved', am: 'ተቀምጧል' },
  settingsTitle: { en: 'Settings', am: 'ቅንብሮች' },
  notificationsTitle: { en: 'Notifications', am: 'ማሳወቂያዎች' },
  notificationsHelp: {
    en: 'Everything is on unless you turn it off. Whatever you leave on, you will never get more than two reminders in a day.',
    am: 'ካላጠፋኸው በስተቀር ሁሉም በርቷል። የምትተወው ምንም ይሁን፣ በቀን ከሁለት ማስታወሻ በላይ አይደርስህም።',
  },
  notif_daily_reminder: { en: 'Daily reminder', am: 'የዕለት ማስታወሻ' },
  notif_daily_reminder_help: {
    en: 'At the time you chose, if you have not read yet',
    am: 'በመረጥከው ሰዓት፣ ገና ካላነበብክ',
  },
  notif_streak_at_risk: { en: 'Streak at risk', am: 'ተከታታይ አደጋ ላይ' },
  notif_streak_at_risk_help: {
    en: 'In the evening, when today is still unread',
    am: 'ማታ፣ ዛሬ ገና ካልተነበበ',
  },
  notif_streak_lost: { en: 'Streak broken', am: 'ተከታታይ ተቋረጠ' },
  notif_streak_lost_help: { en: 'The morning after', am: 'በማግስቱ ጠዋት' },
  notif_repair_available: { en: 'Repair available', am: 'ጥገና ይቻላል' },
  notif_repair_available_help: {
    en: 'When a missed day can still be put right',
    am: 'ያመለጠ ቀን አሁንም ሊስተካከል ሲችል',
  },
  notif_comeback_d3: { en: 'After three quiet days', am: 'ከሦስት ጸጥታ ቀናት በኋላ' },
  notif_comeback_d3_help: { en: 'A gentle nudge', am: 'ረጋ ያለ ማስታወሻ' },
  notif_comeback_d7: { en: 'After a week', am: 'ከአንድ ሳምንት በኋላ' },
  notif_comeback_d7_help: { en: 'A gentle nudge', am: 'ረጋ ያለ ማስታወሻ' },
  notif_milestone: { en: 'Milestones', am: 'ምዕራፎች' },
  notif_milestone_help: { en: 'At 7, 14, 30, 50 and 100 days', am: 'በ7፣ 14፣ 30፣ 50 እና 100 ቀናት' },
  notif_book_complete: { en: 'Finishing a book', am: 'መጽሐፍ ሲጠናቀቅ' },
  notif_book_complete_help: { en: 'When you reach the last day', am: 'የመጨረሻው ቀን ላይ ስትደርስ' },
  notif_round_start: { en: 'A new round', am: 'አዲስ ዙር' },
  notif_round_start_help: { en: 'When the ministry starts a new study', am: 'አገልግሎቱ አዲስ ጥናት ሲጀምር' },
  notif_broadcast: { en: 'Messages from the ministry', am: 'ከአገልግሎቱ መልእክቶች' },
  notif_broadcast_help: { en: 'Sent by your leaders', am: 'በመሪዎችህ የሚላክ' },
  settings: { en: 'Settings', am: 'ቅንብሮች' },
  signOut: { en: 'Sign out', am: 'ውጣ' },
  retry: { en: 'Try again', am: 'እንደገና ሞክር' },
  loading: { en: 'Loading', am: 'በመጫን ላይ' },

  /*
   * Onboarding, from the v3 design's own `OB` dictionary. Taken verbatim rather than
   * retranslated: the Amharic there was written for these screens and reads better
   * than a literal rendering of the English would.
   */
  welcomeTagline: {
    en: 'A quiet daily place to stay close to the Vine.',
    am: 'ወደ ወይኑ ግንድ ቅርብ ለመሆን ጸጥ ያለ የዕለት ቦታ።',
  },
  getStarted: { en: 'Get started', am: 'ጀምር' },
} as const

export type StringKey = keyof typeof strings

export function translate(
  key: StringKey,
  language: Language,
  vars?: Record<string, string | number>,
): string {
  let text: string = strings[key][language]
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

/**
 * Ethiopic needs roughly 8–10% more line height than Latin at the same size, so it
 * is set per-language rather than globally.
 */
export const lineHeightFor = (language: Language, fontSize: number): number =>
  Math.round(fontSize * (language === 'am' ? 1.62 : 1.5))
