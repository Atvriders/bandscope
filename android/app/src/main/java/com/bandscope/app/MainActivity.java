package com.bandscope.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register BandScope's custom native radio plugins before the bridge
        // starts. More radios (WiFi, cellular, UWB, BT Classic) are added here
        // in Milestone 3.
        registerPlugin(GnssPlugin.class);
        registerPlugin(WifiPlugin.class);
        registerPlugin(CellularPlugin.class);
        registerPlugin(BlePlugin.class);
        registerPlugin(NfcPlugin.class);
        registerPlugin(BtClassicPlugin.class);
        registerPlugin(UwbPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
