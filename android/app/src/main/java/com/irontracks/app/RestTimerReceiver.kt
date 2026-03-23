package com.irontracks.app

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * BroadcastReceiver that fires when an AlarmManager alarm triggers.
 * Handles both rest timer notifications and generic app notifications.
 */
class RestTimerReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "com.irontracks.REST_TIMER_FIRE" -> handleRestTimer(context, intent)
            "com.irontracks.APP_NOTIFICATION" -> handleAppNotification(context, intent)
        }
    }

    private fun handleRestTimer(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: "rest_timer"
        val title = intent.getStringExtra("title") ?: "⏰ Tempo Esgotado!"
        val body = intent.getStringExtra("body") ?: "Hora de voltar para o treino!"
        val repeatCount = intent.getIntExtra("repeatCount", 0)
        val repeatEverySeconds = intent.getIntExtra("repeatEverySeconds", 5)
        val currentRepeat = intent.getIntExtra("currentRepeat", 0)

        val notifId = id.hashCode() and 0x7FFFFFFF

        // Cancel the ongoing timer notification
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(notifId)

        // Show the alarm notification
        showAlarmNotification(context, notifId, title, body)

        // Trigger vibration
        triggerAlarmVibration(context)

        // Schedule repeat if needed
        if (currentRepeat < repeatCount && repeatEverySeconds > 0) {
            scheduleRepeat(context, id, title, body, repeatCount, repeatEverySeconds, currentRepeat + 1)
        }
    }

    private fun handleAppNotification(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val title = intent.getStringExtra("title") ?: ""
        val body = intent.getStringExtra("body") ?: ""
        val notifId = id.hashCode() and 0x7FFFFFFF

        val builder = NotificationCompat.Builder(context, IronTracksNativePlugin.CHANNEL_APP)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)

        val nmc = NotificationManagerCompat.from(context)
        try {
            nmc.notify(notifId, builder.build())
        } catch (_: SecurityException) {}
    }

    private fun showAlarmNotification(context: Context, notifId: Int, title: String, body: String) {
        val builder = NotificationCompat.Builder(context, IronTracksNativePlugin.CHANNEL_REST)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setDefaults(NotificationCompat.DEFAULT_ALL)

        val nmc = NotificationManagerCompat.from(context)
        try {
            nmc.notify(notifId + 1000, builder.build())
        } catch (_: SecurityException) {}
    }

    private fun triggerAlarmVibration(context: Context) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vm?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

        vibrator?.vibrate(
            VibrationEffect.createWaveform(
                longArrayOf(0, 400, 200, 400, 200, 400),
                intArrayOf(0, 255, 0, 255, 0, 255),
                -1
            )
        )
    }

    private fun scheduleRepeat(
        context: Context,
        id: String,
        title: String,
        body: String,
        repeatCount: Int,
        repeatEverySeconds: Int,
        currentRepeat: Int
    ) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, RestTimerReceiver::class.java).apply {
            action = "com.irontracks.REST_TIMER_FIRE"
            putExtra("id", id)
            putExtra("title", title)
            putExtra("body", body)
            putExtra("repeatCount", repeatCount)
            putExtra("repeatEverySeconds", repeatEverySeconds)
            putExtra("currentRepeat", currentRepeat)
        }

        val requestCode = (id.hashCode() and 0x7FFFFFFF) + currentRepeat
        val pendingIntent = PendingIntent.getBroadcast(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val triggerMs = SystemClock.elapsedRealtime() + (repeatEverySeconds * 1000L)
        try {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerMs, pendingIntent
            )
        } catch (_: SecurityException) {
            alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerMs, pendingIntent)
        }
    }
}
