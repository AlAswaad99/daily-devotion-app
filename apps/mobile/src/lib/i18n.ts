import type { Language, PartOfDay } from '@abide/domain'

/**
 * UI strings. Content strings (topics, purposes, prayers) are not here — they come
 * from the database as paired _en/_am columns with no fallback chain, so a missing
 * translation is caught before publish rather than degrading silently in the app.
 */
const strings = {
  appName: { en: 'Temuagn', am: 'ጠሟኝ' },

  todayGreeting: { en: 'Good morning', am: 'እንደምን አደርክ' },
  /* Upper-cased: it is the ink card's kicker, and Ethiopic has no case to transform. */
  todaysDevotion: { en: "TODAY'S DEVOTION", am: 'የዛሬ ጥሞና' },
  alreadyDone: { en: 'Done for today', am: 'ለዛሬ ተጠናቋል' },
  comingSoon: { en: 'Coming soon', am: 'በቅርቡ' },
  comingSoonBody: {
    en: 'This round has finished. The next one has not been published yet — your streak is held, not broken. If you think that is wrong, check your connection and try again.',
    am: 'ይህ ዙር ተጠናቋል። ቀጣዩ ገና አልታተመም — ተከታታይህ ተይዟል እንጂ አልተቋረጠም። ስህተት ይመስልዎታል ብለው ካሰቡ፣ ግንኙነትህን አረጋግጠህ እንደገና ሞክር።',
  },
  noDevotionToday: { en: 'No devotion scheduled today', am: 'ዛሬ የታቀደ ጥናት የለም' },
  dayLocked: { en: 'This day isn’t open yet.', am: 'ይህ ቀን ገና አልተከፈተም።' },

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
  signInSubtitle: { en: 'Welcome back.', am: 'እንኳን ደህና ተመለስክ።' },
  phoneNumber: { en: 'Phone number', am: 'ስልክ ቁጥር' },
  sendCode: { en: 'Send code', am: 'ኮድ ላክ' },
  invalidPhone: {
    en: 'Enter a full phone number, with country code.',
    am: 'ሙሉ ስልክ ቁጥር ከሀገር ኮድ ጋር ያስገቡ።',
  },
  enterOtpTitle: { en: 'Enter the code', am: 'ኮዱን ያስገቡ' },
  otpSentTo: {
    en: 'Sent by Telegram to {phone}.',
    am: 'ኮዱ በቴሌግራም ወደ {phone} ተልኳል።',
  },
  resendCode: { en: 'Resend code', am: 'ኮድ እንደገና ላክ' },
  invalidOtp: {
    en: 'That code is wrong or has expired.',
    am: 'ይህ ኮድ የተሳሳተ ወይም ጊዜው ያለፈበት ነው።',
  },
  changePhoneNumber: { en: 'Use a different number', am: 'ሌላ ቁጥር ተጠቀም' },
  activateTelegramTitle: { en: 'Get your code by Telegram', am: 'ኮድዎን በቴሌግራም ያግኙ' },
  activateTelegramBody: {
    en: 'Open Telegram and tap Start, so we have somewhere to send your sign-in code.',
    am: 'ኮድ የምንልክበት ቦታ እንዲኖረን Telegramን ከፍተው Start የሚለውን ይንኩ።',
  },
  openTelegram: { en: 'Open Telegram', am: 'Telegramን ክፈት' },
  checkAgain: { en: 'I did this — check again', am: 'ጨርሻለሁ — እንደገና አረጋግጥ' },
  stillNotActivated: {
    en: 'We still don’t see it. Open Telegram, make sure you tapped Start, then try again.',
    am: 'አሁንም አላገኘነውም። Telegramን ከፍተው Start መንካትዎን አረጋግጠው እንደገና ይሞክሩ።',
  },
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
  focusHistory: { en: 'Focus history', am: 'የጸሎት ታሪክ' },
  focusSessions: { en: 'Sessions', am: 'ክፍለ ጊዜዎች' },
  focusHistoryEmpty: {
    en: 'Nothing logged yet — your sessions will show up here.',
    am: 'እስካሁን የተመዘገበ ነገር የለም — ክፍለ ጊዜዎችህ እዚህ ይታያሉ።',
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
    en: 'The Bible text is not included in this version of Temuagn yet. You can open the passage in YouVersion instead.',
    am: 'የመጽሐፍ ቅዱስ ጽሑፍ ገና በዚህ የጠሟኝ ቅጂ ውስጥ አልተካተተም። ክፍሉን በ YouVersion መክፈት ትችላለህ።',
  },
  readerOpenElsewhere: { en: 'Open in YouVersion', am: 'በ YouVersion ክፈት' },
  readerOptions: { en: 'Reader options', am: 'የአንባቢ አማራጮች' },
  readerCompare: { en: 'Compare versions', am: 'ቅጂዎችን አነጻጽር' },
  readerCompareUnavailable: {
    en: 'Only one Bible version is on this device right now, so there is nothing yet to compare it with.',
    am: 'በአሁኑ ጊዜ በዚህ መሳሪያ ላይ አንድ የመጽሐፍ ቅዱስ ቅጂ ብቻ አለ፣ ስለዚህ ገና የሚነጻጸርበት ነገር የለም።',
  },
  readerNavigate: { en: 'Navigate', am: 'ማሰስ' },
  readerVersion: { en: 'Bible version', am: 'የመጽሐፍ ቅዱስ ቅጂ' },
  oldTestament: { en: 'Old Testament', am: 'ብሉይ ኪዳን' },
  newTestament: { en: 'New Testament', am: 'ሐዲስ ኪዳን' },
  readerSmaller: { en: 'Smaller', am: 'አነስ ያለ' },
  readerLarger: { en: 'Larger', am: 'ትልቅ' },
  readerChapter: { en: 'Chapter', am: 'ምዕራፍ' },
  readerPreviewSample: {
    en: 'This is how the reading text will look.',
    am: 'ጽሑፉ በንባብ ጊዜ የሚታየው በዚህ መልኩ ነው።',
  },
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

  obStep1: { en: 'STEP 1 OF 3', am: 'ደረጃ 1 ከ3' },
  obStep2: { en: 'STEP 2 OF 3', am: 'ደረጃ 2 ከ3' },
  obStep3: { en: 'STEP 3 OF 3', am: 'ደረጃ 3 ከ3' },
  joinTitle: { en: 'Enter your code', am: 'ኮድዎን ያስገቡ' },
  joinSub: {
    en: 'The 6-character code you were given links your devotions and reflections to your account.',
    am: 'የተሰጠዎት የ6 ፊደል ኮድ ጥሞናዎችዎንና ማሰላሰሎችዎን ከመለያዎ ጋር ያገናኛል።',
  },
  codeHint: { en: 'Letters and numbers · Already sent on telegram', am: 'ፊደላትና ቁጥሮች · ቴሌግራም ላይ ተልኳል' },
  codeComplete: { en: 'Code accepted', am: 'ኮድ ተቀባይነት አግኝቷል' },
  continueWord: { en: 'Continue', am: 'ቀጥል' },
  nameTitle: { en: 'What should we call you?', am: 'ማን ብለን እንጥራዎት?' },
  namePlaceholder: { en: 'Your first name', am: 'የመጠሪያ ስምዎ' },
  back: { en: 'Back', am: 'ተመለስ' },
  notifTitle: { en: 'A gentle daily nudge', am: 'ለስላሳ የዕለት ማስታወሻ' },
  notifBody: {
    en: 'One reminder each morning. No streak guilt, no noise — switch it off any time in Settings.',
    am: 'በየጠዋቱ አንድ ማስታወሻ ብቻ። በቅንብሮች ውስጥ በማንኛውም ጊዜ ማጥፋት ይችላሉ።',
  },
  allowReminders: { en: 'Allow reminders', am: 'ማስታወሻ ፍቀድ' },
  notNow: { en: 'Not now', am: 'አሁን አይሆንም' },
  devotionTimeLabel: {
    en: 'DEVOTION TIME · ETHIOPIAN CLOCK',
    am: 'የጥሞና ሰዓት · በኢትዮጵያ ሰዓት አቆጣጠር',
  },
  startsAt: { en: 'Starts at', am: 'ይጀምራል' },
  durationLabel: { en: 'Duration', am: 'ቆይታ' },
  yourDevotionTime: { en: 'Your devotion time', am: 'የጥሞና ሰዓትዎ' },

  everyDay: { en: 'EVERY DAY', am: 'በየቀኑ' },
  justNow: { en: 'now', am: 'አሁን' },
  notifSampleBody: {
    en: "Today's devotion: Abide in the Vine · 4 min",
    am: 'የዛሬ ጥሞና፡ በወይኑ ግንድ ኑሩ · 4 ደቂቃ',
  },
  /*
   * The design hardcodes "Good morning" here, because its preview kicker was fixed to
   * "EVERY MORNING". The window is now whatever the member chose, so the greeting has
   * to follow it — showing "Good morning" to someone who just picked nine at night
   * undermines the one thing a preview is for. Night reuses the evening greeting
   * deliberately: "good night" reads as a farewell, not a hello.
   */
  greetingMorning: { en: 'Good morning', am: 'መልካም ጠዋት' },
  greetingAfternoon: { en: 'Good afternoon', am: 'መልካም ከሰዓት' },
  greetingEvening: { en: 'Good evening', am: 'መልካም ምሽት' },
  greetingNight: { en: 'Good evening', am: 'መልካም ምሽት' },

  settingsKicker: { en: 'SETTINGS', am: 'ቅንብሮች' },
  sectionProfile: { en: 'PROFILE', am: 'መገለጫ' },
  sectionNotifications: { en: 'NOTIFICATIONS', am: 'ማስታወሻዎች' },
  sectionLanguage: { en: 'LANGUAGE', am: 'ቋንቋ' },
  sectionAccount: { en: 'ACCOUNT', am: 'መለያ' },
  nameRow: { en: 'Name', am: 'ስም' },
  dailyReminder: { en: 'Daily reminder', am: 'የዕለት ማስታወሻ' },
  reminderOff: { en: 'Off', am: 'ጠፍቷል' },
  everyDayAt: { en: 'Every day at', am: 'በየቀኑ' },
  /*
   * Two language rows, not the design's one. `reader_language` is a separate column
   * and the Bible reader picks its translation from it, so collapsing the two would
   * quietly lock scripture to whatever the interface is set to.
   */
  uiLanguage: { en: 'App language', am: 'የመተግበሪያ ቋንቋ' },
  readerLanguage: { en: 'Scripture language', am: 'የቅዱሳት መጻሕፍት ቋንቋ' },
  deleteMyData: { en: 'Delete my data', am: 'መረጃዬን አጥፋ' },
  deleteConfirmTitle: { en: 'Delete everything?', am: 'ሁሉንም ይጥፋ?' },
  deleteConfirmBody: {
    en: 'Your reflections, favourites and streak are removed for good. This cannot be undone.',
    am: 'ማስታወሻዎችዎ፣ የተመረጡትና ተከታታይዎ ለዘላለም ይወገዳሉ። ይህ ሊቀለበስ አይችልም።',
  },
  deleteConfirm: { en: 'Delete', am: 'አጥፋ' },
  cancel: { en: 'Cancel', am: 'ተወው' },
  appVersion: { en: 'Temuagn 1.0', am: 'Temuagn 1.0' },

  summaryKicker: { en: 'SERIES SUMMARY', am: 'የተከታታይ ማጠቃለያ' },
  summaryLede: {
    en: 'Answer in your own words — a sentence is enough.',
    am: 'በራስዎ ቃላት ይመልሱ — አንድ ዓረፍተ ነገር ይበቃል።',
  },
  answered: { en: 'answered', am: 'ተመልሰዋል' },
  answerPlaceholder: { en: 'Write here…', am: 'እዚህ ይጻፉ…' },
  finishSeries: { en: 'Finish series', am: 'ተከታታዩን አጠናቅቅ' },
  summaryReady: {
    en: '{count} questions · finish the series',
    am: '{count} ጥያቄዎች · ተከታታዩን አጠናቅቅ',
  },
  summaryLocked: {
    en: '{count} parts still to read',
    am: 'ገና {count} ክፍሎች ይቀራሉ',
  },

  seriesCompleteKicker: { en: 'SERIES COMPLETE', am: 'ተከታታይ ተጠናቅቋል' },
  wellDone: { en: 'Well done.', am: 'እንኳን ደስ አለዎት።' },
  wellDoneNamed: { en: 'Well done, {name}.', am: 'እንኳን ደስ አለዎት፣ {name}።' },
  statParts: { en: 'PARTS', am: 'ክፍሎች' },
  statReflections: { en: 'REFLECTIONS', am: 'ማስታወሻዎች' },
  statDays: { en: 'DAYS', am: 'ቀናት' },
  startNextSeries: { en: 'Start the next series', am: 'ቀጣዩን ተከታታይ ጀምር' },
  backToDevotions: { en: 'Back to devotions', am: 'ወደ ጥሞናዎች ተመለስ' },

  journalKicker: { en: 'MY JOURNAL', am: 'የእኔ ማስታወሻ' },
  reflectionsTitle: { en: 'Reflections', am: 'ማስታወሻዎች' },
  reflectionCount: { en: '{count} reflections', am: '{count} ማስታወሻዎች' },
  reflectionCountOne: { en: '1 reflection', am: '1 ማስታወሻ' },
  rangeAll: { en: 'All time', am: 'ሁሉም ጊዜ' },
  rangeMonth: { en: 'Last month', am: 'ያለፈው ወር' },
  range3: { en: 'Last 3 months', am: 'ያለፉት 3 ወራት' },
  range6: { en: 'Last 6 months', am: 'ያለፉት 6 ወራት' },
  rangeYear: { en: 'Last year', am: 'ያለፈው ዓመት' },
  allSeries: { en: 'All', am: 'ሁሉም' },
  rangeCustom: { en: 'Custom range', am: 'ብጁ ክልል' },
  toWord: { en: 'to', am: 'እስከ' },

  /*
   * v3 copy, taken verbatim from `STR`, `LIB` and `OB` in the design's logic class.
   * Kickers are stored already upper-cased in English because Ethiopic has no case and
   * `textTransform` would be a no-op on one script and a lie on the other.
   */
  beginStudy: { en: 'Begin study', am: 'ጥናት ጀምር' },
  myStreak: { en: 'MY STREAK', am: 'የእኔ ተከታታይ' },
  dayStreak: { en: 'DAY STREAK', am: 'ተከታታይ ቀናት' },
  bestStreakLabel: { en: 'BEST STREAK', am: 'ምርጥ ተከታታይ' },
  devotionsLabel: { en: 'DEVOTIONS', am: 'ጥሞናዎች' },
  calendarProgress: { en: '{done} of {total} days', am: 'ከ{total} ቀናት {done}' },
  reflectLabel: { en: 'REFLECT', am: 'ማሰላሰያ' },
  writePlaceholder: { en: 'Write your reflection…', am: 'ማሰላሰልዎን ይጻፉ…' },
  saveReflectionBtn: { en: 'Save to Reflections', am: 'ወደ ማሰላሰሎች አስቀምጥ' },
  updateReflectionBtn: { en: 'Update reflection', am: 'ማሰላሰልን አዘምን' },
  savedNote: { en: 'Saved to Reflections ✓', am: 'ተቀምጧል ✓' },
  genericReflectQ: {
    en: 'What is God saying to you in this passage?',
    am: 'እግዚአብሔር በዚህ ንባብ ምን ይነግርዎታል?',
  },
  keyVerseTag: { en: 'KEY VERSE', am: 'ቁልፍ ጥቅስ' },
  readFullChapter: { en: 'Read the full chapter', am: 'ሙሉውን ምዕራፍ አንብብ' },
  bibleHeaderEn: { en: 'HOLY BIBLE · NIV', am: 'መጽሐፍ ቅዱስ · NIV' },
  bibleHeaderAm: { en: 'HOLY BIBLE · AMHARIC', am: 'መጽሐፍ ቅዱስ · አማርኛ' },
  focusWord: { en: 'FOCUS', am: 'ትኩረት' },
  minShort: { en: 'min', am: 'ደቂቃ' },
  focusQuote: {
    en: '"Be still, and know that I am God."',
    am: '"ጸጥ በሉ፥ እኔም አምላክ እንደ ሆንሁ እወቁ።"',
  },
  readingWord: { en: 'READING', am: 'ንባብ' },
  partWord: { en: 'PART {n}', am: 'ክፍል {n}' },
  minutesRead: { en: '{n} min', am: '{n} ደቂቃ' },

  libraryKicker: { en: 'MY LIBRARY', am: 'የእኔ ቤተ መጻሕፍት' },
  seriesKicker: { en: 'SERIES', am: 'ተከታታይ ጥናት' },
  librarySearchPlaceholder: {
    en: 'Search devotions, series, verses…',
    am: 'ጥሞና፣ መጽሐፍ ወይም ጥቅስ ፈልግ…',
  },
  devotionCount: { en: '{count} devotions', am: '{count} ጥሞናዎች' },
  resultCount: { en: '{count} results', am: '{count} ውጤቶች' },
  resultCountOne: { en: '1 result', am: '1 ውጤት' },
  badgeContinue: { en: 'CONTINUE', am: 'ቀጥል' },
  badgeComplete: { en: 'COMPLETE', am: 'ተጠናቅቋል' },
  badgeInProgress: { en: 'IN PROGRESS', am: 'በመከናወን ላይ' },
  pillToday: { en: 'TODAY', am: 'ዛሬ' },
  pillNotRead: { en: 'NOT READ', am: 'አልተነበበም' },
  pillReflection: { en: 'REFLECTION', am: 'ማሰላሰል' },
  pillRead: { en: 'READ {date}', am: '{date} ተነብቧል' },
  pillLocked: { en: 'UNLOCKS {date}', am: '{date} ይከፈታል' },
  partsWord: { en: 'parts', am: 'ክፍሎች' },
  partsProgress: { en: '{done} of {total} parts', am: 'ከ{total} ክፍሎች {done}' },
  noneMatch: {
    en: 'No devotions match those filters.',
    am: 'ስፖስ ምንም ጥሞና አልተገኘም።',
  },
  seriesSummaryTitle: { en: 'Series summary', am: 'የተከታታይ ማጠቃለያ' },

  restartOnboarding: { en: 'Restart onboarding', am: 'ማስተዋወቂያውን እንደገና ጀምር' },
  ribbonReady: { en: '{part} devotion is ready', am: 'የ{part} ጥሞና ተዘጋጅቷል' },
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

/**
 * The rotating copy, from `GREET`, `MOTIVES` and `CFG_TXT` in the design's logic class.
 *
 * Arrays rather than `strings` entries, because the design picks one at random. The app
 * seeds the pick on the ministry date instead, so what a member sees is stable for the
 * day rather than changing under them on every render.
 */
export const GREETINGS: Record<Language, Record<PartOfDay, readonly string[]>> = {
  en: {
    morning: ['GOOD MORNING', 'RISE & SHINE', 'A NEW MORNING'],
    afternoon: ['GOOD AFTERNOON', 'HELLO AGAIN', 'A GOOD AFTERNOON'],
    evening: ['GOOD EVENING', 'WELCOME BACK', 'A CALM EVENING'],
    night: ['GOOD NIGHT', 'REST WELL', 'A QUIET NIGHT'],
  },
  am: {
    morning: ['መልካም ጠዋት', 'መልካም አዲስ ቀን', 'እንኳን አነጋህ'],
    afternoon: ['መልካም ከሰዓት', 'እንደገና ሰላም', 'መልካም ቀን'],
    evening: ['መልካም ምሽት', 'እንኳን ደህና መጣህ', 'የተረጋጋ ምሽት'],
    night: ['መልካም ሌሊት', 'መልካም እረፍት', 'ጸጥ ያለ ሌሊት'],
  },
}

export const MOTIVATIONS: Record<Language, readonly string[]> = {
  en: [
    'Stay close to the Vine today.',
    'His mercies are new this morning.',
    'One quiet moment can change everything.',
    'Abide, and let the fruit come.',
    'Be still, and know that He is God.',
    'You were not made to strive alone.',
  ],
  am: [
    'ዛሬ ወደ ወይኑ ግንድ ቅርብ ሁን።',
    'ምሕረቱ በዚህ ጠዋት አዲስ ነው።',
    'አንድ ጸጥ ያለ ጊዜ ሁሉንም ሊለውጥ ይችላል።',
    'ኑር፥ ፍሬውም ይምጣ።',
    'ጸጥ በል፥ እርሱም አምላክ እንደ ሆነ እወቅ።',
    'ብቻህን ለመታገል አልተፈጠርክም።',
  ],
}

/**
 * Weekday names, from the design's `DAYS` table.
 *
 * Sunday first, matching `Date.getDay()`. Upper-cased in English for the same reason as
 * the kickers: the date line under the greeting is set in the label family.
 */
export const WEEKDAYS: Record<Language, readonly string[]> = {
  en: ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
  am: ['እሑድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ'],
}

/** Part-of-day words for the hero and the ribbon, from `PARTS_TXT.short`. */
export const PART_SHORT: Record<Language, Record<PartOfDay, string>> = {
  en: { morning: 'MORNING', afternoon: 'AFTERNOON', evening: 'EVENING', night: 'NIGHT' },
  am: { morning: 'ጠዋት', afternoon: 'ከሰዓት', evening: 'ምሽት', night: 'ሌሊት' },
}

export type StreakState = 'strong' | 'low' | 'out'

/**
 * The streak message and its sub-line, from `CFG_TXT`.
 *
 * The design hardcodes its sample numbers into the sentences ("23 days of abiding",
 * "You've missed 2 days"). These take them as variables, so the screen can say something
 * true about the member's own record rather than something true about the mock-up.
 */
export const STREAK_COPY: Record<
  Language,
  Record<StreakState, { msg: string; sub: string }>
> = {
  en: {
    strong: {
      msg: '{count} days of abiding. Keep the fire burning.',
      sub: 'You have not missed a single day this month.',
    },
    low: {
      msg: 'Your flame is fading.',
      sub: 'You have missed {missed} days. Return today and keep the fire alive.',
    },
    out: {
      msg: 'The flame has gone out.',
      sub: '{missed} days without a devotion. Today is a good day to relight it.',
    },
  },
  am: {
    strong: {
      msg: '{count} ቀናት የመኖር ጉዞ። እሳቱ እንዲነድ ያድርጉ።',
      sub: 'በዚህ ወር አንድም ቀን አላመለጡም።',
    },
    low: {
      msg: 'ነበልባልዎ እየደበዘዘ ነው።',
      sub: '{missed} ቀናት አምልጠዋል። ዛሬ ይመለሱ እና እሳቱን ሕያው ያድርጉት።',
    },
    out: {
      msg: 'ነበልባሉ ጠፍቷል።',
      sub: '{missed} ቀናት ያለ ጥሞና። ዛሬ እንደገና ለማብራት መልካም ቀን ነው።',
    },
  },
}

/** `{name}` substitution for the tables above, which do not go through `translate`. */
export const fill = (text: string, vars: Record<string, string | number>): string => {
  let out = text
  for (const [name, value] of Object.entries(vars)) out = out.replaceAll(`{${name}}`, String(value))
  return out
}
