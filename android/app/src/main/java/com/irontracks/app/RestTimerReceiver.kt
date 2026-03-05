package com.irontracks.app

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * BroadcastReceiver that fires when a scheduled rest timer alarm goes off.
 * Shows a heads-up notification, plays the default alarm, and vibrates.
 * Also handles SKIP and ADD_30S actions from notification buttons.
 */
class RestTimerReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "com.irontracks.REST_TIMER_FIRED" -> handleTimerFired(context, intent)
            "com.irontracks.REST_TIMER_SKIP" -> handleSkip(context, intent)
            "com.irontracks.REST_TIMER_ADD30" -> handleAdd30(context, intent)
            "com.irontracks.APP_NOTIFICATION" -> handleAppNotification(context, intent)
        }
    }

    private fun handleTimerFired(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: "rest_timer"
        val title = intent.getStringExtra("title") ?: "⏰ Tempo Esgotado!"
        val body = intent.getStringExtra("body") ?: "Hora de voltar para o treino!"

        // Cancel ongoing countdown notification
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(IronTracksNativePlugin.NOTIF_REST_TIMER_ID)

        // Show finished notification
        val builder = NotificationCompat.Builder(context, IronTracksNativePlugin.CHANNEL_REST_TIMER)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        try {
            NotificationManagerCompat.from(context).notify(id.hashCode(), builder.build())
        } catch (_: SecurityException) {}

        // Vibrate
        triggerVibration(context)
    }

    private fun handleSkip(context: Context, intent: Intent) {
        // Dismiss all timer notifications
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(IronTracksNativePlugin.NOTIF_REST_TIMER_ID)
        val id = intent.getStringExtra("id") ?: "rest_timer"
        nm.cancel(id.hashCode())
    }

    private fun handleAdd30(context: Context, intent: Intent) {
        // This is handled client-side via the JS listener; just dismiss current
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(IronTracksNativePlugin.NOTIF_REST_TIMER_ID)
    }

    private fun handleAppNotification(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: "notif"
        val title = intent.getStringExtra("title") ?: "IronTracks"
        val body = intent.getStringExtra("body") ?: ""

        if (body.isEmpty()) return

        val builder = NotificationCompat.Builder(context, IronTracksNativePlugin.CHANNEL_GENERAL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)

        try {
            NotificationManagerCompat.from(context).notify(id.hashCode(), builder.build())
        } catch (_: SecurityException) {}
    }

    private fun triggerVibration(context: Context) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = VibrationEffect.createWaveform(
                longArrayOf(0, 200, 100, 200, 100, 200),
                intArrayOf(0, 255, 0, 255, 0, 255),
                -1
            )
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(600)
        }
    }
}
