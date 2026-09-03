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
    Newsreader: require('../../assets/fonts/newsreader_regular.ttf'),
    NewsreaderMedium: require('../../assets/fonts/newsreader_medium.ttf'),
    NewsreaderItalic: require('../../assets/fonts/newsreader_italic.ttf'),
    Anton: require('../../assets/fonts/anton_regular.ttf'),

    /*
     * Noto, retained transitionally.
     *
     * The flat `theme.font.*` keys still resolve here, and screens that have not been
     * restyled yet still use them. Repointing those at Newsreader would render Amharic
     * as tofu on every one of them, because the Latin faces carry no Ethiopic coverage
     * while Noto carries both. These come out with the last unrestyled screen.
     */
    NotoSans: require('../../assets/fonts/NotoSansEthiopic-Regular.ttf'),
    NotoSansMedium: require('../../assets/fonts/NotoSansEthiopic-SemiBold.ttf'),
    NotoSansBold: require('../../assets/fonts/NotoSansEthiopic-Bold.ttf'),
    NotoSerif: require('../../assets/fonts/NotoSerifEthiopic-Regular.ttf'),
    NotoSerifMedium: require('../../assets/fonts/NotoSerifEthiopic-SemiBold.ttf'),
  })

  /*
   * A font that fails to load must not hold the app hostage. Rendering in the system
   * face is a worse-looking app; blocking on it is no app at all, and this is the
   * screen someone opens at six in the morning to read one page.
   */
  return loaded || error !== null
}
