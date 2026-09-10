import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { Image, Platform, StyleSheet, View } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { SessionProvider } from '../src/lib/session'
import { ProfileProvider } from '../src/lib/profile'
import { useAppFonts } from '../src/lib/fonts'
import { theme } from '../src/lib/theme'
import { auditEnabled, loadAudit, useAudit } from '../src/lib/audit'

/* Audit mode only (dev): the design frame's safe area, so headers line up with it. */
const DESIGN_INSETS = { top: 44, bottom: 0, left: 0, right: 0 }

/*
 * Held open only long enough to swap it for `SplashOverlay` below, not until
 * fonts are ready — Android 12+'s native splash-screen API has no "cover" mode
 * of its own, whatever `resizeMode` app.json asks for: it can only ever show
 * the image as a small centered icon on a solid background, the same way an
 * app icon renders. A full-bleed splash that actually matches the design only
 * exists as a JS-rendered view, so the native one's job is just to not flash
 * blank before that view is on screen — nothing more.
 */
void SplashScreen.preventAutoHideAsync().catch(() => {})

/**
 * The real splash: a plain full-bleed `Image`, which — unlike the native
 * splash-screen API — actually supports `resizeMode="cover"` on every
 * platform. It's the same asset app.json points the native splash at, so the
 * handoff between the two is invisible.
 */
function SplashOverlay() {
  return (
    <View style={styles.splash}>
      <Image
        source={require('../assets/images/splash.png')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
    </View>
  )
}

export default function RootLayout() {
  const fontsReady = useAppFonts()
  const audit = useAudit()

  useEffect(() => {
    if (auditEnabled) void loadAudit()
  }, [])

  // `SplashOverlay` covers the screen from the very first frame, so the native
  // splash can hand off to it immediately rather than waiting on fonts.
  useEffect(() => {
    void SplashScreen.hideAsync()
  }, [])

  // Tapping a notification should land somewhere useful rather than just opening
  // the app. The kind travels in the payload precisely so this can decide.
  useEffect(() => {
    if (Platform.OS === 'web') return
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const kind = response.notification.request.content.data?.kind
      if (kind === 'repair_available' || kind === 'streak_at_risk' || kind === 'milestone') {
        router.push('/streak')
      } else {
        router.push('/')
      }
    })
    return () => subscription.remove()
  }, [])

  /*
   * Held until the faces are in memory. Ethiopic in the system fallback has visibly
   * different metrics, so rendering first and swapping after reflows every screen in
   * front of the reader — worse than a moment of nothing. `SplashOverlay`, not a
   * blank screen, fills this gap now that the native splash hands off immediately.
   */
  if (!fontsReady) return <SplashOverlay />

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    {/*
      * On a phone this cap never binds — every device is narrower than it. On a wide
      * browser window it stops every screen (the whole app is one Stack, so this is
      * the one place that reaches all of them) from stretching phone-width layouts
      * edge to edge; `windowSurround` fills the rest of the browser window so the
      * letterboxing reads as intentional rather than a layout bug.
      */}
    <View style={styles.windowSurround}>
    <View style={styles.appColumn}>
    <SafeAreaProvider>
      <SessionProvider>
      <ProfileProvider>
        <StatusBar style="auto" />
        <SafeAreaInsetsContext.Provider value={audit.insets ? DESIGN_INSETS : null}>
        <BottomSheetModalProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="day/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="book/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="streak" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="bible-compare" options={{ presentation: 'modal' }} />
          <Stack.Screen name="focus-history" options={{ presentation: 'modal' }} />
        </Stack>
        </BottomSheetModalProvider>
        </SafeAreaInsetsContext.Provider>
      </ProfileProvider>
      </SessionProvider>
    </SafeAreaProvider>
    </View>
    </View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  windowSurround: { flex: 1, backgroundColor: theme.color.inkDarkest },
  /** Tablet-width cap: 768 is the common iPad-portrait breakpoint. */
  appColumn: { flex: 1, width: '100%', maxWidth: 768, alignSelf: 'center' },
  splash: { flex: 1, backgroundColor: '#0a1005' },
})
