import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Redirect } from 'expo-router'
import { supabase } from '../src/lib/supabase'
import { useSession } from '../src/lib/session'

interface TodayRow {
  id: string
  day_number: number
  topic_en: string
  topic_am: string
  scheduled_date: string
}

/**
 * Phase 0 placeholder for Today. It exists to prove the whole path end to end:
 * a signed-in device reads the day the ministry is on, through RLS, with no
 * service-role key anywhere. The real screen arrives in Phase 2.
 */
export default function Today() {
  const { session, loading } = useSession()
  const [day, setDay] = useState<TodayRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!session) return
    supabase
      .from('devotion_days')
      .select('id, day_number, topic_en, topic_am, scheduled_date')
      .order('scheduled_date', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setDay(data)
        setFetching(false)
      })
  }, [session])

  if (loading) return <Centered><ActivityIndicator /></Centered>
  if (!session) return <Redirect href="/sign-in" />

  return (
    <Centered>
      <Text style={styles.eyebrow}>Abide · Phase 0</Text>
      {fetching && <ActivityIndicator />}
      {error && <Text style={styles.error}>{error}</Text>}
      {!fetching && !day && (
        <Text style={styles.body}>No scheduled day is visible to this account.</Text>
      )}
      {day && (
        <>
          <Text style={styles.title}>{day.topic_en}</Text>
          <Text style={styles.body}>{day.topic_am}</Text>
          <Text style={styles.meta}>
            Day {day.day_number} · {day.scheduled_date}
          </Text>
        </>
      )}
      <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.5 },
  title: { fontSize: 24, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 16, textAlign: 'center', opacity: 0.8 },
  meta: { fontSize: 13, opacity: 0.5 },
  error: { color: '#b00020', textAlign: 'center' },
  button: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1 },
  buttonText: { fontSize: 15 },
})
