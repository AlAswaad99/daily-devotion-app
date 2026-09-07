import { useEffect, useRef, useState } from 'react'
import {
  Pressable, StyleSheet, Text, TextInput, View, type TextStyle,
} from 'react-native'
import { useProfile } from '../lib/profile'
import { lineHeightFor, translate } from '../lib/i18n'
import { fonts, theme } from '../lib/theme'

/**
 * A reflection box that saves itself, with a button that says so.
 *
 * Reflections are optional and never a completion condition, so there is no save button
 * to *forget*: typing stops, and a moment later it is written locally and queued. The
 * debounce exists because every keystroke would otherwise be an outbox row, and the
 * conflict rule compares `updated_at` — one row per pause is the right granularity for
 * "last write wins".
 *
 * The design draws a Save button, and it earns its place even with autosave behind it:
 * it tells a member their words are kept, and pressing it flushes the pending write
 * immediately rather than waiting out the pause. What it never does is gate anything.
 */
const SAVE_AFTER_MS = 900

export function ReflectionField({
  value,
  onSave,
  inputStyle,
  placeholder,
  /** The reader shows the Save button; the summary's four cards would be a wall of them. */
  showSave = false,
  saveLabel,
}: {
  value: string
  onSave: (text: string) => Promise<void>
  /** The summary screen insets its fields inside a card; the reader does not. */
  inputStyle?: TextStyle | undefined
  placeholder?: string | undefined
  showSave?: boolean
  saveLabel?: string | undefined
}) {
  const { t, language } = useProfile()
  const [text, setText] = useState(value)
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const f = fonts(language)

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

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    void onSave(text).then(() => setSaved(true))
  }

  const ready = text.trim().length > 0

  return (
    <View style={styles.wrap}>
      <TextInput
        style={[
          styles.input,
          { fontFamily: f.body, lineHeight: lineHeightFor(language, 16) },
          inputStyle,
        ]}
        placeholder={placeholder ?? t('writePlaceholder')}
        placeholderTextColor={theme.color.inkMuted}
        multiline
        textAlignVertical="top"
        value={text}
        onChangeText={change}
      />

      {showSave ? (
        <View style={styles.row}>
          <Text style={[styles.note, { fontFamily: f.label }]}>
            {saved ? t('savedNote') : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            style={[styles.save, !ready && styles.saveOff]}
            onPress={flush}
          >
            <Text
              style={[styles.saveText, { fontFamily: f.label }, !ready && styles.saveTextOff]}
            >
              {saveLabel ?? t('saveReflectionBtn')}
            </Text>
          </Pressable>
        </View>
      ) : (
        saved && <Text style={[styles.quiet, { fontFamily: f.ui }]}>{t('savedOnThisPhone')}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  /* Inset, borderless: it sits inside a white card that already has an edge. */
  input: {
    minHeight: 96,
    borderRadius: 12,
    backgroundColor: theme.color.field,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#2c3318',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  note: { flex: 1, fontSize: 12, color: theme.color.accent },
  save: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: theme.color.inkDeep,
  },
  saveOff: { backgroundColor: theme.color.ctaOff },
  saveText: { fontSize: 13, color: theme.color.accentBright },
  saveTextOff: { color: theme.color.inkFaint },
  quiet: { fontSize: 11, color: theme.color.inkMuted, textAlign: 'right' },
})
