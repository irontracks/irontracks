package com.irontracks.app

import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        registerPlugin(IronTracksNativePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
