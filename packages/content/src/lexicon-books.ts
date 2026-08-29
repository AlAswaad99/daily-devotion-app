/**
 * The 66 canonical books, in canonical order. Amharic names and chapter counts came
 * from the plaintext `manifest.bible` inside the NASV package — a list of book
 * titles, which carries no copyright restriction of its own. Abbreviations were
 * derived from the forms the ministry actually uses in its devotion JSONs.
 *
 * `index` is 1-based and is what `ScriptureRef.book` stores. Names are never
 * stored — they are localised at render time from this table.
 */
export interface BookEntry {
  index: number
  en: string
  am: string
  /** Amharic abbreviations seen in the source data, longest-match-first at parse time. */
  abbreviations: string[]
}

export const BOOKS: readonly BookEntry[] = [
  { index: 1, en: 'Genesis', am: 'ዘፍጥረት', abbreviations: ['ዘፍ'] },
  { index: 2, en: 'Exodus', am: 'ዘጸአት', abbreviations: ['ዘጸ'] },
  { index: 3, en: 'Leviticus', am: 'ዘሌዋውያን', abbreviations: ['ዘሌ'] },
  { index: 4, en: 'Numbers', am: 'ዘኍልቁ', abbreviations: ['ዘኍ'] },
  { index: 5, en: 'Deuteronomy', am: 'ዘዳግም', abbreviations: ['ዘዳ'] },
  { index: 6, en: 'Joshua', am: 'ኢያሱ', abbreviations: ['ኢያ'] },
  { index: 7, en: 'Judges', am: 'መሳፍንት', abbreviations: ['መሳ'] },
  { index: 8, en: 'Ruth', am: 'ሩት', abbreviations: ['ሩት'] },
  { index: 9, en: '1 Samuel', am: '1ኛ ሳሙኤል', abbreviations: ['1ኛ ሳሙ', '1 ሳሙ'] },
  { index: 10, en: '2 Samuel', am: '2ኛ ሳሙኤል', abbreviations: ['2ኛ ሳሙ'] },
  { index: 11, en: '1 Kings', am: '1ኛ ነገሥት', abbreviations: ['1ኛ ነገ'] },
  { index: 12, en: '2 Kings', am: '2ኛ ነገሥት', abbreviations: ['2ኛ ነገ'] },
  { index: 13, en: '1 Chronicles', am: '1 ዜና', abbreviations: ['1 ዜና'] },
  { index: 14, en: '2 Chronicles', am: '2 ዜና', abbreviations: ['2 ዜና'] },
  { index: 15, en: 'Ezra', am: 'ዕዝራ', abbreviations: ['ዕዝ'] },
  { index: 16, en: 'Nehemiah', am: 'ነሀምያ', abbreviations: ['ነሀ'] },
  { index: 17, en: 'Esther', am: 'አስቴር', abbreviations: ['አስ'] },
  { index: 18, en: 'Job', am: 'ኢዮብ', abbreviations: ['ኢዮብ'] },
  { index: 19, en: 'Psalms', am: 'መዝሙር', abbreviations: ['መዝ'] },
  { index: 20, en: 'Proverbs', am: 'ምሳሌ', abbreviations: ['ምሳ'] },
  { index: 21, en: 'Ecclesiastes', am: 'መክብብ', abbreviations: ['መክ'] },
  { index: 22, en: 'Song of Songs', am: 'መኃልየ', abbreviations: ['መኃ'] },
  { index: 23, en: 'Isaiah', am: 'ኢሳይያስ', abbreviations: ['ኢሳ'] },
  { index: 24, en: 'Jeremiah', am: 'ኤርምያስ', abbreviations: ['ኤር'] },
  { index: 25, en: 'Lamentations', am: 'ሰቆቃወ ኤርምያስ', abbreviations: ['ሰቆ'] },
  { index: 26, en: 'Ezekiel', am: 'ሕዝቅኤል', abbreviations: ['ሕዝ'] },
  { index: 27, en: 'Daniel', am: 'ዳንኤል', abbreviations: ['ዳን'] },
  { index: 28, en: 'Hosea', am: 'ሆሴዕ', abbreviations: ['ሆሴ'] },
  { index: 29, en: 'Joel', am: 'ኢዮኤል', abbreviations: ['ኢዮኤ'] },
  { index: 30, en: 'Amos', am: 'አሞጽ', abbreviations: ['አሞጽ'] },
  { index: 31, en: 'Obadiah', am: 'አብድዩ', abbreviations: ['አብ'] },
  { index: 32, en: 'Jonah', am: 'ዮናስ', abbreviations: ['ዮናስ'] },
  { index: 33, en: 'Micah', am: 'ሚክያስ', abbreviations: ['ሚክ'] },
  { index: 34, en: 'Nahum', am: 'ናሆም', abbreviations: ['ናሆም'] },
  { index: 35, en: 'Habakkuk', am: 'ዕንባቆም', abbreviations: ['ዕንባ'] },
  { index: 36, en: 'Zephaniah', am: 'ሶፎንያስ', abbreviations: ['ሶፎ'] },
  { index: 37, en: 'Haggai', am: 'ሐጌ', abbreviations: ['ሐጌ'] },
  { index: 38, en: 'Zechariah', am: 'ዘካርያስ', abbreviations: ['ዘካ'] },
  { index: 39, en: 'Malachi', am: 'ሚልክያስ', abbreviations: ['ሚል'] },
  { index: 40, en: 'Matthew', am: 'ማቴዎስ', abbreviations: ['ማቴ'] },
  { index: 41, en: 'Mark', am: 'ማርቆስ', abbreviations: ['ማር'] },
  { index: 42, en: 'Luke', am: 'ሉቃስ', abbreviations: ['ሉቃ'] },
  { index: 43, en: 'John', am: 'ዮሐንስ', abbreviations: ['ዮሐ'] },
  { index: 44, en: 'Acts', am: 'ሐዋርያት', abbreviations: ['ሐዋ'] },
  { index: 45, en: 'Romans', am: 'ሮሜ', abbreviations: ['ሮሜ'] },
  { index: 46, en: '1 Corinthians', am: '1ኛ ቆሮንቶስ', abbreviations: ['1ኛ ቆሮ'] },
  { index: 47, en: '2 Corinthians', am: '2ኛ ቆሮንቶስ', abbreviations: ['2ኛ ቆሮ'] },
  { index: 48, en: 'Galatians', am: 'ገላትያ', abbreviations: ['ገላ'] },
  { index: 49, en: 'Ephesians', am: 'ኤፌሶን', abbreviations: ['ኤፌ'] },
  { index: 50, en: 'Philippians', am: 'ፊልጵስዩስ', abbreviations: ['ፊልጵ'] },
  { index: 51, en: 'Colossians', am: 'ቆላስይስ', abbreviations: ['ቆላ'] },
  { index: 52, en: '1 Thessalonians', am: '1ኛ ተሰሎንቄ', abbreviations: ['1ኛ ተሰ'] },
  { index: 53, en: '2 Thessalonians', am: '2ኛ ተሰሎንቄ', abbreviations: ['2ኛ ተሰ'] },
  { index: 54, en: '1 Timothy', am: '1ኛ ጢሞቴዎስ', abbreviations: ['1ኛ ጢሞ'] },
  { index: 55, en: '2 Timothy', am: '2ኛ ጢሞቴዎስ', abbreviations: ['2ኛ ጢሞ'] },
  { index: 56, en: 'Titus', am: 'ቲቶ', abbreviations: ['ቲቶ'] },
  { index: 57, en: 'Philemon', am: 'ፊልሞና', abbreviations: ['ፊልሞ'] },
  { index: 58, en: 'Hebrews', am: 'ዕብራውያን', abbreviations: ['ዕብ'] },
  { index: 59, en: 'James', am: 'ያዕቆብ', abbreviations: ['ያዕ'] },
  { index: 60, en: '1 Peter', am: '1ኛ ጴጥሮስ', abbreviations: ['1ኛ ጴጥ'] },
  { index: 61, en: '2 Peter', am: '2ኛ ጴጥሮስ', abbreviations: ['2ኛ ጴጥ'] },
  { index: 62, en: '1 John', am: '1ኛ ዮሐንስ', abbreviations: ['1ኛ ዮሐ'] },
  { index: 63, en: '2 John', am: '2ኛ ዮሐንስ', abbreviations: ['2ኛ ዮሐ'] },
  { index: 64, en: '3 John', am: '3ኛ ዮሐንስ', abbreviations: ['3ኛ ዮሐ'] },
  { index: 65, en: 'Jude', am: 'ይሁዳ', abbreviations: ['ይሁዳ'] },
  { index: 66, en: 'Revelation', am: 'ራእይ', abbreviations: ['ራእ'] },
]
