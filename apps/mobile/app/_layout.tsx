import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { SessionProvider } from '../src/lib/session'
import { ProfileProvider } from '../src/lib/profile'
import { useAppFonts } from '../src/lib/fonts'
import { theme } from '../src/lib/theme'

export default function RootLayout() {
  const fontsReady = useAppFonts()

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
    <SafeAreaProvider>
      <SessionProvider>
      <ProfileProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="day/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="book/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="streak" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        </Stack>
      </ProfileProvider>
      </SessionProvider>
    </SafeAreaProvider>
  )
}
