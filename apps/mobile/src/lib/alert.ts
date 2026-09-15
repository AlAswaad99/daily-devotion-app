import { Alert, type AlertButton } from 'react-native'

/**
 * The native twin of `alert.web.ts`. Same signature, thin passthrough to RN's own
 * `Alert.alert` — the indirection exists so every call site imports one thing that
 * behaves the same on both platforms, rather than `react-native-web`'s `Alert.alert`
 * (an unimplemented stub: `static alert() {}`) silently swallowing both the message
 * and every button's `onPress`.
 */
export function alert(title: string, message?: string, buttons?: AlertButton[]): void {
  Alert.alert(title, message, buttons)
}
