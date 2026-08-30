import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SessionProvider } from '../src/lib/session'
import { ProfileProvider } from '../src/lib/profile'

export default function RootLayout() {
  return (
    <SessionProvider>
      <ProfileProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#faf7f0' } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="day/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="streak" options={{ presentation: 'modal' }} />
        </Stack>
      </ProfileProvider>
    </SessionProvider>
  )
}
