import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alert } from '../src/lib/alert.web'

/**
 * `alert.web.ts` exists because `react-native-web`'s own `Alert.alert` is an
 * unimplemented stub — `static alert() {}` — that shows nothing and never calls a
 * button's `onPress`. A member tapping "Done" without meeting the completion bar,
 * or "Delete my data" in Settings, saw the confirmation silently do nothing on web.
 * These pin the browser-dialog behaviour that replaces it.
 */
describe('alert (web)', () => {
  let windowAlert: ReturnType<typeof vi.fn>
  let windowConfirm: ReturnType<typeof vi.fn>

  beforeEach(() => {
    windowAlert = vi.fn()
    windowConfirm = vi.fn()
    vi.stubGlobal('window', { alert: windowAlert, confirm: windowConfirm })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('with no buttons, shows window.alert with the title and message', () => {
    alert('Title', 'Body')
    expect(windowAlert).toHaveBeenCalledWith('Title\n\nBody')
    expect(windowConfirm).not.toHaveBeenCalled()
  })

  it('with one button, shows window.alert and still fires its onPress', () => {
    const onPress = vi.fn()
    alert('Title', 'Body', [{ text: 'OK', onPress }])
    expect(windowAlert).toHaveBeenCalledWith('Title\n\nBody')
    expect(onPress).toHaveBeenCalledOnce()
  })

  it('with a cancel + confirm pair, confirming the browser dialog fires the non-cancel onPress', () => {
    windowConfirm.mockReturnValue(true)
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    alert('Finished already?', 'Mark done anyway?', [
      { text: 'Keep reading', style: 'cancel', onPress: onCancel },
      { text: 'Mark done', onPress: onConfirm },
    ])
    expect(windowConfirm).toHaveBeenCalledWith('Finished already?\n\nMark done anyway?')
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('with a cancel + confirm pair, dismissing the browser dialog fires the cancel onPress', () => {
    windowConfirm.mockReturnValue(false)
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    alert('Delete your data?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ])
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('with a cancel button that has no onPress, dismissing does not throw', () => {
    windowConfirm.mockReturnValue(false)
    expect(() =>
      alert('Title', 'Body', [{ text: 'Cancel', style: 'cancel' }, { text: 'OK', onPress: vi.fn() }]),
    ).not.toThrow()
  })
})
