#import <Capacitor/Capacitor.h>

// Registers IronTracksNativePlugin so Capacitor bridge can discover it at runtime.
CAP_PLUGIN(IronTracksNativePlugin, "IronTracksNative",
           CAP_PLUGIN_METHOD(setIdleTimerDisabled, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(openAppSettings, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(requestNotificationPermission, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(checkNotificationPermission, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(setupNotificationActions, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(scheduleRestTimer, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(cancelRestTimer, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(startRestLiveActivity, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(updateRestLiveActivity, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(endRestLiveActivity, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(scheduleAppNotification, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stopAlarmSound, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(triggerHaptic, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(checkBiometricsAvailable, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(authenticateWithBiometrics, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(indexWorkout, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(removeWorkoutIndex, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(clearAllWorkoutIndexes, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(startAccelerometer, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stopAccelerometer, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(isHealthKitAvailable, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(requestHealthKitPermission, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(saveWorkoutToHealth, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getHealthSteps, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(saveImageToPhotos, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(saveFileToPhotos, CAPPluginReturnPromise);
)
