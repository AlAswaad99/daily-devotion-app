import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useProfile } from '../lib/profile'
import { lineHeightFor } from '../lib/i18n'
import { theme } from '../lib/theme'

/**
 * A reflection box that saves itself.
 *
 * Reflections are optional and never a completion condition, so there is no save
 * button to forget: typing stops, and a moment later it is written locally and
 * queued. The debounce exists because every keystroke would otherwise be an outbox
 * row, and the conflict rule compares `updated_at` — one row per pause is the right
 * granularity for "last write wins".
 */
const SAVE_AFTER_MS = 900

export function ReflectionField({
  value,
  onSave,
}: {
  value: string
  onSave: (text: string) => Promise<void>
}) {
  const { t, language } = useProfile()
  const [text, setText] = useState(value)
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Adopt a value that arrived from a sync while this field was idle.
  useEffect(() => {
    setText(value)
  }, [value])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const change = (next: string) => {
    setText(next)
    setSaved(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void onSave(next).then(() => setSaved(true))
    }, SAVE_AFTER_MS)
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        style={[styles.input, { lineHeight: lineHeightFor(language, theme.size.body) }]}
        placeholder={t('reflectionPlaceholder')}
        placeholderTextColor={theme.color.inkMuted}
        multiline
        textAlignVertical="top"
        value={text}
        onChangeText={change}
      />
      {saved && <Text style={styles.saved}>{t('savedOnThisPhone')}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    padding: theme.space(1.5),
    fontSize: theme.size.body,
    color: theme.color.ink,
  },
  saved: { fontSize: theme.size.micro, color: theme.color.inkMuted, textAlign: 'right' },
})
