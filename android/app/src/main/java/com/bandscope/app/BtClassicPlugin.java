package com.bandscope.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;

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
 * Bluetooth Classic discovery → device presence + inquiry RSSI (dBm, if the
 * controller reports it). ~12 s inquiry cycles, so inherently slow. Classic hops
 * across 79 channels invisibly → no frequency. APK-only.
 */
@CapacitorPlugin(
    name = "BtClassic",
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
public class BtClassicPlugin extends Plugin {

    private BluetoothAdapter adapter;
    private BroadcastReceiver receiver;
    private boolean registered = false;
    private final Map<String, JSObject> found = new HashMap<>();

    @PluginMethod
    public void startDiscovery(PluginCall call) {
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
        adapter = bm == null ? null : bm.getAdapter();
        if (adapter == null) {
            call.reject("No Bluetooth adapter");
            return;
        }
        if (!registered) {
            receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent intent) {
                    if (BluetoothDevice.ACTION_FOUND.equals(intent.getAction())) {
                        BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                        short rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE);
                        record(device, rssi);
                        emit();
                    }
                }
            };
            IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                getContext().registerReceiver(receiver, filter);
            }
            registered = true;
        }
        try {
            if (adapter.isDiscovering()) adapter.cancelDiscovery();
            adapter.startDiscovery();
        } catch (SecurityException e) {
            call.reject("startDiscovery denied: " + e.getMessage());
            return;
        }
        call.resolve();
    }

    private void record(BluetoothDevice device, short rssi) {
        if (device == null) return;
        JSObject o = new JSObject();
        o.put("address", device.getAddress());
        String name = "";
        try {
            name = device.getName() == null ? "" : device.getName();
        } catch (SecurityException ignored) {
        }
        o.put("name", name);
        o.put("rssi", rssi == Short.MIN_VALUE ? null : (int) rssi);
        o.put("cls", device.getBluetoothClass() != null
            ? device.getBluetoothClass().getMajorDeviceClass() : 0);
        synchronized (found) {
            found.put(device.getAddress(), o);
        }
    }

    private void emit() {
        JSArray arr = new JSArray();
        synchronized (found) {
            for (JSObject o : found.values()) arr.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("devices", arr);
        notifyListeners("btDevices", ret);
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
    }

    private void stopInternal() {
        try {
            if (adapter != null && adapter.isDiscovering()) adapter.cancelDiscovery();
        } catch (SecurityException ignored) {
        }
        if (registered && receiver != null) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {
            }
            registered = false;
        }
    }
}
