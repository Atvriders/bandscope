package com.bandscope.app;

import android.Manifest;
import android.content.Context;
import android.os.Build;
import android.telephony.CellInfo;
import android.telephony.CellInfoGsm;
import android.telephony.CellInfoLte;
import android.telephony.CellInfoNr;
import android.telephony.CellInfoWcdma;
import android.telephony.CellSignalStrengthGsm;
import android.telephony.CellSignalStrengthLte;
import android.telephony.CellSignalStrengthNr;
import android.telephony.CellSignalStrengthWcdma;
import android.telephony.CellIdentityGsm;
import android.telephony.CellIdentityLte;
import android.telephony.CellIdentityNr;
import android.telephony.CellIdentityWcdma;
import android.telephony.TelephonyManager;

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
 * Cellular serving + neighbor cells from TelephonyManager.getAllCellInfo():
 * RSRP/SS-RSRP (dBm), RSSNR/SS-SINR (dB), and the ARFCN (EARFCN/NRARFCN/UARFCN/
 * GSM) which the JS band-plan turns into a real frequency. APK-only — no browser
 * API exposes cellular signal.
 */
@CapacitorPlugin(
    name = "Cellular",
    permissions = {
        @Permission(alias = "phone", strings = { Manifest.permission.READ_PHONE_STATE }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class CellularPlugin extends Plugin {

    private static final int UNAVAILABLE = Integer.MAX_VALUE;

    @PluginMethod
    public void getCells(PluginCall call) {
        if (getPermissionState("phone") != PermissionState.GRANTED
                || getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "phone", "location" }, call, "permCb");
            return;
        }
        emit(call);
    }

    @PermissionCallback
    private void permCb(PluginCall call) {
        if (getPermissionState("phone") == PermissionState.GRANTED
                && getPermissionState("location") == PermissionState.GRANTED) {
            emit(call);
        } else {
            call.reject("Phone state + location permission required for cell info");
        }
    }

    private void emit(PluginCall call) {
        TelephonyManager tm = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
        if (tm == null) {
            call.reject("No TelephonyManager on this device");
            return;
        }
        JSArray cells = new JSArray();
        List<CellInfo> all;
        try {
            all = tm.getAllCellInfo();
        } catch (SecurityException e) {
            call.reject("getAllCellInfo denied: " + e.getMessage());
            return;
        }
        if (all != null) {
            for (CellInfo ci : all) {
                JSObject o = describe(ci);
                if (o != null) cells.put(o);
            }
        }
        JSObject ret = new JSObject();
        ret.put("cells", cells);
        call.resolve(ret);
    }

    private JSObject describe(CellInfo ci) {
        JSObject o = new JSObject();
        o.put("registered", ci.isRegistered());

        if (ci instanceof CellInfoLte) {
            CellInfoLte lte = (CellInfoLte) ci;
            CellIdentityLte id = lte.getCellIdentity();
            CellSignalStrengthLte ss = lte.getCellSignalStrength();
            o.put("rat", "LTE");
            o.put("arfcn", clean(id.getEarfcn()));
            o.put("pci", clean(id.getPci()));
            o.put("powerDbm", ss.getRsrp());
            o.put("rsrqDb", numOrNull(ss.getRsrq()));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                o.put("sinrDb", numOrNull(ss.getRssnr()));
            }
            o.put("mccMnc", mccMnc(id.getMccString(), id.getMncString()));
            return o;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && ci instanceof CellInfoNr) {
            CellInfoNr nr = (CellInfoNr) ci;
            CellIdentityNr id = (CellIdentityNr) nr.getCellIdentity();
            CellSignalStrengthNr ss = (CellSignalStrengthNr) nr.getCellSignalStrength();
            o.put("rat", "NR");
            o.put("arfcn", id.getNrarfcn());
            o.put("pci", clean(id.getPci()));
            o.put("powerDbm", ss.getSsRsrp());
            o.put("rsrqDb", numOrNull(ss.getSsRsrq()));
            o.put("sinrDb", numOrNull(ss.getSsSinr()));
            o.put("mccMnc", mccMnc(id.getMccString(), id.getMncString()));
            return o;
        }
        if (ci instanceof CellInfoWcdma) {
            CellInfoWcdma w = (CellInfoWcdma) ci;
            CellIdentityWcdma id = w.getCellIdentity();
            CellSignalStrengthWcdma ss = w.getCellSignalStrength();
            o.put("rat", "WCDMA");
            o.put("arfcn", clean(id.getUarfcn()));
            o.put("pci", clean(id.getPsc()));
            o.put("powerDbm", ss.getDbm());
            o.put("mccMnc", mccMnc(id.getMccString(), id.getMncString()));
            return o;
        }
        if (ci instanceof CellInfoGsm) {
            CellInfoGsm g = (CellInfoGsm) ci;
            CellIdentityGsm id = g.getCellIdentity();
            CellSignalStrengthGsm ss = g.getCellSignalStrength();
            o.put("rat", "GSM");
            o.put("arfcn", clean(id.getArfcn()));
            o.put("pci", clean(id.getCid()));
            o.put("powerDbm", ss.getDbm());
            o.put("mccMnc", mccMnc(id.getMccString(), id.getMncString()));
            return o;
        }
        return null;
    }

    private int clean(int v) {
        return v == UNAVAILABLE ? 0 : v;
    }

    private Integer numOrNull(int v) {
        return v == UNAVAILABLE ? null : v;
    }

    private String mccMnc(String mcc, String mnc) {
        if (mcc == null || mnc == null) return null;
        return mcc + mnc;
    }
}
