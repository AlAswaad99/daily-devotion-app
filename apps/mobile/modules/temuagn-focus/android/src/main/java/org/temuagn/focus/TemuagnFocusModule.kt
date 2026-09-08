package org.temuagn.focus

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What JavaScript is allowed to ask for.
 *
 * Deliberately small. JS starts and ends a session and asks whether the phone is
 * currently silenced by us; it does not hold the timer, does not restore Do Not
 * Disturb, and cannot be the only thing standing between a member and a permanently
 * muted phone. All of that lives in the service, which outlives it.
 */
class TemuagnFocusModule : Module() {

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "no app context" }

  private val activity: Activity?
    get() = appContext.activityProvider?.currentActivity

  override fun definition() = ModuleDefinition {
    Name("TemuagnFocus")

    /** Whether the member has granted the one permission this needs. */
    Function("canSilence") { FocusState.canSilence(context) }

    /**
     * Do Not Disturb access cannot be requested from a dialog — it is granted on a
     * system screen, once. So this opens that screen rather than pretending to ask.
     */
    Function("openSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("isSilencing") { FocusState.isHeld(context) }

    /** Hand the session to the service, with the moment it must end. */
    Function("begin") { durationMs: Double ->
      FocusService.start(context, System.currentTimeMillis() + durationMs.toLong())
    }

    Function("end") { FocusService.stop(context) }

    /**
     * The last line of defence, called when the app opens with no session running.
     *
     * If the phone is still silenced then nothing is going to end that session — the
     * service is gone, killed by a force-stop, a flat battery, or one of the power
     * managers that kill without firing a callback. Restore, and report that it had
     * to, so the app can say so rather than fixing it in silence.
     *
     * Deliberately not conditional on the deadline having passed. A session killed
     * with eight minutes left is still a session nothing will ever end, and waiting
     * for a deadline that no longer has a service behind it would leave the phone
     * silent for exactly as long as the member had asked to pray.
     *
     * The caller must not invoke this while a session is genuinely running; that is
     * enforced on the JavaScript side, which is the only place that knows.
     */
    Function("repair") { FocusState.restore(context, "app launch") }

    /**
     * Screen pinning: offered, never forced.
     *
     * `startLockTask` without device ownership shows a system prompt and stays
     * escapable with back + overview, which is the correct amount of friction here.
     * This is a prayer timer, not a kiosk.
     */
    Function("pin") {
      val current = activity ?: return@Function false
      runCatching { current.startLockTask() }.isSuccess
    }

    Function("unpin") {
      val current = activity ?: return@Function false
      runCatching { current.stopLockTask() }.isSuccess
    }
  }
}
