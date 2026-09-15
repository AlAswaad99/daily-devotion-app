import type { AlertButton } from 'react-native'

/**
 * The web twin of `alert.ts`. `react-native-web`'s own `Alert.alert` is an
 * unimplemented stub (`static alert() {}`) — it shows nothing and, worse, never
 * calls any button's `onPress`, so a "done anyway?" confirmation silently does
 * nothing and a destructive action's confirm button silently never fires. This
 * collapses onto the browser's own dialogs instead: `window.alert` for a plain
 * message, `window.confirm` for two-plus buttons.
 *
 * A browser confirm only ever offers OK/Cancel, so custom button text (e.g.
 * "Mark done anyway") is not preserved — the title and message still are, and a
 * real dialog that does the right thing beats a silent no-op.
 */
export function alert(title: string, message?: string, buttons?: AlertButton[]): void {
  const text = [title, message].filter(Boolean).join('\n\n')
  const list = buttons && buttons.length > 0 ? buttons : undefined

  if (!list || list.length === 1) {
    window.alert(text)
    list?.[0]?.onPress?.()
    return
  }

  const cancelIndex = list.findIndex((b) => b.style === 'cancel')
  const cancelButton = cancelIndex >= 0 ? list[cancelIndex] : undefined
  const confirmButton = list.find((b) => b !== cancelButton) ?? list[list.length - 1]!

  if (window.confirm(text)) confirmButton.onPress?.()
  else cancelButton?.onPress?.()
}
