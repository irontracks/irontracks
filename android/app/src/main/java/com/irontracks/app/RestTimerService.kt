package com.irontracks.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import io.sentry.Sentry

/**
 * Foreground Service that powers the workout rest timer on Android 8+ (API 26+).
 *
 * Why this exists: AlarmManager.setExactAndAllowWhileIdle gets throttled by
 * vendor power-saving (Samsung "Sleeping apps", Xiaomi MIUI, Oppo, etc.) —
 * timers fire minutes late when the screen is off mid-workout. A foreground
 * service with an ongoing notification is exempt from Doze/Standby and runs
 * at exact wall-clock precision regardless of OEM policy.
 *
 * Behavior:
 *  - onStartCommand starts foreground immediately (must call within 5s on
 *    Android 12+ or the system kills the process with ForegroundServiceDidNotStart).
 *  - A Handler on the main looper schedules stopSelf() at restSeconds.
 *  - When the timer fires we post a separate "alarm" notification (sound +
 *    vibrate, NOT ongoing) and remove the foreground state.
 *
 * The legacy AlarmManager + broadcast path (RestTimerReceiver) remains as
 * fallback for API < 26.
 */
class RestTimerService : Service() {

    companion object {
        const val ACTION_START = "com.irontracks.REST_TIMER_START"
        const val ACTION_STOP = "com.irontracks.REST_TIMER_STOP"

        const val EXTRA_REST_SECONDS = "restSeconds"
        const val EXTRA_EXERCISE_NAME = "exerciseName"
        const val EXTRA_SERIES_NUMBER = "seriesNumber"
        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"

        const val CHANNEL_FOREGROUND = "rest_timer_foreground"
        // v2: o canal ANTIGO ("rest_timer_done") era criado SEM AudioAttributes, então o
        // fim do descanso tocava no volume de NOTIFICAÇÃO — abafado por toque baixo ou
        // silencioso. O Android não permite alterar som/importância de um canal já criado,
        // então a única saída é um id novo (e apagar o antigo).
        const val CHANNEL_DONE = "rest_timer_done_v2"
        private const val CHANNEL_DONE_LEGACY = "rest_timer_done"
        const val NOTIF_ID_FOREGROUND = 9100
        const val NOTIF_ID_DONE = 9101
    }

    private val handler = Handler(Looper.getMainLooper())
    private var stopRunnable: Runnable? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannels()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            cancelTimer()
            stopForegroundCompat(removeNotification = true)
            stopSelf()
            return START_NOT_STICKY
        }

        val restSeconds = intent?.getIntExtra(EXTRA_REST_SECONDS, 0) ?: 0
        val exerciseName = intent?.getStringExtra(EXTRA_EXERCISE_NAME) ?: ""
        val seriesNumber = intent?.getIntExtra(EXTRA_SERIES_NUMBER, 0) ?: 0
        val doneTitle = intent?.getStringExtra(EXTRA_TITLE) ?: "Tempo esgotado"
        val doneBody = intent?.getStringExtra(EXTRA_BODY) ?: "Hora de voltar para o treino"

        if (restSeconds <= 0) {
            stopSelf()
            return START_NOT_STICKY
        }

        try {
            startForegroundCompat(buildOngoingNotification(restSeconds, exerciseName, seriesNumber))
        } catch (e: Exception) {
            // ForegroundServiceStartNotAllowedException on Android 12+ if started from
            // background without an allowed reason. Fallback: just notify and let the
            // AlarmManager path handle it.
            try { Sentry.captureException(e) } catch (_: Throwable) {}
            stopSelf()
            return START_NOT_STICKY
        }

        scheduleStop(restSeconds, doneTitle, doneBody)

        return START_REDELIVER_INTENT
    }

    override fun onDestroy() {
        cancelTimer()
        super.onDestroy()
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val fg = NotificationChannel(
            CHANNEL_FOREGROUND,
            "Cronômetro de descanso (em andamento)",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Notificação persistente durante o descanso entre séries"
            setShowBadge(false)
            enableVibration(false)
        }
        nm.createNotificationChannel(fg)

        // Não deixa o canal antigo órfão nos ajustes do usuário.
        try { nm.deleteNotificationChannel(CHANNEL_DONE_LEGACY) } catch (_: Exception) {}

        // USAGE_ALARM toca no volume de ALARME. É o que aproxima do iOS, onde o fim do
        // descanso sai por AVAudioPlayer em sessão .playback.
        val alarmAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        // Som de alarme do próprio sistema — evita binário de áudio no repo.
        val alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        val done = NotificationChannel(
            CHANNEL_DONE,
            "Fim do descanso",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Avisa quando o tempo de descanso termina"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
            setSound(alarmSound, alarmAttrs)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        nm.createNotificationChannel(done)
    }

    private fun buildOngoingNotification(
        restSeconds: Int,
        exerciseName: String,
        seriesNumber: Int
    ): Notification {
        val contentIntent = packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
            PendingIntent.getActivity(
                this, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val title = if (exerciseName.isNotEmpty()) "Descanso: $exerciseName" else "Descanso"
        val text = if (seriesNumber > 0) "Série $seriesNumber" else "Em andamento"

        val builder = NotificationCompat.Builder(this, CHANNEL_FOREGROUND)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setWhen(System.currentTimeMillis() + restSeconds * 1000L)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        if (contentIntent != null) builder.setContentIntent(contentIntent)
        return builder.build()
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14+ exige o foregroundServiceType explícito no start. Usamos
            // SPECIAL_USE (bate com o manifest) — o tipo "health" exigia permissão de
            // sensor em runtime (BODY_SENSORS/ACTIVITY_RECOGNITION) e lançava
            // SecurityException, matando a notificação do cronômetro no Android 14+.
            startForeground(
                NOTIF_ID_FOREGROUND,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIF_ID_FOREGROUND, notification)
        }
    }

    @Suppress("DEPRECATION")
    private fun stopForegroundCompat(removeNotification: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(
                if (removeNotification) Service.STOP_FOREGROUND_REMOVE
                else Service.STOP_FOREGROUND_DETACH
            )
        } else {
            stopForeground(removeNotification)
        }
    }

    private fun scheduleStop(restSeconds: Int, doneTitle: String, doneBody: String) {
        cancelTimer()
        val runnable = Runnable {
            onTimerFinished(doneTitle, doneBody)
        }
        stopRunnable = runnable
        handler.postDelayed(runnable, restSeconds * 1000L)
    }

    private fun cancelTimer() {
        stopRunnable?.let { handler.removeCallbacks(it) }
        stopRunnable = null
    }

    private fun onTimerFinished(title: String, body: String) {
        // Remove ongoing foreground notification
        stopForegroundCompat(removeNotification = true)

        // Post a "done" notification (HIGH importance, sound + vibrate)
        val contentIntent = packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
            PendingIntent.getActivity(
                this, 1, launch,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_DONE)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            // Sem DEFAULT_SOUND: o som vem do canal (USAGE_ALARM). Com os dois, o
            // Android prefere o default de notificação e ANULA o alarme.
            .setDefaults(NotificationCompat.DEFAULT_LIGHTS)

        if (contentIntent != null) builder.setContentIntent(contentIntent)

        try {
            NotificationManagerCompat.from(this).notify(NOTIF_ID_DONE, builder.build())
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS denied on Android 13+ — silently skip
        }

        triggerAlarmVibration()
        stopSelf()
    }

    private fun triggerAlarmVibration() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vm?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(
                VibrationEffect.createWaveform(
                    longArrayOf(0, 400, 200, 400, 200, 400),
                    intArrayOf(0, 255, 0, 255, 0, 255),
                    -1
                )
            )
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(longArrayOf(0, 400, 200, 400, 200, 400), -1)
        }
    }
}
