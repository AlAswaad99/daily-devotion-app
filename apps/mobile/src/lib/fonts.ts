import { useFonts } from 'expo-font'

/**
 * The bundled type stack.
 *
 * Two families per role, because the approved design treats English and Amharic as two
 * voices rather than one: Archivo/Newsreader/Anton carry the Latin, and the
 * Nokia/Niyala/Menbere set carries the Ethiopic. `fonts(language)` in `theme.ts` picks
 * between them; nothing here decides.
 *
 * Every face is a static instance. Archivo and Newsreader ship upstream as variable
 * fonts only, and React Native on Android renders a variable font's default instance
 * and nothing else — a `fontWeight: '700'` against the variable file would silently
 * come back as Regular. The static cuts were pulled per weight from the Google Fonts
 * CSS API for that reason. Menbere is the one exception: it is variable and is used at
 * a single weight, so its default instance is the only one asked for.
 *
 * File names are ASCII snake_case because Android's asset packaging rejects the
 * originals — `ኖኪያ BOLD (4).TTF` fails on the script, the spaces and the parentheses
 * alike.
 *
 * The Noto Ethiopic faces that carried the pre-v3 screens are gone. They were kept only
 * because those screens set Latin and Ethiopic from one family and would have rendered
 * Amharic as tofu without them; every screen now picks its family from `fonts(language)`,
 * so there is nothing left to fall back to and 1.3 MB comes out of the bundle.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    /*
     * Ethiopic — the Amharic voice.
     *
     * Nokia Ethiopic Bold is registered twice under its two design roles (titles and
     * kickers) from one file: the Latin-named `nokia BOLD (4).TTF` in the design
     * uploads is byte-identical to the Ethiopic one, so shipping both would have cost
     * 597 KB for a duplicate.
     */
    NokiaEthiopicBold: require('../../assets/fonts/nokia_ethiopic_bold.ttf'),
    NokiaEthiopicLight: require('../../assets/fonts/nokia_ethiopic_light.ttf'),
    NokiaPureLight: require('../../assets/fonts/nokia_pure_light.ttf'),
    NokiaPureUltraLight: require('../../assets/fonts/nokia_pure_ultralight.otf'),
    Niyala: require('../../assets/fonts/niyala.ttf'),
    Menbere: require('../../assets/fonts/menbere.ttf'),

    /* Latin — the English voice. */
    Archivo: require('../../assets/fonts/archivo_regular.ttf'),
    ArchivoSemiBold: require('../../assets/fonts/archivo_semibold.ttf'),
    ArchivoBold: require('../../assets/fonts/archivo_bold.ttf'),
    /* The design sets kickers and CTA labels at 800; 700 is visibly lighter at 9–11px. */
    ArchivoExtraBold: require('../../assets/fonts/archivo_extrabold.ttf'),
    Newsreader: require('../../assets/fonts/newsreader_regular.ttf'),
    NewsreaderMedium: require('../../assets/fonts/newsreader_medium.ttf'),
    NewsreaderItalic: require('../../assets/fonts/newsreader_italic.ttf'),
    Anton: require('../../assets/fonts/anton_regular.ttf'),

  })

  /*
   * A font that fails to load must not hold the app hostage. Rendering in the system
   * face is a worse-looking app; blocking on it is no app at all, and this is the
   * screen someone opens at six in the morning to read one page.
   */
  return loaded || error !== null
}
