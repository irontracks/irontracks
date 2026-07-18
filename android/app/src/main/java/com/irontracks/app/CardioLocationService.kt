package com.irontracks.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * Foreground service de GPS do cardio — paridade com o CLLocationManager em background
 * do iOS (IronTracksNativePlugin.swift). Mantém o FusedLocationProvider entregando
 * posições mesmo com a tela bloqueada / app em segundo plano (o @capacitor/geolocation
 * congela nesse cenário). Os fixes são bufferizados de forma thread-safe e o JS os drena
 * (via IronTracksNativePlugin.drainCardioLocations) periodicamente e no resume — nada se
 * perde durante a suspensão.
 */
class CardioLocationService : Service() {

    /** Um fix de GPS bufferizado, no mesmo contrato do NativeCardioFix (bridge JS). */
    data class Fix(
        val lat: Double,
        val lng: Double,
        val accuracy: Double,
        val altitude: Double,
        val speed: Double,
        val heading: Double,
        val timestamp: Double,
    )

    companion object {
        const val CHANNEL_CARDIO = "irontracks_cardio"
        const val NOTIF_ID = 9300
        private const val MAX_BUFFER = 12000

        private val lock = Any()
        private val buffer = ArrayList<Fix>()

        @Volatile
        var active = false
            private set

        fun setActive(value: Boolean) { active = value }

        fun append(f: Fix) {
            synchronized(lock) {
                buffer.add(f)
                if (buffer.size > MAX_BUFFER) {
                    // Teto de segurança: descarta os mais antigos (2h a 1Hz ~ 7200 pontos).
                    val over = buffer.size - MAX_BUFFER
                    repeat(over) { buffer.removeAt(0) }
                }
            }
        }

        /** Retorna e LIMPA o buffer — cada ponto é entregue ao JS exatamente uma vez. */
        fun drain(): List<Fix> {
            synchronized(lock) {
                val out = ArrayList(buffer)
                buffer.clear()
                return out
            }
        }

        fun clear() {
            synchronized(lock) { buffer.clear() }
        }
    }

    private var fused: FusedLocationProviderClient? = null

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            for (loc in result.locations) {
                // Precisão negativa = fix inválido.
                if (loc.accuracy < 0) continue
                append(
                    Fix(
                        lat = loc.latitude,
                        lng = loc.longitude,
                        accuracy = loc.accuracy.toDouble(),
                        altitude = if (loc.hasAltitude()) loc.altitude else 0.0,
                        speed = if (loc.hasSpeed()) loc.speed.toDouble() else -1.0,
                        heading = if (loc.hasBearing()) loc.bearing.toDouble() else -1.0,
                        timestamp = loc.time.toDouble(),
                    ),
                )
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        if (!active) {
            // A repeated start must not erase an active route or register a second
            // LocationCallback. A non-null intent represents a new user session.
            if (intent != null) clear()
            setActive(true)
            startUpdates()
        }
        return START_STICKY
    }

    private fun startUpdates() {
        try {
            val client = LocationServices.getFusedLocationProviderClient(this)
            fused = client
            val req = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000L)
                .setMinUpdateIntervalMillis(1000L)
                .setWaitForAccurateLocation(false)
                .build()
            client.requestLocationUpdates(req, callback, Looper.getMainLooper())
        } catch (e: SecurityException) {
            // Permissão de localização não concedida — o JS já cai no fallback web.
        } catch (e: Exception) {
            // Play Services indisponível etc. — best effort.
        }
    }

    private fun startAsForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(CHANNEL_CARDIO, "Cardio GPS", NotificationManager.IMPORTANCE_LOW)
            ch.setShowBadge(false)
            nm.createNotificationChannel(ch)
        }
        val notif: Notification = NotificationCompat.Builder(this, CHANNEL_CARDIO)
            .setContentTitle("Rastreando sua corrida")
            .setContentText("O GPS continua contando com a tela bloqueada.")
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setOngoing(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
    }

    override fun onDestroy() {
        setActive(false)
        try { fused?.removeLocationUpdates(callback) } catch (e: Exception) { }
        super.onDestroy()
    }
}
