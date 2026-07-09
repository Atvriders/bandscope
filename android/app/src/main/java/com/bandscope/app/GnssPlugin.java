package com.bandscope.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.GnssStatus;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Exposes per-satellite GNSS data — the richest real signal-quality source on a
 * phone. Emits a "gnssStatus" event carrying each satellite's C/N0 (dB-Hz), its
 * real carrier frequency (L1/L5/...), constellation, and az/el. This data has NO
 * browser equivalent (Geolocation gives only a fused position), so it exists
 * only in the APK.
 */
@CapacitorPlugin(
    name = "Gnss",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class GnssPlugin extends Plugin {

    private LocationManager locationManager;
    private GnssStatus.Callback statusCallback;

    @PluginMethod
    public void startWatch(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermCallback");
            return;
        }
        beginWatch(call);
    }

    @PermissionCallback
    private void locationPermCallback(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            beginWatch(call);
        } else {
            call.reject("Location permission denied");
        }
    }

    private void beginWatch(PluginCall call) {
        Context ctx = getContext();
        if (ActivityCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("Location permission missing");
            return;
        }
        locationManager = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) {
            call.reject("No LocationManager on this device");
            return;
        }
        if (statusCallback != null) {
            // already watching
            call.resolve();
            return;
        }
        statusCallback = new GnssStatus.Callback() {
            @Override
            public void onSatelliteStatusChanged(GnssStatus status) {
                emitStatus(status);
            }
        };
        try {
            locationManager.registerGnssStatusCallback(statusCallback, new Handler(Looper.getMainLooper()));
            call.resolve();
        } catch (SecurityException e) {
            statusCallback = null;
            call.reject("registerGnssStatusCallback denied: " + e.getMessage());
        }
    }

    private void emitStatus(GnssStatus status) {
        JSObject ret = new JSObject();
        JSArray sats = new JSArray();
        int n = status.getSatelliteCount();
        for (int i = 0; i < n; i++) {
            JSObject s = new JSObject();
            s.put("svid", status.getSvid(i));
            s.put("constellation", constellationName(status.getConstellationType(i)));
            s.put("cn0DbHz", status.getCn0DbHz(i));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && status.hasCarrierFrequencyHz(i)) {
                s.put("carrierFreqHz", status.getCarrierFrequencyHz(i));
            }
            s.put("azimuth", status.getAzimuthDegrees(i));
            s.put("elevation", status.getElevationDegrees(i));
            s.put("usedInFix", status.usedInFix(i));
            sats.put(s);
        }
        ret.put("satellites", sats);
        notifyListeners("gnssStatus", ret);
    }

    private String constellationName(int type) {
        switch (type) {
            case GnssStatus.CONSTELLATION_GPS: return "GPS";
            case GnssStatus.CONSTELLATION_GLONASS: return "GLONASS";
            case GnssStatus.CONSTELLATION_GALILEO: return "Galileo";
            case GnssStatus.CONSTELLATION_BEIDOU: return "BeiDou";
            case GnssStatus.CONSTELLATION_QZSS: return "QZSS";
            case GnssStatus.CONSTELLATION_SBAS: return "SBAS";
            case GnssStatus.CONSTELLATION_IRNSS: return "IRNSS";
            default: return "Unknown";
        }
    }

    @PluginMethod
    public void stopWatch(PluginCall call) {
        if (locationManager != null && statusCallback != null) {
            locationManager.unregisterGnssStatusCallback(statusCallback);
        }
        statusCallback = null;
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (locationManager != null && statusCallback != null) {
            locationManager.unregisterGnssStatusCallback(statusCallback);
            statusCallback = null;
        }
    }
}
