package com.bandscope.app;

import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * UWB presence check. Full UWB is two-device RANGING (distance/angle to a
 * cooperating peer at ~6.5/8 GHz), NOT passive spectrum sensing, and needs a
 * paired peer + a shared session config — so BandScope reports hardware presence
 * honestly rather than faking a "scan". Only a handful of flagships have UWB.
 */
@CapacitorPlugin(name = "Uwb")
public class UwbPlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        boolean present = pm.hasSystemFeature("android.hardware.uwb");
        JSObject ret = new JSObject();
        ret.put("present", present);
        call.resolve(ret);
    }
}
