package com.bandscope.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.HashMap;
import java.util.Map;

/**
 * BLE advertisement scan → per-device RSSI (dBm) + advertised TX power. BLE hops
 * invisibly across 40 channels, so there is NO frequency — these render as a
 * 2.4 GHz band presence / device list, never a spectral line. Batches results
 * ~1 s to avoid flooding the bridge. APK-only.
 */
@CapacitorPlugin(
    name = "Ble",
    permissions = {
        @Permission(
            alias = "ble",
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.ACCESS_FINE_LOCATION
            }
        )
    }
)
public class BlePlugin extends Plugin {

    private BluetoothLeScanner scanner;
    private ScanCallback callback;
    private final Map<String, JSObject> latest = new HashMap<>();
    private Handler handler;
    private Runnable emitter;
    private boolean scanning = false;

    @PluginMethod
    public void startScan(PluginCall call) {
        if (getPermissionState("ble") != PermissionState.GRANTED) {
            requestPermissionForAlias("ble", call, "permCb");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void permCb(PluginCall call) {
        if (getPermissionState("ble") == PermissionState.GRANTED) {
            begin(call);
        } else {
            call.reject("Bluetooth scan permission denied");
        }
    }

    private void begin(PluginCall call) {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = bm == null ? null : bm.getAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is off or unavailable");
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            call.reject("No BLE scanner");
            return;
        }
        if (scanning) {
            call.resolve();
            return;
        }
        callback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                record(result);
            }
        };
        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_BALANCED)
            .build();
        try {
            scanner.startScan(null, settings, callback);
        } catch (SecurityException e) {
            call.reject("BLE scan denied: " + e.getMessage());
            return;
        }
        scanning = true;

        handler = new Handler(Looper.getMainLooper());
        emitter = new Runnable() {
            @Override
            public void run() {
                flush();
                if (scanning) handler.postDelayed(this, 1000);
            }
        };
        handler.postDelayed(emitter, 1000);
        call.resolve();
    }

    private void record(ScanResult result) {
        if (result == null || result.getDevice() == null) return;
        String addr = result.getDevice().getAddress();
        JSObject o = new JSObject();
        o.put("address", addr);
        o.put("rssi", result.getRssi());
        int tx = result.getTxPower(); // API 26+; 127 = not present
        o.put("txPower", tx == ScanResult.TX_POWER_NOT_PRESENT ? null : tx);
        ScanRecord rec = result.getScanRecord();
        o.put("name", rec != null && rec.getDeviceName() != null ? rec.getDeviceName() : "");
        synchronized (latest) {
            latest.put(addr, o);
        }
    }

    private void flush() {
        JSArray arr = new JSArray();
        synchronized (latest) {
            for (JSObject o : latest.values()) arr.put(o);
            latest.clear();
        }
        JSObject ret = new JSObject();
        ret.put("devices", arr);
        notifyListeners("bleScan", ret);
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
    }

    private void stopInternal() {
        scanning = false;
        if (handler != null && emitter != null) handler.removeCallbacks(emitter);
        if (scanner != null && callback != null) {
            try {
                scanner.stopScan(callback);
            } catch (SecurityException ignored) {
            }
        }
    }
}
