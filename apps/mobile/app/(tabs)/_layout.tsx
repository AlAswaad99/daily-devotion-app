import { Tabs } from 'expo-router'
import { FloatingNav } from '../../src/components/FloatingNav'
import { NavVisibilityProvider } from '../../src/lib/nav-visibility'
import { useProfile } from '../../src/lib/profile'

/**
 * Five tabs: Today · Devotions · Bible · Focus · Reflect.
 *
 * The order is the spec's, not the design's — the design draws Today · Bible · Focus ·
 * Devotions and adds Reflections last, but SPEC.txt fixed this order and the vocabulary
 * with it. What the design does own is the bar itself, which `FloatingNav` draws: an
 * ink sheet with rounded top corners floating over the content rather than a white
 * strip pushing it up.
 *
 * The Amharic labels are the short forms — መጽሐፍ rather than መጽሐፍ ቅዱስ — and ጸሎት for
 * Focus, which names the purpose the spec gives it rather than the mechanic.
 */
export default function TabsLayout() {
  const { language } = useProfile()
  const label = (en: string, am: string) => (language === 'am' ? am : en)

  return (
    <NavVisibilityProvider>
      <Tabs
        /*
         * The bar floats, so it must not reserve layout space: screens clear it with
         * `theme.layout.navClearance` instead. Without this the tab navigator inserts
         * 88px of padding and every screen ends short.
         */
        tabBar={(props) => <FloatingNav {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarPosition: 'bottom',
          sceneStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: label('Today', 'ዛሬ') }} />
        <Tabs.Screen name="devotions" options={{ title: label('Devotions', 'ጥሞና') }} />
        <Tabs.Screen name="bible" options={{ title: label('Bible', 'መጽሐፍ') }} />
        <Tabs.Screen name="focus" options={{ title: label('Focus', 'ጸሎት') }} />
        <Tabs.Screen name="reflect" options={{ title: label('Reflect', 'ማስታወሻ') }} />
      </Tabs>
    </NavVisibilityProvider>
  )
}
