import { useFonts } from 'expo-font'

/**
 * The bundled type stack.
 *
 * Noto Sans Ethiopic and Noto Serif Ethiopic, both SIL OFL and both covering
 * Ethiopic and Latin in one family. The licence text ships alongside them in
 * `assets/fonts/OFL.txt`, which is the condition of using them.
 *
 * Registered as separate weights rather than as the variable fonts they are upstream:
 * Android renders only the default instance of a variable font through React Native,
 * so a `fontWeight: '600'` would have been synthesised — a smeared fake bold — rather
 * than the real semibold cut. Ethiopic script shows that up badly.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    NotoSans: require('../../assets/fonts/NotoSansEthiopic-Regular.ttf'),
    NotoSansMedium: require('../../assets/fonts/NotoSansEthiopic-SemiBold.ttf'),
    NotoSansBold: require('../../assets/fonts/NotoSansEthiopic-Bold.ttf'),
    NotoSerif: require('../../assets/fonts/NotoSerifEthiopic-Regular.ttf'),
    NotoSerifMedium: require('../../assets/fonts/NotoSerifEthiopic-SemiBold.ttf'),
  })

  /*
   * A font that fails to load must not hold the app hostage. Rendering in the
   * system face is a worse-looking app; blocking on it is no app at all, and this
   * is the screen someone opens at six in the morning to read one page.
   */
  return loaded || error !== null
}
