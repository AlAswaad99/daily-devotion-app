import { useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Language } from '@abide/domain'
import { translate } from '../../lib/i18n'
import { RiseFade } from '../ui'
import { fonts, theme } from '../../lib/theme'

export const CODE_LENGTH = 6

/**
 * Six character boxes over one real input.
 *
 * There is no six-field version of this: separate inputs mean managing focus on every
 * keystroke and on backspace, and they defeat SMS autofill and paste. So the boxes are
 * decoration drawn over a single transparent `TextInput` that holds the whole value,
 * and tapping anywhere focuses it.
 */
export function CodeEntry({
  value,
  onChange,
  language,
}: {
  value: string
  onChange: (next: string) => void
  language: Language
}) {
  const input = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const f = fonts(language)
  const complete = value.length === CODE_LENGTH

  /*
   * Join codes are upper-case alphanumeric. Normalising on the way in rather than
   * validating on the way out means someone typing lower case or pasting a code with a
   * stray space never sees an error for something we could simply accept.
   */
  const handle = (next: string) =>
    onChange(next.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH))

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="none"
        style={styles.boxes}
        onPress={() => input.current?.focus()}
      >
        {Array.from({ length: CODE_LENGTH }).map((_, index) => {
          const char = value[index]
          /*
           * The caret box is the first empty one — or the last box once the code is
           * full, so the highlight does not vanish on the final keystroke.
           */
          /*
           * The design highlights the box the next character will land in whether or not
           * the field has focus — on a fresh screen that is the only thing telling a
           * member where to start typing.
           */
          const active = !complete && index === value.length
          return (
            <View
              key={index}
              style={[
                styles.box,
                char !== undefined && styles.boxFilled,
                complete && styles.boxComplete,
                active && styles.boxActive,
              ]}
            >
              <Text style={[styles.char, { fontFamily: f.numeric }]}>{char ?? ''}</Text>
            </View>
          )
        })}
      </Pressable>

      <TextInput
        ref={input}
        value={value}
        onChangeText={handle}
        maxLength={CODE_LENGTH}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'visible-password'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Spoken as one field, because that is what it is.
        accessibilityLabel={translate('joinTitle', language)}
        style={styles.hiddenInput}
        /* caretHidden, not opacity 0: the boxes draw their own caret highlight. */
        caretHidden
      />

      <Text style={[styles.hint, { fontFamily: f.uiMedium }]}>{translate('codeHint', language)}</Text>

      {complete && (
        <RiseFade style={styles.accepted}>
          <View style={styles.tick}>
            <Text style={styles.tickMark}>✓</Text>
          </View>
          <Text style={[styles.acceptedText, { fontFamily: f.label }]}>
            {translate('codeComplete', language)}
          </Text>
        </RiseFade>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: 30 },
  boxes: { flexDirection: 'row', gap: 8 },
  box: {
    flex: 1,
    height: 58,
    borderRadius: theme.radius.code,
    backgroundColor: theme.color.surface,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: {
    borderColor: theme.color.accent,
    /* The design's 3px ring, as the only outward glow RN gives without another view. */
    shadowColor: theme.color.accentMid,
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  /* A typed box that is not yet the whole code: darker than empty, quieter than done. */
  boxFilled: { borderColor: '#b9c49a' },
  boxComplete: { borderColor: theme.color.accentMid },
  char: { fontSize: 26, color: theme.color.ink },

  /*
   * Sits exactly over the boxes and is invisible but focusable. Zero opacity rather
   * than `display: none`, which would take it out of the tree and stop it taking input.
   */
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    bottom: undefined,
    height: 58,
    opacity: 0,
    color: 'transparent',
  },

  hint: {
    marginTop: 10,
    paddingLeft: 4,
    fontSize: 11.5,
    color: theme.color.inkFaint,
  },

  accepted: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(94,126,51,.1)',
  },
  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.color.accentMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMark: { fontSize: 15, color: theme.color.inkDeep, lineHeight: 18 },
  acceptedText: { fontSize: 14, color: theme.color.accentDeep },
})
