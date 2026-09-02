package org.abide.focus

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log

/**
 * What we did to the phone, remembered outside the app's memory.
 *
 * Everything here exists because of one failure: leaving a member's phone silent
 * after a prayer session they walked away from. Nothing may depend on the React
 * Native runtime still being alive, because in the common case — home button, app
 * backgrounded, phone pocketed — it may not be by the time the session should end.
 *
 * So the fact that we changed Do Not Disturb, and what it was before, lives in
 * SharedPreferences. It survives the process being killed, and it is what lets a
 * later launch notice the phone is still silenced and put it back.
 */
internal object FocusState {
  private const val PREFS = "abide.focus"
  private const val KEY_HELD = "dnd_held"
  private const val KEY_PREVIOUS = "previous_filter"
  private const val KEY_DEADLINE = "deadline"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun notifications(context: Context): NotificationManager =
    context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  /**
   * Whether the app is allowed to change the interruption filter.
   *
   * Granted once by the member on a system settings screen; it cannot be requested
   * from a dialog. Without it, everything below silently does nothing, so it is
   * checked before a session claims it will silence anything.
   */
  fun canSilence(context: Context): Boolean =
    notifications(context).isNotificationPolicyAccessGranted

  fun isHeld(context: Context): Boolean = prefs(context).getBoolean(KEY_HELD, false)

  fun deadline(context: Context): Long = prefs(context).getLong(KEY_DEADLINE, 0L)

  /**
   * Silence the phone, remembering what it was set to first.
   *
   * The previous filter is recorded rather than assumed to be "all": a member who
   * already had Do Not Disturb on, or priority-only, must get *their* setting back
   * and not ours.
   */
  fun silence(context: Context, deadline: Long) {
    if (!canSilence(context)) return

    val manager = notifications(context)
    val previous = manager.currentInterruptionFilter

    prefs(context).edit()
      .putBoolean(KEY_HELD, true)
      .putInt(KEY_PREVIOUS, previous)
      .putLong(KEY_DEADLINE, deadline)
      .apply()

    Log.i("AbideFocus", "silencing notifications until $deadline (was $previous)")
    manager.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_NONE)
  }

  /**
   * Put the phone back.
   *
   * Idempotent on purpose. It is called from the service's deadline, from
   * `onTaskRemoved`, from `onDestroy`, from an alarm that fires even if the process
   * is gone, and from the next launch — several of which will often happen for the
   * same session, and none of which may assume it is the only one.
   *
   * @param by which layer is restoring, logged so the overlapping paths can be told
   *   apart afterwards. Inferring which one acted from the resulting state is
   *   guesswork, and this is the feature least worth guessing about.
   */
  fun restore(context: Context, by: String = "unknown"): Boolean {
    val prefs = prefs(context)
    if (!prefs.getBoolean(KEY_HELD, false)) return false

    val previous = prefs.getInt(KEY_PREVIOUS, NotificationManager.INTERRUPTION_FILTER_ALL)
    prefs.edit().putBoolean(KEY_HELD, false).putLong(KEY_DEADLINE, 0L).apply()

    if (canSilence(context)) {
      val manager = notifications(context)
      /*
       * `UNKNOWN` is what the system reports when it has no opinion, and passing it
       * back is rejected. Falling back to `ALL` means the worst case is a phone that
       * rings when it might have been on priority-only — never one that stays mute.
       */
      val target =
        if (previous == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) {
          NotificationManager.INTERRUPTION_FILTER_ALL
        } else {
          previous
        }
      manager.setInterruptionFilter(target)
    }
    Log.i("AbideFocus", "restored notifications (by $by, filter $previous)")
    return true
  }

  /** Android 14 requires a foreground service type; older versions ignore it. */
  val needsServiceType: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
}
