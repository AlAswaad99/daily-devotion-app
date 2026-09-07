import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Language } from '@abide/domain'
import { UiText } from './ui'
import { fonts, theme } from '../lib/theme'

/**
 * Two cards side by side, each a script tag and its name.
 *
 * Shared between Settings (both the interface-language and scripture-language rows)
 * and the Bible reader's options sheet, which writes to the same `reader_language`
 * column Settings does — one picker, two entry points.
 */
export function LanguageCards({
  value,
  onChange,
  language,
}: {
  value: Language
  onChange: (next: Language) => void
  language: Language
}) {
  return (
    <View style={styles.langRow}>
      {(['en', 'am'] as const).map((code) => {
        const on = value === code
        return (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.langCard, on && styles.langCardOn]}
            onPress={() => onChange(code)}
          >
            <View style={[styles.langChip, on && styles.langChipOn]}>
              <Text
                style={[
                  styles.langChipText,
                  { fontFamily: fonts(code).labelStrong },
                  on && styles.langChipTextOn,
                ]}
              >
                {code === 'en' ? 'EN' : 'አማ'}
              </Text>
            </View>
            <UiText
              language={code}
              size={14.5}
              colour={on ? theme.color.onInk : theme.color.inkSecondary}
            >
              {code === 'en' ? 'English' : 'አማርኛ'}
            </UiText>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  langRow: { flexDirection: 'row', gap: 10 },
  langCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
  },
  langCardOn: { backgroundColor: theme.color.inkDeep, borderColor: theme.color.inkDeep },
  langChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.panel,
  },
  langChipOn: { backgroundColor: 'rgba(169,200,106,.2)' },
  langChipText: {
    fontSize: 11,
    lineHeight: 13,
    color: theme.color.kicker,
    includeFontPadding: false,
  },
  langChipTextOn: { color: theme.color.accentBright },
})
