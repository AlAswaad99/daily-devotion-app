import { useState } from 'react'
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text,
  TextInput, View,
} from 'react-native'
import { supabase } from '../src/lib/supabase'

/**
 * Email + password is the development default, not a decision. Auth methods are
 * still open (OPEN_QUESTIONS.md Q12) — everything provider-specific is confined to
 * this screen and `supabase.auth`, so adding Google or phone/OTP later touches
 * nothing else.
 *
 * The join code is how a new account gets a church and ministry; it is redeemed
 * server-side by `redeem_join_code`, because the client is never allowed to read
 * the join_codes table.
 */
export default function SignIn() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        const { error: joinError } = await supabase.rpc('redeem_join_code', {
          p_code: joinCode,
          p_display_name: displayName,
        })
        if (joinError) throw joinError
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Abide</Text>
      <Text style={styles.subtitle}>
        {mode === 'signIn' ? 'Welcome back.' : 'Join your ministry.'}
      </Text>

      {mode === 'signUp' && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            value={displayName}
            onChangeText={setDisplayName}
          />
          <TextInput
            style={styles.input}
            placeholder="Join code"
            autoCapitalize="characters"
            value={joinCode}
            onChangeText={setJoinCode}
          />
        </>
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.button} onPress={submit} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {mode === 'signIn' ? 'Sign in' : 'Create account'}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
        <Text style={styles.switch}>
          {mode === 'signIn' ? 'I have a join code' : 'I already have an account'}
        </Text>
      </Pressable>

      <View style={styles.spacer} />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { fontSize: 16, opacity: 0.6, marginBottom: 12 },
  input: {
    borderWidth: 1, borderColor: '#d8d8d8', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  button: {
    backgroundColor: '#1b1b1b', borderRadius: 999, paddingVertical: 14,
    alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switch: { textAlign: 'center', marginTop: 12, opacity: 0.7 },
  error: { color: '#b00020' },
  spacer: { height: 40 },
})
