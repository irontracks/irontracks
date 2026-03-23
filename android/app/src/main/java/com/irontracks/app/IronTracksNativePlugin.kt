package com.irontracks.app

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.provider.Settings
import android.util.Base64
import android.view.WindowManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import java.io.File
import java.io.FileInputStream
import java.util.UUID

@CapacitorPlugin(
    name = "IronTracksNative",
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
        Permission(strings = [Manifest.permission.VIBRATE], alias = "vibrate")
    ]
)
class IronTracksNativePlugin : Plugin(), SensorEventListener {

    companion object {
        const val CHANNEL_REST = "rest_timer"
        const val CHANNEL_APP = "app_notifications"
        const val NOTIF_ID_BASE = 9000
    }

    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null

    // ─── Screen ──────────────────────────────────────────────────────────────

    @PluginMethod
    fun setIdleTimerDisabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        activity?.runOnUiThread {
            if (enabled) {
                activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", activity?.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity?.startActivity(intent)
            call.resolve(JSObject().put("ok", true))
        } catch (e: Exception) {
            call.resolve(JSObject().put("ok", false))
        }
    }

    // ─── Notifications ───────────────────────────────────────────────────────

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("notifications", call, "handleNotificationPermResult")
        } else {
            call.resolve(JSObject().put("granted", true))
        }
    }

    @PluginMethod
    fun handleNotificationPermResult(call: PluginCall) {
        val granted = NotificationManagerCompat.from(context).areNotificationsEnabled()
        call.resolve(JSObject().put("granted", granted))
    }

    @PluginMethod
    fun checkNotificationPermission(call: PluginCall) {
        val enabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        val status = if (enabled) "granted" else "denied"
        call.resolve(JSObject().put("status", status))
    }

    @PluginMethod
    fun setupNotificationActions(call: PluginCall) {
        createNotificationChannels()
        call.resolve()
    }

    @PluginMethod
    fun scheduleRestTimer(call: PluginCall) {
        val id = call.getString("id") ?: "rest_timer"
        val seconds = call.getInt("seconds") ?: 0
        val title = call.getString("title") ?: "⏰ Tempo Esgotado!"
        val body = call.getString("body") ?: "Hora de voltar para o treino!"
        val repeatCount = call.getInt("repeatCount") ?: 0
        val repeatEverySeconds = call.getInt("repeatEverySeconds") ?: 5

        if (seconds <= 0) {
            call.resolve()
            return
        }

        createNotificationChannels()

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, RestTimerReceiver::class.java).apply {
            action = "com.irontracks.REST_TIMER_FIRE"
            putExtra("id", id)
            putExtra("title", title)
            putExtra("body", body)
            putExtra("repeatCount", repeatCount)
            putExtra("repeatEverySeconds", repeatEverySeconds)
            putExtra("currentRepeat", 0)
        }

        val requestCode = id.hashCode() and 0x7FFFFFFF
        val pendingIntent = PendingIntent.getBroadcast(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val triggerMs = SystemClock.elapsedRealtime() + (seconds * 1000L)

        try {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                triggerMs,
                pendingIntent
            )
        } catch (e: SecurityException) {
            // Fallback if exact alarms not permitted (Android 14+)
            alarmManager.set(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                triggerMs,
                pendingIntent
            )
        }

        // Show ongoing notification with countdown
        showOngoingTimerNotification(id, seconds, title)

        call.resolve()
    }

    @PluginMethod
    fun cancelRestTimer(call: PluginCall) {
        val id = call.getString("id") ?: "rest_timer"
        val requestCode = id.hashCode() and 0x7FFFFFFF

        // Cancel alarm
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, RestTimerReceiver::class.java).apply {
            action = "com.irontracks.REST_TIMER_FIRE"
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        alarmManager.cancel(pendingIntent)

        // Cancel notification
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(requestCode)

        call.resolve()
    }

    // ─── Generic App Notification ────────────────────────────────────────────

    @PluginMethod
    fun scheduleAppNotification(call: PluginCall) {
        val id = call.getString("id") ?: UUID.randomUUID().toString()
        val title = call.getString("title") ?: ""
        val body = call.getString("body") ?: ""
        val delaySeconds = call.getInt("delaySeconds") ?: 0

        createNotificationChannels()

        if (delaySeconds <= 0) {
            showSimpleNotification(id, title, body)
        } else {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, RestTimerReceiver::class.java).apply {
                action = "com.irontracks.APP_NOTIFICATION"
                putExtra("id", id)
                putExtra("title", title)
                putExtra("body", body)
            }
            val requestCode = id.hashCode() and 0x7FFFFFFF
            val pendingIntent = PendingIntent.getBroadcast(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val triggerMs = SystemClock.elapsedRealtime() + (delaySeconds * 1000L)
            try {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerMs, pendingIntent
                )
            } catch (e: SecurityException) {
                alarmManager.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerMs, pendingIntent)
            }
        }

        call.resolve(JSObject().put("id", id))
    }

    // ─── Alarm Sound ─────────────────────────────────────────────────────────

    @PluginMethod
    fun stopAlarmSound(call: PluginCall) {
        val vibrator = getVibrator()
        vibrator?.cancel()
        call.resolve()
    }

    // ─── Haptics ─────────────────────────────────────────────────────────────

    @PluginMethod
    fun triggerHaptic(call: PluginCall) {
        val style = call.getString("style") ?: "medium"
        val vibrator = getVibrator() ?: run {
            call.resolve()
            return
        }

        val effect = when (style) {
            "light" -> VibrationEffect.createOneShot(20, 80)
            "medium" -> VibrationEffect.createOneShot(40, 150)
            "heavy" -> VibrationEffect.createOneShot(60, 255)
            "rigid" -> VibrationEffect.createOneShot(15, 255)
            "soft" -> VibrationEffect.createOneShot(50, 60)
            "success" -> VibrationEffect.createWaveform(longArrayOf(0, 30, 60, 30), intArrayOf(0, 150, 0, 200), -1)
            "warning" -> VibrationEffect.createWaveform(longArrayOf(0, 40, 40, 40), intArrayOf(0, 200, 0, 200), -1)
            "error" -> VibrationEffect.createWaveform(longArrayOf(0, 50, 30, 50, 30, 50), intArrayOf(0, 255, 0, 255, 0, 255), -1)
            "selection" -> VibrationEffect.createOneShot(10, 100)
            else -> VibrationEffect.createOneShot(40, 150)
        }

        vibrator.vibrate(effect)
        call.resolve()
    }

    // ─── Biometrics ──────────────────────────────────────────────────────────

    @PluginMethod
    fun checkBiometricsAvailable(call: PluginCall) {
        val bm = BiometricManager.from(context)
        val canAuth = bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        val available = canAuth == BiometricManager.BIOMETRIC_SUCCESS
        val biometryType = if (available) "touchID" else "none" // Android doesn't distinguish
        call.resolve(JSObject().put("available", available).put("biometryType", biometryType))
    }

    @PluginMethod
    fun authenticateWithBiometrics(call: PluginCall) {
        val reason = call.getString("reason") ?: "Autenticação necessária"
        val fragmentActivity = activity as? FragmentActivity ?: run {
            call.resolve(JSObject().put("success", false).put("error", "Activity not available"))
            return
        }

        fragmentActivity.runOnUiThread {
            val executor = ContextCompat.getMainExecutor(context)
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    call.resolve(JSObject().put("success", true).put("error", ""))
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    call.resolve(JSObject().put("success", false).put("error", errString.toString()))
                }
                override fun onAuthenticationFailed() {
                    // Don't resolve yet — system allows retries
                }
            }

            val prompt = BiometricPrompt(fragmentActivity, executor, callback)
            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("IronTracks")
                .setSubtitle(reason)
                .setNegativeButtonText("Cancelar")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build()

            try {
                prompt.authenticate(promptInfo)
            } catch (e: Exception) {
                call.resolve(JSObject().put("success", false).put("error", e.message ?: "Unknown error"))
            }
        }
    }

    // ─── Accelerometer ───────────────────────────────────────────────────────

    @PluginMethod
    fun startAccelerometer(call: PluginCall) {
        val intervalMs = call.getInt("intervalMs") ?: 100
        sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        if (accelerometer != null) {
            val delayUs = intervalMs * 1000
            sensorManager?.registerListener(this, accelerometer, delayUs)
        }
        call.resolve()
    }

    @PluginMethod
    fun stopAccelerometer(call: PluginCall) {
        sensorManager?.unregisterListener(this)
        sensorManager = null
        accelerometer = null
        call.resolve()
    }

    override fun onSensorChanged(event: SensorEvent?) {
        event ?: return
        if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
            val data = JSObject()
                .put("x", event.values[0].toDouble())
                .put("y", event.values[1].toDouble())
                .put("z", event.values[2].toDouble())
            notifyListeners("accelerometerData", data)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ─── Photos ──────────────────────────────────────────────────────────────

    @PluginMethod
    fun saveImageToPhotos(call: PluginCall) {
        val base64 = call.getString("base64") ?: run {
            call.resolve(JSObject().put("saved", false).put("error", "No base64 data"))
            return
        }

        try {
            val cleanBase64 = base64.substringAfter(",", base64)
            val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)

            val values = ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, "irontracks_${System.currentTimeMillis()}.png")
                put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/IronTracks")
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
            }

            val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            if (uri != null) {
                context.contentResolver.openOutputStream(uri)?.use { out ->
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.clear()
                    values.put(MediaStore.Images.Media.IS_PENDING, 0)
                    context.contentResolver.update(uri, values, null, null)
                }
                call.resolve(JSObject().put("saved", true).put("error", ""))
            } else {
                call.resolve(JSObject().put("saved", false).put("error", "Failed to create media entry"))
            }
        } catch (e: Exception) {
            call.resolve(JSObject().put("saved", false).put("error", e.message ?: "Save failed"))
        }
    }

    @PluginMethod
    fun saveFileToPhotos(call: PluginCall) {
        val path = call.getString("path") ?: run {
            call.resolve(JSObject().put("saved", false).put("error", "No path"))
            return
        }
        val isVideo = call.getBoolean("isVideo", false) ?: false

        try {
            val file = File(path)
            if (!file.exists()) {
                call.resolve(JSObject().put("saved", false).put("error", "File not found"))
                return
            }

            val mimeType = if (isVideo) "video/mp4" else "image/png"
            val collection = if (isVideo) MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                             else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            val relativePath = if (isVideo) "Movies/IronTracks" else "Pictures/IronTracks"

            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
                put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
            }

            val uri = context.contentResolver.insert(collection, values)
            if (uri != null) {
                context.contentResolver.openOutputStream(uri)?.use { out ->
                    FileInputStream(file).use { inp -> inp.copyTo(out) }
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.clear()
                    values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                    context.contentResolver.update(uri, values, null, null)
                }
                // Cleanup temp file
                try { file.delete() } catch (_: Exception) {}
                call.resolve(JSObject().put("saved", true).put("error", ""))
            } else {
                call.resolve(JSObject().put("saved", false).put("error", "Failed to create media entry"))
            }
        } catch (e: Exception) {
            call.resolve(JSObject().put("saved", false).put("error", e.message ?: "Save failed"))
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val restChannel = NotificationChannel(
                CHANNEL_REST, "Cronômetro de Descanso",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alarmes do cronômetro de descanso"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 200, 300)
            }
            nm.createNotificationChannel(restChannel)

            val appChannel = NotificationChannel(
                CHANNEL_APP, "Notificações do App",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notificações gerais do IronTracks"
            }
            nm.createNotificationChannel(appChannel)
        }
    }

    private fun showOngoingTimerNotification(id: String, seconds: Int, title: String) {
        val notifId = id.hashCode() and 0x7FFFFFFF
        val builder = NotificationCompat.Builder(context, CHANNEL_REST)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText("Descanso em andamento...")
            .setOngoing(true)
            .setUsesChronometer(true)
            .setWhen(System.currentTimeMillis() + (seconds * 1000L))
            .setChronometerCountDown(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)

        val nm = NotificationManagerCompat.from(context)
        try {
            nm.notify(notifId, builder.build())
        } catch (_: SecurityException) {}
    }

    private fun showSimpleNotification(id: String, title: String, body: String) {
        val notifId = id.hashCode() and 0x7FFFFFFF
        val builder = NotificationCompat.Builder(context, CHANNEL_APP)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)

        val nm = NotificationManagerCompat.from(context)
        try {
            nm.notify(notifId, builder.build())
        } catch (_: SecurityException) {}
    }

    private fun getVibrator(): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vm?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }
}
