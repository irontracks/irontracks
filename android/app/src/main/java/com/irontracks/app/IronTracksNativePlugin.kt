package com.irontracks.app

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.provider.Settings
import android.view.WindowManager
import android.content.ContentValues
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.OutputStream
import java.util.concurrent.Executor

@CapacitorPlugin(name = "IronTracksNative")
class IronTracksNativePlugin : Plugin(), SensorEventListener {

    companion object {
        const val CHANNEL_REST_TIMER = "rest_timer"
        const val CHANNEL_GENERAL = "irontracks_general"
        const val NOTIF_REST_TIMER_ID = 9001
    }

    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var isAccelerometerRunning = false
    private var alarmPlayer: MediaPlayer? = null

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    override fun load() {
        super.load()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val restChannel = NotificationChannel(
                CHANNEL_REST_TIMER,
                "Rest Timer",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Timer de descanso entre séries"
                enableVibration(true)
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
            }
            nm.createNotificationChannel(restChannel)

            val generalChannel = NotificationChannel(
                CHANNEL_GENERAL,
                "Geral",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notificações gerais do IronTracks"
            }
            nm.createNotificationChannel(generalChannel)
        }
    }

    // ─── Screen ─────────────────────────────────────────────────────────────

    @PluginMethod
    fun setIdleTimerDisabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        activity.runOnUiThread {
            if (enabled) {
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
            }
            activity.startActivity(intent)
            call.resolve(JSObject().put("ok", true))
        } catch (e: Exception) {
            call.resolve(JSObject().put("ok", false))
        }
    }

    // ─── Notifications ──────────────────────────────────────────────────────

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                ActivityCompat.requestPermissions(
                    activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001
                )
                call.resolve(JSObject().put("granted", false))
                return
            }
        }
        call.resolve(JSObject().put("granted", true))
    }

    @PluginMethod
    fun checkNotificationPermission(call: PluginCall) {
        val status = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED
            ) "granted" else "denied"
        } else {
            if (NotificationManagerCompat.from(context).areNotificationsEnabled())
                "granted" else "denied"
        }
        call.resolve(JSObject().put("status", status))
    }

    @PluginMethod
    fun setupNotificationActions(call: PluginCall) {
        // Notification actions are defined inline when building the notification on Android
        call.resolve()
    }

    @PluginMethod
    fun scheduleRestTimer(call: PluginCall) {
        val id = call.getString("id", "rest_timer") ?: "rest_timer"
        val seconds = (call.getInt("seconds", 0) ?: 0).toLong()
        val title = call.getString("title", "⏰ Tempo Esgotado!") ?: "⏰ Tempo Esgotado!"
        val body = call.getString("body", "Hora de voltar para o treino!") ?: "Hora de voltar para o treino!"

        if (seconds <= 0) {
            call.resolve()
            return
        }

        // Cancel any existing timer first
        cancelAlarmInternal(id)

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, RestTimerReceiver::class.java).apply {
            action = "com.irontracks.REST_TIMER_FIRED"
            putExtra("id", id)
            putExtra("title", title)
            putExtra("body", body)
        }
        val pi = PendingIntent.getBroadcast(
            context, id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val triggerAt = SystemClock.elapsedRealtime() + (seconds * 1000)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
                } else {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
                }
            } else {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
            }
        } catch (e: SecurityException) {
            // Fallback to inexact alarm
            alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
        }

        call.resolve()
    }

    @PluginMethod
    fun cancelRestTimer(call: PluginCall) {
        val id = call.getString("id", "rest_timer") ?: "rest_timer"
        cancelAlarmInternal(id)
        // Also dismiss any notification
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(id.hashCode())
        nm.cancel(NOTIF_REST_TIMER_ID)
        call.resolve()
    }

    private fun cancelAlarmInternal(id: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, RestTimerReceiver::class.java).apply {
            action = "com.irontracks.REST_TIMER_FIRED"
        }
        val pi = PendingIntent.getBroadcast(
            context, id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pi)
    }

    // ─── Rest Timer Live Activity equivalent (ongoing notification) ─────────

    @PluginMethod
    fun startRestLiveActivity(call: PluginCall) {
        val id = call.getString("id", "rest_timer") ?: "rest_timer"
        val seconds = call.getInt("seconds", 0) ?: 0
        val title = call.getString("title", "Descanso") ?: "Descanso"

        if (seconds <= 0) {
            call.resolve()
            return
        }

        // Show an ongoing notification with countdown (Android equivalent of Live Activity)
        val endTime = System.currentTimeMillis() + (seconds * 1000L)

        // Skip action
        val skipIntent = Intent(context, RestTimerReceiver::class.java).apply {
            action = "com.irontracks.REST_TIMER_SKIP"
            putExtra("id", id)
        }
        val skipPi = PendingIntent.getBroadcast(
            context, (id + "_skip").hashCode(), skipIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // +30s action
        val add30Intent = Intent(context, RestTimerReceiver::class.java).apply {
            action = "com.irontracks.REST_TIMER_ADD30"
            putExtra("id", id)
        }
        val add30Pi = PendingIntent.getBroadcast(
            context, (id + "_add30").hashCode(), add30Intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_REST_TIMER)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("⏱ $title")
            .setContentText("Descansando… ${seconds}s")
            .setOngoing(true)
            .setAutoCancel(false)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setWhen(endTime)
            .addAction(android.R.drawable.ic_media_next, "Pular", skipPi)
            .addAction(android.R.drawable.ic_input_add, "+30s", add30Pi)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)

        val nm = NotificationManagerCompat.from(context)
        try {
            nm.notify(NOTIF_REST_TIMER_ID, builder.build())
        } catch (e: SecurityException) {
            // Permission not granted
        }

        // Also schedule the alarm
        scheduleRestTimer(call)
    }

    @PluginMethod
    fun updateRestLiveActivity(call: PluginCall) {
        val isFinished = call.getBoolean("isFinished", false) ?: false
        if (isFinished) {
            // Update the notification to show "Tempo Esgotado"
            val builder = NotificationCompat.Builder(context, CHANNEL_REST_TIMER)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("⏰ Tempo Esgotado!")
                .setContentText("Hora de voltar para o treino!")
                .setOngoing(false)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)

            val nm = NotificationManagerCompat.from(context)
            try {
                nm.notify(NOTIF_REST_TIMER_ID, builder.build())
            } catch (e: SecurityException) {
                // Permission not granted
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun endRestLiveActivity(call: PluginCall) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIF_REST_TIMER_ID)
        stopAlarmInternal()
        call.resolve()
    }

    // ─── Generic App Notification ───────────────────────────────────────────

    @PluginMethod
    fun scheduleAppNotification(call: PluginCall) {
        val id = call.getString("id", System.currentTimeMillis().toString())
            ?: System.currentTimeMillis().toString()
        val title = call.getString("title", "IronTracks") ?: "IronTracks"
        val body = call.getString("body", "") ?: ""
        val delaySeconds = (call.getInt("delaySeconds", 1) ?: 1).toLong()

        if (body.isEmpty()) {
            call.resolve()
            return
        }

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, RestTimerReceiver::class.java).apply {
            action = "com.irontracks.APP_NOTIFICATION"
            putExtra("id", id)
            putExtra("title", title)
            putExtra("body", body)
        }
        val pi = PendingIntent.getBroadcast(
            context, id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val triggerAt = SystemClock.elapsedRealtime() + (maxOf(1L, delaySeconds) * 1000)

        try {
            alarmManager.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
        } catch (_: SecurityException) {}

        call.resolve(JSObject().put("id", id))
    }

    // ─── Alarm Sound ────────────────────────────────────────────────────────

    @PluginMethod
    fun stopAlarmSound(call: PluginCall) {
        stopAlarmInternal()
        call.resolve()
    }

    private fun stopAlarmInternal() {
        try {
            alarmPlayer?.stop()
            alarmPlayer?.release()
        } catch (_: Exception) {}
        alarmPlayer = null
    }

    // ─── Haptics ────────────────────────────────────────────────────────────

    @PluginMethod
    fun triggerHaptic(call: PluginCall) {
        val style = call.getString("style", "medium") ?: "medium"
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = when (style) {
                "light" -> VibrationEffect.createOneShot(20, 50)
                "medium" -> VibrationEffect.createOneShot(40, 128)
                "heavy" -> VibrationEffect.createOneShot(60, 200)
                "rigid" -> VibrationEffect.createOneShot(30, 255)
                "soft" -> VibrationEffect.createOneShot(50, 40)
                "success" -> VibrationEffect.createWaveform(longArrayOf(0, 30, 80, 30), intArrayOf(0, 128, 0, 128), -1)
                "warning" -> VibrationEffect.createWaveform(longArrayOf(0, 50, 60, 50), intArrayOf(0, 200, 0, 200), -1)
                "error" -> VibrationEffect.createWaveform(longArrayOf(0, 80, 60, 80, 60, 80), intArrayOf(0, 255, 0, 255, 0, 255), -1)
                "selection" -> VibrationEffect.createOneShot(10, 60)
                else -> VibrationEffect.createOneShot(40, 128)
            }
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(40)
        }
        call.resolve()
    }

    // ─── Biometrics ─────────────────────────────────────────────────────────

    @PluginMethod
    fun checkBiometricsAvailable(call: PluginCall) {
        val bm = BiometricManager.from(context)
        val canAuth = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        val available = canAuth == BiometricManager.BIOMETRIC_SUCCESS
        val biometryType = if (available) "fingerprint" else "none"
        call.resolve(
            JSObject()
                .put("available", available)
                .put("biometryType", biometryType)
        )
    }

    @PluginMethod
    fun authenticateWithBiometrics(call: PluginCall) {
        val reason = call.getString("reason", "Confirme sua identidade") ?: "Confirme sua identidade"
        val fragmentActivity = activity as? FragmentActivity
        if (fragmentActivity == null) {
            call.resolve(JSObject().put("success", false).put("error", "activity_not_fragment"))
            return
        }

        val executor: Executor = ContextCompat.getMainExecutor(context)
        val biometricPrompt = BiometricPrompt(fragmentActivity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    call.resolve(JSObject().put("success", true).put("error", ""))
                }
                override fun onAuthenticationFailed() {
                    call.resolve(JSObject().put("success", false).put("error", "authentication_failed"))
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    call.resolve(JSObject().put("success", false).put("error", errString.toString()))
                }
            }
        )

        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("IronTracks")
            .setSubtitle(reason)
            .setNegativeButtonText("Cancelar")
            .build()

        activity.runOnUiThread {
            biometricPrompt.authenticate(promptInfo)
        }
    }

    // ─── Spotlight (no-op on Android) ───────────────────────────────────────

    @PluginMethod
    fun indexWorkout(call: PluginCall) { call.resolve() }

    @PluginMethod
    fun removeWorkoutIndex(call: PluginCall) { call.resolve() }

    @PluginMethod
    fun clearAllWorkoutIndexes(call: PluginCall) { call.resolve() }

    // ─── Accelerometer ──────────────────────────────────────────────────────

    @PluginMethod
    fun startAccelerometer(call: PluginCall) {
        val intervalMs = (call.getInt("intervalMs", 100) ?: 100).toLong()
        if (sensorManager == null) {
            sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
            accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        }
        if (accelerometer == null) {
            call.reject("accelerometer_unavailable")
            return
        }
        val delayUs = (intervalMs * 1000).toInt().coerceAtLeast(16000)
        sensorManager?.registerListener(this, accelerometer, delayUs)
        isAccelerometerRunning = true
        call.resolve()
    }

    @PluginMethod
    fun stopAccelerometer(call: PluginCall) {
        if (isAccelerometerRunning) {
            sensorManager?.unregisterListener(this)
            isAccelerometerRunning = false
        }
        call.resolve()
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_ACCELEROMETER) {
            val data = JSObject()
                .put("x", event.values[0].toDouble())
                .put("y", event.values[1].toDouble())
                .put("z", event.values[2].toDouble())
                .put("timestamp", event.timestamp.toDouble())
            notifyListeners("accelerometerData", data)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ─── HealthKit equivalents (Health Connect API stubs) ───────────────────
    // Full Health Connect integration requires the health-connect dependency.
    // For now we provide graceful stubs that don't crash.

    @PluginMethod
    fun isHealthKitAvailable(call: PluginCall) {
        // Health Connect is available on Android 14+ or via APK on older versions
        val available = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
        call.resolve(JSObject().put("available", available))
    }

    @PluginMethod
    fun requestHealthKitPermission(call: PluginCall) {
        // Stub — full implementation requires health-connect dependency
        call.resolve(JSObject().put("granted", false).put("error", "health_connect_not_configured"))
    }

    @PluginMethod
    fun saveWorkoutToHealth(call: PluginCall) {
        call.resolve(JSObject().put("ok", false).put("error", "health_connect_not_configured"))
    }

    @PluginMethod
    fun getHealthSteps(call: PluginCall) {
        call.resolve(JSObject().put("steps", 0).put("error", "health_connect_not_configured"))
    }

    // ─── Photos / Media ─────────────────────────────────────────────────────

    @PluginMethod
    fun saveImageToPhotos(call: PluginCall) {
        val base64 = call.getString("base64", "") ?: ""
        val fileName = call.getString("fileName", "irontracks_${System.currentTimeMillis()}.png")
            ?: "irontracks_${System.currentTimeMillis()}.png"

        if (base64.isEmpty()) {
            call.reject("missing_base64")
            return
        }

        try {
            val imageBytes = Base64.decode(base64, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                ?: throw Exception("invalid_image_data")

            val contentValues = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/IronTracks")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
            }

            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
                ?: throw Exception("failed_to_create_media_entry")

            val outputStream: OutputStream = resolver.openOutputStream(uri)
                ?: throw Exception("failed_to_open_output_stream")

            outputStream.use {
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentValues.clear()
                contentValues.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
            }

            call.resolve(JSObject().put("ok", true))
        } catch (e: Exception) {
            call.reject("save_image_error", e.message)
        }
    }

    @PluginMethod
    fun saveFileToPhotos(call: PluginCall) {
        val filePath = call.getString("filePath", "") ?: ""
        if (filePath.isEmpty()) {
            call.reject("missing_filePath")
            return
        }

        try {
            val file = File(filePath)
            if (!file.exists()) throw Exception("file_not_found")

            val mimeType = when {
                filePath.endsWith(".mp4", true) -> "video/mp4"
                filePath.endsWith(".mov", true) -> "video/quicktime"
                filePath.endsWith(".png", true) -> "image/png"
                filePath.endsWith(".jpg", true) || filePath.endsWith(".jpeg", true) -> "image/jpeg"
                else -> "application/octet-stream"
            }

            val isVideo = mimeType.startsWith("video")
            val collection = if (isVideo)
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            else
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI

            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val folder = if (isVideo) "Movies/IronTracks" else "Pictures/IronTracks"
                    put(MediaStore.MediaColumns.RELATIVE_PATH, folder)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
            }

            val resolver = context.contentResolver
            val uri = resolver.insert(collection, contentValues) ?: throw Exception("failed_insert")

            resolver.openOutputStream(uri)?.use { output ->
                file.inputStream().use { input -> input.copyTo(output) }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentValues.clear()
                contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
            }

            call.resolve(JSObject().put("ok", true))
        } catch (e: Exception) {
            call.reject("save_file_error", e.message)
        }
    }
}
