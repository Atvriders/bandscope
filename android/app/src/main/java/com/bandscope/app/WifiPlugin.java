package com.bandscope.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.SystemClock;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;

/**
 * WiFi scanning — per-AP RSSI (dBm) + exact center frequency (MHz) + channel
 * width. The only phone radio giving received power AND an exact per-emitter
 * frequency. No browser API exists for this; APK-only. OS throttles scans
 * (~4 / 2 min foreground), so the JS side re-scans on a ~30 s cadence and stamps
 * each result's real age.
 */
@CapacitorPlugin(
    name = "Wifi",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class WifiPlugin extends Plugin {

    private WifiManager wifiManager;
    private BroadcastReceiver receiver;
    private boolean registered = false;

    @PluginMethod
    public void startScan(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "permCb");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void permCb(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            begin(call);
        } else {
            call.reject("Location permission denied (required for WiFi scan results)");
        }
    }

    private void begin(PluginCall call) {
        Context ctx = getContext().getApplicationContext();
        wifiManager = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
        if (wifiManager == null) {
            call.reject("No WifiManager on this device");
            return;
        }
        if (!registered) {
            receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent i) {
                    emitResults();
                }
            };
            IntentFilter filter = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                ctx.registerReceiver(receiver, filter);
            }
            registered = true;
        }
        // Request a fresh scan (may be throttled — cached results still returned).
        wifiManager.startScan();
        emitResults(); // emit whatever is cached right away
        call.resolve();
    }

    private void emitResults() {
        if (wifiManager == null) return;
        List<ScanResult> results;
        try {
            results = wifiManager.getScanResults();
        } catch (SecurityException e) {
            return;
        }
        JSObject ret = new JSObject();
        JSArray arr = new JSArray();
        long nowElapsedMs = SystemClock.elapsedRealtime();
        for (ScanResult r : results) {
            JSObject o = new JSObject();
            o.put("ssid", r.SSID == null ? "" : r.SSID);
            o.put("bssid", r.BSSID);
            o.put("level", r.level);
            o.put("frequencyMhz", r.frequency);
            o.put("channelWidthMhz", widthToMhz(r));
            o.put("capabilities", r.capabilities == null ? "" : r.capabilities);
            // r.timestamp is micros since boot → real age of this measurement.
            long ageMs = nowElapsedMs - (r.timestamp / 1000);
            o.put("ageMs", Math.max(0, ageMs));
            arr.put(o);
        }
        ret.put("results", arr);
        notifyListeners("wifiScan", ret);
    }

    private int widthToMhz(ScanResult r) {
        switch (r.getChannelWidth()) {
            case ScanResult.CHANNEL_WIDTH_40MHZ:
                return 40;
            case ScanResult.CHANNEL_WIDTH_80MHZ:
            case ScanResult.CHANNEL_WIDTH_80MHZ_PLUS_MHZ:
                return 80;
            case ScanResult.CHANNEL_WIDTH_160MHZ:
                return 160;
            case ScanResult.CHANNEL_WIDTH_320MHZ:
                return 320;
            default:
                return 20;
        }
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        unregister();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        unregister();
    }

    private void unregister() {
        if (registered && receiver != null) {
            try {
                getContext().getApplicationContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {
            }
            registered = false;
        }
    }
}
