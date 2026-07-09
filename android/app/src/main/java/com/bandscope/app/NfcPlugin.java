package com.bandscope.app;

import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;

/**
 * NFC reader mode → tap events. NFC is NOT a scanner: it is a ~1-4 cm, event-
 * driven, fixed-13.56 MHz interface. Emits a "nfcTag" event per tap with UID,
 * tech list, and decoded NDEF text/URI. No signal level exists — categorical
 * only. Needs the NFC permission (manifest) + NFC enabled; no runtime prompt.
 */
@CapacitorPlugin(name = "Nfc")
public class NfcPlugin extends Plugin implements NfcAdapter.ReaderCallback {

    private NfcAdapter adapter;

    @PluginMethod
    public void startReader(PluginCall call) {
        adapter = NfcAdapter.getDefaultAdapter(getContext());
        if (adapter == null) {
            call.reject("No NFC hardware on this device");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("NFC is turned off");
            return;
        }
        final int flags = NfcAdapter.FLAG_READER_NFC_A
            | NfcAdapter.FLAG_READER_NFC_B
            | NfcAdapter.FLAG_READER_NFC_F
            | NfcAdapter.FLAG_READER_NFC_V
            | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS;
        getActivity().runOnUiThread(() ->
            adapter.enableReaderMode(getActivity(), this, flags, null));
        call.resolve();
    }

    @PluginMethod
    public void stopReader(PluginCall call) {
        if (adapter != null && getActivity() != null) {
            getActivity().runOnUiThread(() -> adapter.disableReaderMode(getActivity()));
        }
        call.resolve();
    }

    @Override
    public void onTagDiscovered(Tag tag) {
        JSObject o = new JSObject();
        o.put("uid", bytesToHex(tag.getId()));

        JSArray techs = new JSArray();
        for (String t : tag.getTechList()) {
            techs.put(t.substring(t.lastIndexOf('.') + 1));
        }
        o.put("techList", techs);

        JSArray records = new JSArray();
        Ndef ndef = Ndef.get(tag);
        if (ndef != null) {
            NdefMessage msg = ndef.getCachedNdefMessage();
            if (msg != null) {
                for (NdefRecord r : msg.getRecords()) {
                    records.put(decodeRecord(r));
                }
            }
        }
        o.put("records", records);
        notifyListeners("nfcTag", o);
    }

    private JSObject decodeRecord(NdefRecord r) {
        JSObject rec = new JSObject();
        rec.put("tnf", r.getTnf());
        byte[] payload = r.getPayload();
        try {
            if (r.getTnf() == NdefRecord.TNF_WELL_KNOWN
                    && java.util.Arrays.equals(r.getType(), NdefRecord.RTD_TEXT)) {
                int langLen = payload.length > 0 ? (payload[0] & 0x3F) : 0;
                rec.put("kind", "text");
                rec.put("value", new String(payload, 1 + langLen, payload.length - 1 - langLen,
                    StandardCharsets.UTF_8));
            } else if (r.getTnf() == NdefRecord.TNF_WELL_KNOWN
                    && java.util.Arrays.equals(r.getType(), NdefRecord.RTD_URI)) {
                rec.put("kind", "uri");
                rec.put("value", new String(payload, 1, payload.length - 1, StandardCharsets.UTF_8));
            } else {
                rec.put("kind", "raw");
                rec.put("value", bytesToHex(payload));
            }
        } catch (Exception e) {
            rec.put("kind", "raw");
            rec.put("value", bytesToHex(payload));
        }
        return rec;
    }

    private String bytesToHex(byte[] bytes) {
        if (bytes == null) return "";
        StringBuilder sb = new StringBuilder(bytes.length * 3);
        for (int i = 0; i < bytes.length; i++) {
            if (i > 0) sb.append(':');
            sb.append(String.format("%02X", bytes[i]));
        }
        return sb.toString();
    }
}
