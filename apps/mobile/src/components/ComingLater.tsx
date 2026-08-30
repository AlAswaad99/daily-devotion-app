import { StyleSheet, Text, View } from 'react-native'
import { useProfile } from '../lib/profile'
import type { StringKey } from '../lib/i18n'
import { theme } from '../lib/theme'

/**
 * An honest placeholder. These tabs exist now so the navigation can be judged at
 * full width in both languages; they say plainly that the feature is not built
 * rather than pretending to be empty states.
 */
export function ComingLater({ titleKey, bodyKey }: { titleKey: StringKey; bodyKey: StringKey }) {
  const { t } = useProfile()
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t(titleKey)}</Text>
      <Text style={styles.body}>{t(bodyKey)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space(4),
    gap: theme.space(1),
    backgroundColor: theme.color.bg,
  },
  title: { fontSize: theme.size.title, fontWeight: '600', color: theme.color.ink },
  body: { fontSize: theme.size.body, color: theme.color.inkMuted, textAlign: 'center' },
})
