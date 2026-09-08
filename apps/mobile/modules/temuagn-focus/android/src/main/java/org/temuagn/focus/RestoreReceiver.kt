package org.temuagn.focus

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The layer that does not need the app to exist.
 *
 * An alarm delivered here survives the process being killed — by the system under
 * memory pressure, or by one of the aggressive power managers common on the phones
 * many members carry, which often kill without firing `onTaskRemoved` at all. If
 * everything else has failed, this still gives the phone its notifications back.
 *
 * Also runs on boot: Do Not Disturb persists across a restart, so a phone that died
 * mid-session would otherwise come back up silent.
 */
class RestoreReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_RESTORE = "org.temuagn.focus.RESTORE"
  }

  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      ACTION_RESTORE -> FocusState.restore(context, "alarm backstop")
      Intent.ACTION_BOOT_COMPLETED -> FocusState.restore(context, "boot")
    }
  }
}
