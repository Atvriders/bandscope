# BandScope — an honest, SDR-style all-radios visualizer for your phone

## Context

You want a pocket tool that treats your phone like an SDR: use *every* radio (WiFi, BLE, cellular, GPS/GNSS, NFC, "RFID," and more), show received frequency with SNR and dB, and render a live waterfall so it *feels* like a spectrum analyzer. Your delivery preference is a **browser app, cross-platform, shipped as a Docker image built on GitHub Actions and run via docker-compose** — falling back to an **APK only if the browser can't get full radio access**. Scope you chose: **phone-native only** (no external USB SDR, no root/DIAG), plus the **NFC + UWB + Bluetooth-Classic** and **record/export + wardriving-map** tiers.

Two rounds of parallel research (12 agents) established the ground truth this plan is built on. The headline: a stock phone is a **band-activity metadata sensor, not a spectrum analyzer**, and a **browser can reach almost none of the phone's radios**. The design below gives you the SDR *feeling* honestly, satisfies the Docker/browser route where it's physically possible, and uses a single web codebase that also compiles to a full-access APK — so you don't maintain two apps.

Working name: **BandScope** — *"your phone's radio environment, visualized."*

---

## 1. The hard reality (this drives every decision)

**No phone radio gives you raw IQ or a true swept spectrum.** They give *decoded metadata*: a received-power number per device/cell/satellite. Only three radios expose a real frequency axis with a real signal metric:

| Radio | Real frequency? | dB metric | Real SNR? | Notes |
|---|---|---|---|---|
| **GNSS/GPS** | **Yes** — `getCarrierFrequencyHz()` (L1 1575.42, L5 1176.45 MHz…) | **C/N0 in dB-Hz** — the richest, most SDR-like real data on any phone radio | Closest thing (C/N0 ≠ SNR; label dB-Hz) | Receive-only. Per-satellite. Flagship real-data panel. |
| **WiFi** | **Yes** — exact channel MHz + width (`ScanResult.frequency`, `centerFreq0/1`, `channelWidth`) | RSSI **dBm** | No (no noise floor exposed) | The only radio giving power *and* exact per-emitter frequency together. Scans throttled to 4/2min. |
| **Cellular** | **Derived** — ARFCN→MHz via 3GPP formulas (real frequency, computed) | RSRP **dBm**, RSRQ **dB** | **Yes** — RSSNR / SS-SINR / Ec-No **dB** | LTE/NR/WCDMA/GSM. Serving + neighbor cells. |
| **BLE / BT Classic** | **No** — hops invisibly across 40/79 channels | RSSI **dBm** | No | Gauge/radar/list, never a spectral line. |
| **UWB** | Configured label only (~6.5/8 GHz) | ranging RSSI | No | Two-way *ranging* radar, device-gated (flagships), not spectrum sensing. |
| **NFC** | Nominal 13.56 MHz, never measured | none (categorical) | No | Tap-event log + NDEF, ~1–4 cm. Not a scanner, no waterfall. |
| **RFID (LF/UHF)** | n/a on phone | n/a | n/a | Phones have **no** general RFID reader. NFC (13.56 MHz) is the only native RF-ID. LF/UHF need external readers — out of scope. |

**No phone radio exposes its own transmit RF power** (regulatory-managed in firmware). "TX" is honestly only *traffic activity* (`TrafficStats` bytes, PHY link rate) — shown as activity, never as RF power.

**A browser reaches even less.** Verified late-2025/early-2026 (Chrome Android; iOS Safari supports essentially none):

| Capability in a browser | Status |
|---|---|
| WiFi scan (SSID/BSSID/RSSI/channel) | **Impossible** — no API in any browser, ever |
| Cellular RSRP/RSRQ/SINR/band/ARFCN | **Impossible** — `navigator.connection` gives only coarse `effectiveType`/`downlink`/`rtt` |
| GNSS per-satellite C/N0 / raw measurements | **Impossible** — Geolocation gives *position only* (lat/lon/alt/speed), never C/N0 |
| BLE GATT connect + device RSSI (user picks from chooser) | **Yes** (HTTPS + user gesture) |
| BLE passive "scan the room" RSSI (`requestLEScan`) | **Flag-gated & paused** — behind `chrome://flags/#enable-experimental-web-platform-features`; unusable for normal users |
| NFC (NDEF read/write) | **Yes** — Web NFC (`NDEFReader`), Chrome-Android only, HTTPS |
| Geolocation (position) | **Yes** — HTTPS |
| External USB SDR (real IQ) via WebUSB | **Yes** — but external hardware, out of your chosen scope |

**Docker runs on a server, not the phone** — the container only *serves the web UI*; all radio access happens client-side in the phone's browser (limited set above) or in the native APK (full set). A server-side SDR model (OpenWebRX-style) would scan the *server's* environment, not the phone's, so it does not satisfy "every radio on the phone."

**Conclusion:** the Docker/browser route is real but is a **reduced tier**. Full "every radio" only lands in a native APK. The architecture below ships **both from one codebase**.

---

## 2. Recommended architecture: one web codebase, two tiers (Capacitor)

Use **Capacitor (Ionic)**. One web build runs unchanged as (a) a Docker-served **browser PWA** and (b) a GitHub-Actions-built **Android APK**. `Capacitor.isNativePlatform()` feature-detects the data source; **the entire UI and the WebGL waterfall renderer are identical across both tiers — only the data layer forks.**

```
                    ┌───────────────────────────────────────────────┐
                    │   ONE WEB CODEBASE (TypeScript + Vite)         │
                    │   • WebGL texture-scroll waterfall (regl)      │
                    │   • Compose of gauges / lists / sky-plot / map │
                    │   • CSV/JSON export + MapLibre wardriving map  │
                    │   • capability probe + feature-detected sources│
                    └───────────────┬───────────────────────────────┘
                       build once    │
             ┌─────────────────────┐ │ ┌──────────────────────────────────┐
             │ BROWSER PWA (Docker)│ │ │ ANDROID APK (Capacitor, GH CI)   │
             │ served nginx→GHCR   │ │ │ same web assets in WebView       │
             │ TLS via Cloudflare  │ │ │ + native Kotlin radio plugins    │
             │ Tunnel (secure ctx) │ │ │                                  │
             │ RADIOS:             │ │ │ RADIOS (full):                   │
             │ • Web NFC (NDEF)    │ │ │ • WiFi scan (custom plugin)      │
             │ • Geolocation (pos) │ │ │ • Cellular RSRP/SINR (custom)    │
             │ • BLE GATT RSSI     │ │ │ • GNSS raw C/N0 (custom)         │
             │   (chooser only)    │ │ │ • BLE full passive scan          │
             │                     │ │ │ • NFC full stack                 │
             │ (honest subset)     │ │ │ • UWB, BT Classic                │
             └─────────────────────┘   └──────────────────────────────────┘
```

**Critical correction from research:** Web Bluetooth and WebUSB are **not implemented in the Android System WebView** that Capacitor uses. So inside the APK you do *not* get Web-BLE/USB fallbacks — the APK uses **native plugins for everything**. Real Web-BLE/NFC/USB exist only in the standalone Chrome PWA tier. (Set `androidScheme: 'https'`, `hostname: 'localhost'` so the in-app WebView is a secure context for `crypto.subtle`/geolocation.)

**Rejected alternatives (with reasons):**
- *PWA + native localhost ws:// bridge* — `ws://localhost` from an HTTPS page is blocked as mixed content, and Chrome 142 (Oct 2025) added a Local Network Access prompt + PNA preflight. You'd ship a native app anyway. Strictly worse than Capacitor's in-process bridge.
- *Trusted Web Activity (TWA)* — grants **zero** extra native access; cannot add radios.
- *Server-side SDR (OpenWebRX)* — scans the server, not the phone.
- *Flutter / React Native / Tauri* — every radio needs a hand-written native plugin regardless, and RN/Flutter break the "one web codebase that is also a browser PWA" requirement. Capacitor already has community BLE/NFC/Geolocation plugins.

---

## 3. What works where (the honest matrix to surface in-app)

| Radio / feature | Browser PWA tier | Android APK tier | Plugin |
|---|---|---|---|
| GNSS position (lat/lon) | ✅ Geolocation | ✅ | `@capacitor/geolocation` |
| GNSS per-satellite **C/N0 + sky-plot** | ❌ | ✅ | **custom Kotlin** (`GnssStatus`/`GnssMeasurement`) |
| WiFi scan (AP list, freq, RSSI) | ❌ | ✅ | **custom Kotlin** (`WifiManager`) |
| Cellular bands / RSRP / SINR | ❌ | ✅ | **custom Kotlin** (`TelephonyManager`) |
| BLE — connect one device, read RSSI | ✅ (chooser) | ✅ | `@capacitor-community/bluetooth-le` |
| BLE — passive scan the room | ❌ (flag, paused) | ✅ | same plugin, native path |
| NFC tap / NDEF | ✅ Web NFC | ✅ (+ HCE, ISO-DEP) | `@capawesome-team/capacitor-nfc` (open source) |
| UWB range/bearing radar | ❌ | ✅ (flagships only) | **custom Kotlin** (`androidx.core.uwb`) |
| Bluetooth Classic discovery | ❌ | ✅ | **custom Kotlin** |
| Waterfall + gauges + sky-plot UI | ✅ | ✅ | shared web/WebGL |
| Record / export (CSV/JSON WiGLE-style) | ✅ (thin data) | ✅ (full data) | shared web |
| Wardriving map overlay | ✅ | ✅ | shared web (MapLibre/Leaflet) |

You must write **four custom Kotlin plugins** (WiFi, cellular, raw GNSS, UWB) — there is no maintained free plugin for these. BLE/NFC/Geolocation are covered by community plugins.

---

## 4. Product & UX — feeling like an SDR, honestly

The aesthetic *is* honesty rendered as an instrument-grade UI. Core mechanisms:

- **One broken/fisheye log-frequency axis** (~100 kHz → ~10 GHz) with dead spectrum collapsed and active clusters (GNSS L-band, cellular, WiFi/BLE 2.4/5/6 GHz, UWB) expanded; pinch to pop a cluster full-width.
- **Real GPU waterfall, real cadence.** Rows come from actual scans and scroll at true scan speed (WiFi ~2/min, GNSS/cell ~1 Hz) with a visible "last real update" pulse per radio. Never fake a fast scroll. (WebGL texture-scroll: upload each new row into a ring-buffer texture, scroll by animating the UV offset in-shader, colormap via a 1D LUT — viridis/inferno, colorblind-safe, light+dark.)
- **Three-class provenance grammar, everywhere:**
  1. **Measured received power** (WiFi RSSI, cell RSRP, GNSS C/N0) → smooth gradient — the only marks allowed to look like spectrum.
  2. **Derived / placed** (cell bars placed at computed ARFCN→MHz, BLE advertised TxPower, UWB RSSI) → hatched / lower opacity.
  3. **Categorical events** (NFC tap, UWB lock, BT discovery) → discrete glyphs, never a strength color.
  - A one-tap **"Show provenance"** overlay recolors the whole waterfall by these classes — the single most trust-building feature.
- **Per-band normalized color, never a fake cross-radio scale.** You can't put dBm/dB/dB-Hz on one linear scale; color = per-band 0–1 relative activity, each band keeps its own legend with real unit + range, exact value+unit on tap. Persistent caption: *"colors are normalized per band, not calibrated across radios."*
- **Per-radio detail panels:** WiFi AP list (channel occupancy graph); cell serving hero card + neighbors (RAT, band, ARFCN, MHz, RSRP/RSRQ/SINR gauges, 5G-NSA banner); **GNSS sky-plot** (polar az/el dots colored by constellation, sized by C/N0) + C/N0 bar chart + AGC noise-floor gauge; BLE device list (RSSI, PHY, path-loss distance estimate); NFC tap timeline + NDEF inspector.
- **TX as a separate "Activity" lane** (throughput sparkline, PHY link rate, BLE requested-power tier, NFC HCE state), visually distinct, captioned *"data volume, not RF power,"* with an educational note on *why* phones can't self-measure TX.
- **Capability report card:** first-run probe (`GnssCapabilities.hasMeasurements()`, UWB presence, 6 GHz, root, etc.) → a shareable "what your phone can see" card; every missing capability degrades to a labeled greyed placeholder, never a fabricated value.

---

## 5. Module decomposition (single-purpose boundaries)

Web/TypeScript side (shared by both tiers):
- **`core-model`** — the unified `RfSample` record + `Emission` union (`Markers` | `SpectrumRow` | `Event`), unit enum (`DBM`/`DB`/`DB_HZ`/`CATEGORICAL`/`MBPS`), and `TrustClass` (MEASURED/DERIVED/CATEGORICAL). Sources emit native units and never pre-normalize.
- **`band-plan`** — the frequency math: 3GPP ARFCN→MHz (LTE `F_DL = FDL_low + 0.1·(EARFCN−N_Offs)`, NR global raster, UARFCN, GSM), GNSS carrier→band labels, and the segmented log-axis model. Pure, unit-tested against golden vectors.
- **`sources/`** — one adapter per radio implementing a common `RadioSource { capabilities(); availability(); stream() }`, each feature-detecting Web API vs Capacitor plugin vs "unsupported" stub. No adapter depends on another.
- **`aggregation`** — merges streams, maintains rolling per-band min/max → `normalizedActivity`, deconflicts duplicate APs/cells, keeps ring buffers.
- **`render-engine`** — WebGL (regl/three.js) ring-texture waterfall; consumes normalized rows; renders trust classes distinctly. Radio-agnostic.
- **`ui`** — the Compose of panels, gauges, sky-plot, honesty banner/overlay, permission flows, capability card.
- **`record-export`** — CSV/JSON (WiGLE-compatible), replay into `aggregation` for golden tests.
- **`map`** — MapLibre/Leaflet wardriving overlay (opt-in, anonymization toggle).

Native side (APK only):
- **Custom Kotlin Capacitor plugins**: `WifiScanPlugin`, `CellularPlugin`, `GnssRawPlugin`, `UwbPlugin`, `BtClassicPlugin` — each a thin `@CapacitorPlugin` translating a platform API into the JS `Emission` shape. Community plugins for BLE/NFC/geolocation.

---

## 6. Phased roadmap (each phase = a shippable demo)

**Phase 0 — Skeleton + deploy proof (no radios).** Web shell, WebGL waterfall fed by synthetic rows, map + export scaffolding, capability-probe/feature-detection layer. Docker image → GHCR → docker-compose behind **Cloudflare Tunnel HTTPS**. *Demo:* the waterfall renders and the app is live over HTTPS on your phone — proving render + deploy + secure context end-to-end.

**Phase 1 — Browser PWA tier (the honest browser ceiling).** Light up only what a browser can do: **Web NFC** (tap log + NDEF), **Geolocation** (position + a "position, not per-sat" note), **BLE GATT** RSSI for a chooser-picked device. Ship the PWA. *Demo:* tap a tag → decoded NDEF; connect a BLE device → live RSSI strip; your position on the map. This is the complete Docker/browser product.

**Phase 2 — APK full-radio tier (the "every radio" unlock).** Wrap with Capacitor; add a GitHub-Actions Gradle job emitting a signed APK. Write the custom native plugins: **WiFi scan**, **cellular RSRP/SINR + ARFCN→MHz placement**, **GNSS raw C/N0 + sky-plot**, **full passive BLE scan**. The *same UI* lights these up via feature detection. *Demo:* live dashboard — APs across 2.4/5/6 GHz on the real axis, cells placed by EARFCN/NRARFCN with a serving-cell highlight, GNSS L-band + sky-plot + C/N0 waterfall, BLE proximity — all scrolling as one waterfall with the provenance overlay.

**Phase 3 — Extra tiers (your chosen add-ons).** **UWB** point-at-the-tag range/bearing radar (device-gated), **Bluetooth Classic** discovery snapshot, and **record/export + wardriving map** (geotagged sessions, WiGLE-compatible CSV/JSON, replay, anonymization). *Demo:* export a drive and re-open it as a signal-colored map + replayed waterfall.

**Phase 4 — Optional, explicitly out of your chosen scope.** A WebUSB RTL-SDR receiver panel (the only path to a *genuine* IQ waterfall + real SNR + "watch your own phone transmit" via a second receiver). Clearly labeled "external hardware, not a phone radio." Noted here only so the door is left open.

---

## 7. Deployment & CI (matches your existing workflow)

- **Monorepo**, Vite web build. Multi-stage Dockerfile → nginx static image.
- **GitHub Actions, two jobs in one workflow:**
  1. **Web/Docker:** `docker/build-push-action` → **public GHCR image**; `docker-compose` pulls it.
  2. **APK:** `setup-java` (JDK 17) + Android SDK + `npm ci` + web build + `npx cap sync` + `./gradlew bundleRelease`, signed from a **base64 keystore GitHub secret** (`r0adkll/sign-android-release` or a Gradle `signingConfig`); upload the `.apk`/`.aab` as a release artifact.
- **TLS is mandatory** for the PWA (Web NFC/BLE/Geolocation are secure-context-only): **Cloudflare Tunnel** (your existing pattern, no open ports, free cert) in front of the nginx container. A bare `http://LAN-IP` deploy silently disables every radio API.
- Repos/packages **public** per your standing preference.

---

## 8. Testing & verification

- **JVM/unit (every PR):** `band-plan` frequency math vs checked-in 3GPP golden vectors (EARFCN/NRARFCN/UARFCN/ARFCN → MHz); normalization; axis segmentation; GNSS carrier→band labeling.
- **Web/TS unit:** feature-detection routing, aggregation, colormap LUT, export schema (Vitest).
- **Record/replay golden-master:** capture real `ScanResult`/`CellInfo`/`GnssStatus` traces on a device → replay into `aggregation` + renderer → pixel-diff the waterfall. Decouples renderer correctness from live radios.
- **Native plugin tests:** Robolectric shadows (`ShadowWifiManager`, `ShadowTelephonyManager`) inject synthetic results.
- **Device matrix (per release):** a 5G+UWB+dual-freq-GNSS flagship → a mid-ranger (no UWB, `hasMeasurements()=false`, no 6 GHz) → an old API-26–28 phone; span Qualcomm/Exynos/MediaTek/Pixel (neighbor-cell reporting and raw-GNSS availability diverge by chipset).
- **Fault injection:** WiFi cache-only throttling, denied/approximate location, **Location master switch OFF** (the silent-empty-results trap), absent hardware, Doze, thermal throttle.
- **Per-phase completion gate:** typecheck + unit + Robolectric + replay-golden + **one real-device smoke** before a phase is "done." Evidence before assertions.
- **How to demo each phase:** run the exact *Demo* line under each phase above on a real Android phone over HTTPS (Phase 0–1 in Chrome; Phase 2+ via the installed APK).

---

## 9. Guardrails, risks, open decisions

**Legal / ethical (bake in, not bolt on):**
- Passive-receive only; the default build never transmits. Frame as **RF education & diagnostics**.
- Never decode protected content (cellular voice/encrypted/pager) — surface metadata + signal levels only.
- **Wardriving off by default**, opt-in with purpose acknowledgment + anonymization (hash/truncate BSSID/MAC; honor that peers randomize addresses); offer a foreground-only mode before any background-location ask. Exports flagged privacy-sensitive.
- Region-aware receive note. Store-policy hygiene: declare purpose, minimize retained data, keep the "not a calibrated spectrum analyzer" disclosure visible (background-location + scanning apps get heavy Play review).

**Key risks:**
- **Manage the browser-tier expectation up front** — the Docker/browser build is genuinely a small subset (NFC + position + one-device BLE). Market it as such; the APK is the "every radio" product.
- WiFi scan throttling (4/2 min) → the WiFi waterfall updates slowly; stamp rows with `ScanResult.timestamp` and hold between scans (honest age, no fake freshness).
- UWB is device-gated and point-to-point ranging, not spectrum — set expectations.
- Four custom native plugins are real engineering; budget for them.

**Open decisions to confirm before/at Phase 2:**
- Package name / final app name (working name **BandScope**).
- Git host: GitHub (for Actions/GHCR) vs your Gitea-primary pattern — this project needs GitHub Actions, so GitHub, unless you want Gitea + act_runner.
- Whether to publish the APK to Play Store (adds signing/keystore identity + review overhead) or distribute the artifact directly.

---

## Bottom line

Ship **one Capacitor web codebase** → a **Docker/GHCR PWA** (your preferred route, honest browser subset behind Cloudflare-Tunnel HTTPS) **and** a **GitHub-Actions-built full-access APK** (every radio, via four custom Kotlin plugins + community BLE/NFC/geo). Render everything through **one WebGL waterfall** on a real broken-log frequency axis with a strict measured-vs-derived-vs-categorical provenance grammar, so it feels like an SDR and never fakes a signal it can't measure. Build it in four phases, each a live demo, keeping scope phone-native-only with your NFC/UWB/BT-Classic + record/export/wardriving tiers folded in.
