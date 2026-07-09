# BandScope

**Your phone's radio environment, visualized** — an honest, SDR-style all-radios
visualizer. BandScope renders a live WebGL waterfall of the real signals your
phone can actually hear (GNSS, WiFi, cellular, BLE, NFC, UWB, Bluetooth Classic)
on a true frequency axis, and never fakes a signal it can't measure.

## Honesty first

A stock phone is a **band-activity metadata sensor, not a spectrum analyzer**.
BandScope is built around that truth:

- Every sample carries its real **unit** (dBm / dB / dB-Hz / categorical) and a
  **trust class**: `MEASURED` (WiFi RSSI, cell RSRP, GNSS C/N0) → smooth gradient;
  `DERIVED` (cell bars placed by ARFCN→MHz, BLE advertised power) → hatched;
  `CATEGORICAL` (NFC tap, UWB lock) → discrete glyphs.
- Color is **per-band normalized**, never a fake cross-radio power scale.
- No radio's own transmit RF power is shown as power — only as "activity"
  (throughput), because phones don't expose it.

## Two tiers, one codebase

| Tier | How | Radios |
|---|---|---|
| **Browser PWA** (Docker/GHCR + Cloudflare Tunnel TLS) | served to Chrome on Android | Web NFC, Geolocation (position), chooser-based BLE RSSI |
| **Android APK** (Capacitor, built in GitHub Actions) | same web build + native Kotlin plugins | **everything**: WiFi, cellular, GNSS C/N0, BLE, NFC, UWB, BT Classic |

WiFi scan, cellular signal, per-satellite GNSS, UWB, and BT Classic have **no
browser API** — they exist only in the APK.

## Develop

```bash
npm install
npm run dev        # live mock-data waterfall in a browser
npm test           # unit tests (frequency math, model, normalization, ...)
npm run build      # typecheck + production build
```

See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for the
task-by-task implementation plan.

## License

MIT
