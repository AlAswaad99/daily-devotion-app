package org.temuagn.focus

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock

/**
 * The prayer session, owned by Android rather than by JavaScript.
 *
 * This is the whole reason the module exists. Nine out of ten members end a session
 * by pressing home; a couple then clear the app from recents. In the first case the
 * JS timer may be throttled or the process reclaimed long before the session is due
 * to end, and in the second it is killed outright — so a session whose ending lives
 * in JS is a session that can leave a phone silent indefinitely.
 *
 * A foreground service survives backgrounding, is told when the task is swiped away,
 * and can hold its own deadline. Three layers restore Do Not Disturb, deliberately
 * overlapping:
 *
 *   1. this service's own deadline, and `onTaskRemoved` / `onDestroy`
 *   2. an alarm, which fires even if this process has been killed
 *   3. a check on next launch, for a force-stop or a reboot
 */
class FocusService : Service() {

  companion object {
    const val ACTION_START = "org.temuagn.focus.START"
    const val ACTION_STOP = "org.temuagn.focus.STOP"
    const val EXTRA_DEADLINE = "deadline"

    private const val CHANNEL = "temuagn.focus"
    private const val NOTIFICATION_ID = 8801

    fun start(context: Context, deadline: Long) {
      val intent = Intent(context, FocusService::class.java)
        .setAction(ACTION_START)
        .putExtra(EXTRA_DEADLINE, deadline)
      context.startForegroundService(intent)
    }

    fun stop(context: Context) {
      context.startService(Intent(context, FocusService::class.java).setAction(ACTION_STOP))
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var ending: Runnable? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        finish()
        return START_NOT_STICKY
      }

      ACTION_START -> {
        val deadline = intent.getLongExtra(EXTRA_DEADLINE, 0L)
        if (deadline <= System.currentTimeMillis()) {
          finish()
          return START_NOT_STICKY
        }

        startForeground(deadline)
        FocusState.silence(this, deadline)
        scheduleAlarm(deadline)

        // The service's own deadline. First to fire in the ordinary case, where the
        // app is simply in the background and this process is still alive.
        ending?.let { handler.removeCallbacks(it) }
        val task = Runnable { finish("deadline reached") }
        ending = task
        handler.postDelayed(task, deadline - System.currentTimeMillis())
      }
    }

    /*
     * Not sticky. If Android kills this service under memory pressure, restarting it
     * with no intent would silence the phone again for a session nobody is in. The
     * alarm is what covers that case, and it restores rather than resumes.
     */
    return START_NOT_STICKY
  }

  /**
   * Swiped out of recents.
   *
   * The behaviour a couple of members described, and the one that kills the process
   * outright. This is the only callback Android gives for it, and it is why the
   * session had to be a service at all.
   */
  override fun onTaskRemoved(rootIntent: Intent?) {
    finish("swiped from recents")
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    FocusState.restore(this, "service destroyed")
    cancelAlarm()
    ending?.let { handler.removeCallbacks(it) }
    super.onDestroy()
  }

  private fun finish(by: String = "session ended") {
    FocusState.restore(this, by)
    cancelAlarm()
    ending?.let { handler.removeCallbacks(it) }
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  /**
   * The backstop.
   *
   * An alarm outlives this process, so a phone that reclaims the app mid-session —
   * common on the aggressively power-managing Android skins many members carry —
   * still has its notifications given back without waiting for the app to be opened.
   * Set a little after the deadline so it only acts when the ordinary path has not.
   */
  private fun scheduleAlarm(deadline: Long) {
    val manager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val at = SystemClock.elapsedRealtime() + (deadline - System.currentTimeMillis()) + 15_000

    manager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, restorePendingIntent())
  }

  private fun cancelAlarm() {
    val manager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    manager.cancel(restorePendingIntent())
  }

  private fun restorePendingIntent(): PendingIntent =
    PendingIntent.getBroadcast(
      this,
      0,
      Intent(this, RestoreReceiver::class.java).setAction(RestoreReceiver.ACTION_RESTORE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  /**
   * The notification is not decoration — it is the honest disclosure that the phone
   * is currently silenced, and the way back into the session.
   */
  private fun startForeground(deadline: Long) {
    val manager = FocusState.notifications(this)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "Prayer", NotificationManager.IMPORTANCE_LOW).apply {
          setShowBadge(false)
          description = "Shown while a prayer session is running"
        },
      )
    }

    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    val minutes = ((deadline - System.currentTimeMillis()) / 60_000).coerceAtLeast(0)
    val notification: Notification = Notification.Builder(this, CHANNEL)
      .setContentTitle("Praying")
      .setContentText(
        if (FocusState.canSilence(this)) "Notifications are silenced · $minutes min"
        else "$minutes min",
      )
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setOngoing(true)
      .setUsesChronometer(true)
      .setWhen(deadline)
      .also { builder -> open?.let { builder.setContentIntent(it) } }
      .build()

    if (FocusState.needsServiceType) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }
}
