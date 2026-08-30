import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useProfile } from '../../src/lib/profile'
import { theme } from '../../src/lib/theme'

/**
 * Five tabs: Today · Devotions · Bible · Focus · Reflect.
 *
 * Bible (Phase 7) and Focus (Phase 8) are present but not yet built. They are here
 * rather than added later because the spec's open question — whether the Amharic
 * labels fit at 392px — cannot be answered with three tabs, and discovering the
 * answer in Phase 8 would mean redesigning the navigation at the worst moment.
 *
 * The Amharic labels are deliberately the short forms: መጽሐፍ rather than መጽሐፍ ቅዱስ.
 * If even these overflow on a real 392px screen, the fallback in the spec is to
 * move Bible out of the tab bar and reach it from the devotion detail instead.
 */
export default function TabsLayout() {
  const { language } = useProfile()
  const label = (en: string, am: string) => (language === 'am' ? am : en)

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.inkMuted,
        tabBarStyle: { backgroundColor: theme.color.surface, borderTopColor: theme.color.line },
        // Ethiopic needs a little more room per glyph than Latin at the same size.
        tabBarLabelStyle: { fontSize: language === 'am' ? 10 : 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: label('Today', 'ዛሬ'),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>◔</Text>,
        }}
      />
      <Tabs.Screen
        name="devotions"
        options={{
          title: label('Devotions', 'ጥናቶች'),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>▤</Text>,
        }}
      />
      <Tabs.Screen
        name="bible"
        options={{
          title: label('Bible', 'መጽሐፍ'),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>✝</Text>,
        }}
      />
      <Tabs.Screen
        name="focus"
        options={{
          title: label('Focus', 'ጸሎት'),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>◎</Text>,
        }}
      />
      <Tabs.Screen
        name="reflect"
        options={{
          title: label('Reflect', 'ማስታወሻ'),
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>✎</Text>,
        }}
      />
    </Tabs>
  )
}
