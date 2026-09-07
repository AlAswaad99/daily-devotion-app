import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
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

export default function RootLayout() {
  const fontsReady = useAppFonts()
  const audit = useAudit()

  useEffect(() => {
    if (auditEnabled) void loadAudit()
  }, [])

  // Tapping a notification should land somewhere useful rather than just opening
  // the app. The kind travels in the payload precisely so this can decide.
  useEffect(() => {
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
   * front of the reader — worse than a moment of nothing.
   */
  if (!fontsReady) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  )
}
