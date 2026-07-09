# BandScope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an honest, SDR-style all-radios visualizer — one web codebase that renders a live WebGL waterfall of real phone-radio data, shipped as a Docker/GHCR browser PWA and a GitHub-Actions-built full-access Android APK (Capacitor + custom Kotlin plugins).

**Architecture:** A pure-TypeScript core (unified RF sample model, 3GPP frequency math, per-band normalization) drives a WebGL texture-scroll waterfall and a component UI. Each radio is a `RadioSource` adapter that feature-detects its data source: a Capacitor native plugin in the APK, a Web API in the browser, or an "unsupported" stub. The APK is the same web build wrapped by Capacitor; native Kotlin plugins expose WiFi/cellular/GNSS/UWB/BT-Classic which no browser can reach.

**Tech Stack:** TypeScript, Vite, Vitest, regl (WebGL), MapLibre GL, Capacitor 6, Kotlin (Android plugins), GitHub Actions, Docker (nginx), Cloudflare Tunnel (TLS).

## Global Constraints

- **Node 20 / npm** locally; **no Android SDK, Java, or Docker locally** — the APK and Docker image build only in GitHub Actions CI. Web tier is fully locally testable (`npm test`, `npm run build`).
- **Repos and GHCR packages are public.** GitHub is the git host (needs Actions + GHCR); this project does not use the Gitea-primary pattern.
- **One web codebase, two tiers.** UI and WebGL renderer never fork; only the per-radio data source is feature-detected via `Capacitor.isNativePlatform()` + capability probes.
- **Honesty is a hard requirement.** Every sample carries a native `unit` (`DBM`/`DB`/`DB_HZ`/`CATEGORICAL`/`MBPS`) and a `trustClass` (`MEASURED`/`DERIVED`/`CATEGORICAL`). Color is **per-band normalized 0..1**, never a fake cross-radio scale. No radio's own TX RF power is ever shown as power (only as "activity").
- **Secure context is mandatory** for the PWA: Web NFC/BLE/Geolocation require HTTPS. Docker deploy is fronted by Cloudflare Tunnel.
- **APK-only radios** (no browser API exists): WiFi scan, cellular signal, per-satellite GNSS C/N0, UWB, Bluetooth Classic. **Browser-tier radios:** Web NFC, Geolocation (position only), chooser-based BLE GATT RSSI.
- Frequency axis is a **broken/segmented log axis** ~100 kHz → ~10 GHz. C/N0 is labeled **dB-Hz**, never "SNR".

---

## Milestone 1 — Web foundation (locally verifiable, no hardware)

Produces a running app that renders a real WebGL waterfall from a mock/replay data source, with the core model, frequency math, normalization, honesty grammar, and CSV export — all unit-tested. This is the spine both tiers share.

### Task 1: Repo scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `index.html`, `src/main.ts`, `README.md`, `LICENSE`
- Create: `src/style.css`

**Interfaces:**
- Produces: an npm project with scripts `dev`, `build`, `test`, `typecheck`; Vite entry `index.html` → `src/main.ts`.

- [ ] **Step 1:** `npm init -y`, then install dev deps: `npm i -D typescript vite vitest @types/node jsdom`, and runtime deps: `npm i regl gl-matrix maplibre-gl`.
- [ ] **Step 2:** Write `tsconfig.json` (`"strict": true`, `"target": "ES2022"`, `"moduleResolution": "bundler"`, `"types": ["vitest/globals"]`), `vite.config.ts`, and `vitest.config.ts` (`environment: 'jsdom'`, `globals: true`).
- [ ] **Step 3:** Add `package.json` scripts: `"dev":"vite"`, `"build":"tsc --noEmit && vite build"`, `"test":"vitest run"`, `"typecheck":"tsc --noEmit"`.
- [ ] **Step 4:** Minimal `index.html` with `<canvas id="waterfall">` + `<div id="app">`, importing `/src/main.ts`. `src/main.ts` logs "BandScope boot". `.gitignore` for `node_modules`, `dist`, `android`, `.env`.
- [ ] **Step 5:** Run `npm run build` — expect a clean build. Run `npm test` — expect "no tests" success. Commit: `feat: scaffold BandScope web project`.

### Task 2: Core RF sample model

**Files:**
- Create: `src/core/model.ts`
- Test: `src/core/model.test.ts`

**Interfaces:**
- Produces:
  - `enum Unit { DBM, DB, DB_HZ, CATEGORICAL, MBPS }`
  - `enum TrustClass { MEASURED, DERIVED, CATEGORICAL }`
  - `type RadioId = 'gnss'|'wifi'|'cellular'|'ble'|'bt_classic'|'uwb'|'nfc'|'sdr'`
  - `interface RfSample { source: RadioId; tsMs: number; measuredAtMs: number; centerFreqHz: number|null; bandwidthHz: number|null; value: number; unit: Unit; snrDb: number|null; trustClass: TrustClass; identity: string; channel: string|null; extras: Record<string,unknown> }`
  - `type Emission = { kind:'markers'; samples: RfSample[] } | { kind:'row'; freqStartHz:number; binHz:number; powers:Float32Array } | { kind:'event'; radio:RadioId; name:string; payload:Record<string,unknown>; tsMs:number }`
  - `function isMeasured(s: RfSample): boolean` (true when `trustClass===MEASURED`)

- [ ] **Step 1: failing test** — `model.test.ts`: build an `RfSample` for WiFi (`unit:Unit.DBM`, `trustClass:TrustClass.MEASURED`) and assert `isMeasured(s) === true`; build an NFC categorical sample and assert `isMeasured` false.
- [ ] **Step 2:** `npx vitest run src/core/model.test.ts` → FAIL (module missing).
- [ ] **Step 3:** implement `model.ts` with the enums, interfaces, and `isMeasured`.
- [ ] **Step 4:** rerun → PASS.
- [ ] **Step 5:** commit `feat(core): unified RF sample + emission model`.

### Task 3: Band-plan — 3GPP frequency math (the crown-jewel TDD module)

**Files:**
- Create: `src/core/bandplan.ts`
- Test: `src/core/bandplan.test.ts`

**Interfaces:**
- Produces:
  - `function earfcnToHz(earfcn: number): number|null` — LTE downlink, TS 36.101.
  - `function nrarfcnToHz(nrarfcn: number): number|null` — 5G NR global raster, TS 38.104.
  - `function uarfcnToHz(uarfcn: number): number` — WCDMA DL = `uarfcn * 0.2` MHz.
  - `function gsmArfcnToHz(arfcn: number): number|null` — GSM 900/1800/1900 DL.
  - `function wifiChannelToHz(freqMhz: number): number` — pass-through `freqMhz*1e6` (ScanResult already gives MHz; helper validates band).
  - `function gnssBandLabel(carrierHz: number): string` — nearest-of {L1 1575.42, L2 1227.60, L5 1176.45, E5b 1207.14, B1I 1561.098, GLONASS-L1 ~1602} within 3 MHz → label, else `"L-band"`.

- [ ] **Step 1: failing tests** with golden vectors (verify each against a public ARFCN calculator when executing):

```ts
import { earfcnToHz, nrarfcnToHz, uarfcnToHz, gsmArfcnToHz, gnssBandLabel } from './bandplan';

test('LTE EARFCN 6300 (band 20) ≈ 806 MHz DL', () => {
  expect(Math.round(earfcnToHz(6300)! / 1e5) / 10).toBeCloseTo(806.0, 1);
});
test('LTE EARFCN 1575 (band 4) ≈ 2132.5 MHz DL', () => {
  expect(Math.round(earfcnToHz(1575)! / 1e5) / 10).toBeCloseTo(2132.5, 1);
});
test('LTE EARFCN 0 (band 1) = 2110 MHz DL', () => {
  expect(earfcnToHz(0)).toBe(2110_000_000);
});
test('NR-ARFCN 620000 (n78) ≈ 3300 MHz', () => {
  expect(Math.round(nrarfcnToHz(620000)! / 1e6)).toBe(3300);
});
test('NR-ARFCN 2016667 ≈ 24250.02 MHz (FR2 raster)', () => {
  expect(Math.round(nrarfcnToHz(2016667)! / 1e6)).toBe(24250);
});
test('WCDMA UARFCN 10700 = 2140 MHz', () => {
  expect(uarfcnToHz(10700)).toBe(2140_000_000);
});
test('GSM ARFCN 1 = 935.2 MHz (GSM900 DL)', () => {
  expect(Math.round(gsmArfcnToHz(1)! / 1e5) / 10).toBeCloseTo(935.2, 1);
});
test('GNSS carrier 1575.42 MHz → L1', () => {
  expect(gnssBandLabel(1575_420_000)).toBe('L1');
});
test('GNSS carrier 1176.45 MHz → L5', () => {
  expect(gnssBandLabel(1176_450_000)).toBe('L5');
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement `bandplan.ts`. Key formulas:
  - LTE DL: table of band → `(FDL_low MHz, N_Offs_DL, rangeLow, rangeHigh)`; `F = FDL_low + 0.1*(earfcn - N_Offs)`. Include at least bands 1,2,3,4,5,7,8,12,13,20,25,26,38,41,66,71.
  - NR global raster: for `nrarfcn` in `0..599999`: `ΔF=5kHz, F=nrarfcn*5kHz`; `600000..2016666`: `ΔF=15kHz, F=3000MHz+(nrarfcn-600000)*15kHz`; `2016667..3279165`: `ΔF=60kHz, F=24250.08MHz+(nrarfcn-2016667)*60kHz`.
  - WCDMA: `uarfcn*0.2 MHz`.
  - GSM: 900 (`arfcn 1..124` → `935.2 + 0.2*(arfcn-1)`), DCS1800 (`512..885` → `1805.2+0.2*(arfcn-512)`), PCS1900 (`512..810` mapping) — implement 900 + 1800 at minimum for the golden tests.
  - `gnssBandLabel`: nearest known carrier within 3 MHz.
- [ ] **Step 4:** run → PASS (fix formula constants against real calculators until green).
- [ ] **Step 5:** commit `feat(core): 3GPP ARFCN→Hz + GNSS band labeling with golden vectors`.

### Task 4: Segmented log-frequency axis

**Files:**
- Create: `src/core/axis.ts`
- Test: `src/core/axis.test.ts`

**Interfaces:**
- Produces:
  - `interface AxisSegment { loHz:number; hiHz:number; widthFrac:number; label:string }`
  - `const DEFAULT_SEGMENTS: AxisSegment[]` — collapsed-gap clusters: NFC(13.56M), GNSS-L(1.15–1.65G), cellular-low(0.6–1G), cellular-mid(1.7–2.7G), WiFi/BLE-2.4(2.4–2.5G), cellular-C(3.3–4.2G), WiFi-5(5.15–5.9G), WiFi-6E(5.9–7.1G), UWB(6.4–8G).
  - `function freqToX(hz: number, segments?: AxisSegment[]): number|null` — maps Hz → normalized `[0,1]` across concatenated segment widths (log within each segment); `null` if outside all segments.

- [ ] **Step 1: failing test** — assert `freqToX(2412e6)` lands inside the 2.4 GHz segment's fractional range and is between 0 and 1; assert `freqToX(1575.42e6)` lands in the GNSS-L segment; assert a frequency in a collapsed gap returns `null`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement segments (widthFrac normalized to sum 1) + `freqToX` (find segment, log-interpolate lo→hi, offset by preceding segment widths).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(core): segmented log-frequency axis model`.

### Task 5: Per-band normalization

**Files:**
- Create: `src/core/normalize.ts`
- Test: `src/core/normalize.test.ts`

**Interfaces:**
- Produces:
  - `const BAND_RANGE: Record<RadioId,[number,number]>` — realistic floors/ceilings: wifi `[-90,-30]`, ble `[-100,-40]`, cellular `[-140,-44]`, gnss `[10,50]` (dB-Hz), else `[-120,-20]`.
  - `function normalize01(source: RadioId, value: number): number` — clamp `(value-lo)/(hi-lo)` to `[0,1]`.

- [ ] **Step 1: failing test** — `normalize01('gnss',50)===1`, `normalize01('gnss',10)===0`, `normalize01('wifi',-60)` ≈ 0.5, out-of-range clamps to 0/1.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit `feat(core): per-band signal normalization`.

### Task 6: RadioSource interface + mock/replay source + registry

**Files:**
- Create: `src/sources/RadioSource.ts`, `src/sources/MockSource.ts`, `src/sources/registry.ts`
- Test: `src/sources/MockSource.test.ts`

**Interfaces:**
- Produces:
  - `interface SourceCapabilities { hasFrequency:boolean; hasSnr:boolean; trustClass:TrustClass; nominalCadenceHz:number }`
  - `type Availability = { state:'available' } | { state:'unavailable'; reason:string }`
  - `interface RadioSource { id:RadioId; capabilities():SourceCapabilities; availability():Promise<Availability>; stream(signal:AbortSignal, onEmit:(e:Emission)=>void):void }`
  - `class MockSource implements RadioSource` — emits deterministic `markers` Emissions from a seeded generator (WiFi APs, GNSS sats, cells) on a timer; used when no hardware/native bridge.
  - `function buildRegistry(): RadioSource[]` — returns feature-detected sources; on web with no native bridge, returns `[MockSource]` plus any browser-tier sources.

- [ ] **Step 1: failing test** — start a `MockSource`, collect emissions for a few synthetic ticks (inject a fake clock/tick function, don't use real timers), assert it emits `markers` with valid `RfSample`s whose `unit`/`trustClass` are set and `centerFreqHz` non-null for wifi/gnss/cell entries.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (seeded PRNG so tests are deterministic; a `tick()` method the test drives). **Step 4:** PASS. **Step 5:** commit `feat(sources): RadioSource interface + deterministic mock source + registry`.

### Task 7: WebGL texture-scroll waterfall renderer

**Files:**
- Create: `src/render/waterfall.ts`, `src/render/colormap.ts`
- Test: `src/render/colormap.test.ts` (LUT is unit-testable; GL is smoke-tested)

**Interfaces:**
- Produces:
  - `function viridisLut(n:number): Uint8Array` — n×RGBA perceptual colormap LUT.
  - `class Waterfall { constructor(canvas:HTMLCanvasElement, bins:number, rows:number); pushRow(values01: Float32Array, trust: Uint8Array): void; render(): void; dispose(): void }` — ring-buffer texture; `pushRow` uploads one row via `texSubImage2D`; `render` draws with UV-offset scroll; fragment shader applies the LUT and dims non-MEASURED trust classes (hatch via trust texture).

- [ ] **Step 1: failing test** — `colormap.test.ts`: `viridisLut(256)` has length `256*4`, first pixel is dark, last is bright (assert luminance increases monotonically at a few sample points).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `colormap.ts`; then implement `waterfall.ts` with regl (ring texture, single-row `subimage`, UV scroll, LUT + trust in fragment shader). **Step 4:** colormap test PASS.
- [ ] **Step 5:** Add a manual GL smoke: `src/render/smoke.ts` mounted in `main.ts` behind `?smoke=1` that pushes random rows so `npm run dev` shows a scrolling waterfall. Commit `feat(render): WebGL ring-buffer waterfall + viridis LUT`.

### Task 8: App shell wiring (waterfall + honesty grammar + gauge)

**Files:**
- Create: `src/ui/App.ts`, `src/ui/HonestyBanner.ts`, `src/ui/Gauge.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `buildRegistry`, `Waterfall`, `freqToX`, `normalize01`, `DEFAULT_SEGMENTS`.
- Produces: `class App { start(): void }` — subscribes to registry sources, rasterizes each `markers` Emission into a waterfall row (place each sample at `freqToX(centerFreqHz)` bin, color by `normalize01`, trust byte from `trustClass`), pushes rows at scan cadence, and renders a per-band legend + the persistent "normalized per band, not calibrated" banner + a "Show provenance" toggle that recolors by trust class.

- [ ] **Step 1:** implement `App.start()` to run the mock registry end-to-end into the waterfall (no unit test for the DOM glue; verify by dev-server smoke). Add `HonestyBanner` (static text) and a `Gauge` (SVG arc for a single dBm/dB-Hz value).
- [ ] **Step 2:** `main.ts` instantiates `new App().start()`.
- [ ] **Step 3:** `npm run build` clean; `npm run dev` shows a scrolling waterfall fed by mock APs/sats/cells placed on the real axis. Confirm the provenance toggle changes coloring.
- [ ] **Step 4:** commit `feat(ui): app shell wiring mock radios → waterfall with provenance overlay`.

### Task 9: CSV/JSON export (WiGLE-style)

**Files:**
- Create: `src/export/csv.ts`
- Test: `src/export/csv.test.ts`

**Interfaces:**
- Produces: `function toCsv(samples: RfSample[]): string` (header `source,tsMs,centerFreqHz,value,unit,trustClass,identity,channel`), `function toJson(samples: RfSample[]): string`.

- [ ] **Step 1: failing test** — `toCsv([sample])` first line is the header, second line has the sample's values comma-joined; `toJson` round-trips via `JSON.parse`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit `feat(export): CSV/JSON session export`.

**Milestone 1 gate:** `npm run typecheck && npm test && npm run build` all green, and `npm run dev` shows the live mock waterfall with honesty banner + provenance toggle. Commit the milestone.

---

## Milestone 2 — Packaging + CI + first real radio (GNSS)

Wraps the web build as a Capacitor Android app, adds the GNSS raw plugin (richest real data), and stands up both CI jobs. Android/Docker steps are **CI-verified** (not local).

### Task 10: Capacitor Android scaffold

**Files:**
- Create: `capacitor.config.ts`, `android/` (generated)
- Modify: `package.json`

**Interfaces:**
- Produces: an Android project building the web `dist` in a WebView; `capacitor.config.ts` with `{ appId:'com.bandscope.app', appName:'BandScope', webDir:'dist', server:{ androidScheme:'https', hostname:'localhost' } }`.

- [ ] **Step 1:** `npm i @capacitor/core @capacitor/cli @capacitor/geolocation @capacitor-community/bluetooth-le @capawesome-team/capacitor-nfc`.
- [ ] **Step 2:** `npx cap init BandScope com.bandscope.app --web-dir=dist`; edit `capacitor.config.ts` for the `https/localhost` scheme.
- [ ] **Step 3:** `npm run build` then `npx cap add android`. (This scaffolds `android/`; it does **not** need a local build.)
- [ ] **Step 4:** commit `feat(pkg): Capacitor Android scaffold (https scheme)`.

### Task 11: Custom Kotlin GNSS plugin

**Files:**
- Create: `android/app/src/main/java/com/bandscope/app/GnssPlugin.kt`
- Create: `src/sources/native/GnssNativeSource.ts` (JS side calling the plugin)
- Modify: `android/app/src/main/java/com/bandscope/app/MainActivity.java` (register plugin), `android/app/src/main/AndroidManifest.xml` (ACCESS_FINE_LOCATION)

**Interfaces:**
- Produces: a `@CapacitorPlugin(name="Gnss")` Kotlin class exposing `startWatch()` / `stopWatch()` and emitting `gnssStatus` events with per-satellite `{ svid, constellation, cn0DbHz, carrierFreqHz, azimuth, elevation, usedInFix }` via `GnssStatus.Callback` + `GnssMeasurementsEvent.Callback` on `LocationManager`. JS `GnssNativeSource implements RadioSource` maps each satellite into an `RfSample` (`unit:DB_HZ`, `trustClass:MEASURED`, `centerFreqHz:carrierFreqHz`, `value:cn0DbHz`, `snrDb:null`, `channel:'svid '+svid`).

- [ ] **Step 1:** Write `GnssPlugin.kt` (register callbacks, marshal to `JSObject`/`notifyListeners`), request `ACCESS_FINE_LOCATION` via `@Permission`.
- [ ] **Step 2:** Register in `MainActivity` and add the manifest permission.
- [ ] **Step 3:** Write `GnssNativeSource.ts`; in `registry.ts`, when `Capacitor.isNativePlatform()`, include `GnssNativeSource` instead of the GNSS portion of the mock. On web, `availability()` returns `unavailable: "per-satellite GNSS is APK-only"`.
- [ ] **Step 4:** `npm run typecheck && npm run build` green (JS side compiles). Kotlin compiles in CI (Task 13).
- [ ] **Step 5:** commit `feat(radio): native GNSS raw C/N0 plugin + web source`.

### Task 12: GNSS detail panel (sky-plot + C/N0 bars + AGC gauge)

**Files:**
- Create: `src/ui/panels/GnssPanel.ts`
- Test: `src/ui/panels/skyplot.test.ts` (the az/el→x,y projection is unit-testable)

**Interfaces:**
- Produces: `function projectSky(azDeg:number, elDeg:number, r:number): {x:number;y:number}` (polar: elevation 90°=center, 0°=edge), and a `GnssPanel` rendering the polar sky-plot (dots colored by constellation, sized by C/N0), a C/N0 bar chart (0–55 dB-Hz, green/amber/red), and an AGC gauge.

- [ ] **Step 1: failing test** — `projectSky(0,90,100)` ≈ center `{~0,~0}`; `projectSky(0,0,100)` at radius 100 straight up (`y≈-100`); `projectSky(90,0,100)` at `x≈100`.
- [ ] **Step 2:** FAIL. **Step 3:** implement projection + panel SVG. **Step 4:** PASS. **Step 5:** commit `feat(ui): GNSS sky-plot + C/N0 detail panel`.

### Task 13: GitHub Actions — APK + Docker jobs

**Files:**
- Create: `.github/workflows/build.yml`, `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `docs/DEPLOY.md`

**Interfaces:**
- Produces: CI that (job A) builds the web, `npx cap sync android`, `./gradlew bundleRelease`, signs from base64 keystore secrets, uploads the APK artifact; (job B) `docker/build-push-action` builds an nginx image serving `dist` and pushes to `ghcr.io/<owner>/bandscope:latest` (public). `docker-compose.yml` pulls that image; `DEPLOY.md` documents Cloudflare Tunnel TLS.

- [ ] **Step 1:** Write `Dockerfile` (multi-stage: `node:20` build → `nginx:alpine` serving `/dist`), `nginx.conf` (SPA fallback), `docker-compose.yml` (image ref + Cloudflare Tunnel service note), `DEPLOY.md`.
- [ ] **Step 2:** Write `.github/workflows/build.yml`: job A `setup-java@v4` JDK 17 + `android-actions/setup-android` + `npm ci` + `npm run build` + `npx cap sync android` + `gradlew bundleRelease` + `r0adkll/sign-android-release` (secrets: `KEYSTORE_B64`, `KEY_STORE_PASSWORD`, `KEY_PASSWORD`, `ALIAS`) + `upload-artifact`; job B `docker/build-push-action` to GHCR (public).
- [ ] **Step 3:** Push to GitHub; confirm **both jobs green in CI** (this is the Android/Docker verification — there is no local equivalent). Fix until green.
- [ ] **Step 4:** commit `ci: APK signing + GHCR Docker image build`.

**Milestone 2 gate:** web tests green locally; CI builds a signed APK artifact and a public GHCR image; installing the APK on an Android phone shows the live GNSS sky-plot + C/N0 waterfall (real-device smoke).

---

## Milestone 3 — Remaining radios (repeatable plugin pattern)

Each radio is the **same pattern** as Task 11–12: a custom Kotlin `@CapacitorPlugin` (or community plugin) → a JS `RadioSource` mapping to `RfSample` → a detail panel → registry feature-detection → the shared waterfall lights it up. Implement one per task, each with the plugin, source, panel, and a mapping unit test (against a captured JSON trace). Per-radio specifics:

| Task | Radio | Plugin source | Emits → RfSample | Panel |
|---|---|---|---|---|
| 14 | **WiFi** | custom Kotlin `WifiManager.getScanResults()` (throttle 4/2min; stamp `ScanResult.timestamp`) | per-AP `unit:DBM, trust:MEASURED, centerFreqHz:frequency*1e6, bandwidthHz` from channelWidth | AP list + channel-occupancy blocks |
| 15 | **Cellular** | custom Kotlin `TelephonyManager.getAllCellInfo()` + `TelephonyCallback`; ARFCN via `bandplan` | RSRP `unit:DBM, trust:MEASURED`, freq `DERIVED` via `earfcn/nrarfcn/uarfcn/gsmArfcnToHz`; `snrDb` from RSSNR/SS-SINR | serving hero + neighbors, 5G-NSA banner |
| 16 | **BLE** | `@capacitor-community/bluetooth-le` passive scan (native) / GATT-only (web) | RSSI `unit:DBM, trust:MEASURED, centerFreqHz:null` (band bracket) | device list, path-loss estimate |
| 17 | **NFC** | `@capawesome-team/capacitor-nfc` (native) / Web NFC (browser) | `event` Emission, 13.56 MHz fixed marker | tap timeline + NDEF inspector |
| 18 | **UWB** | custom Kotlin `androidx.core.uwb` (device-gated) | `event` range/bearing; ch5≈6.49G/ch9≈7.99G label | range/bearing radar |
| 19 | **BT Classic** | custom Kotlin `BluetoothAdapter.startDiscovery()` (~12s cycles) | RSSI `unit:DBM, trust:MEASURED, centerFreqHz:null` | discovery snapshot list |
| 20 | **Wardriving/map** | app-layer | geotag samples | MapLibre signal-colored map + WiGLE export + replay; anonymization + opt-in |

Each Task 14–20 follows the Task-11 five-step shape: write plugin → write JS source with a mapping test from a captured trace → write panel → wire registry → typecheck/build green + CI green + real-device smoke → commit. Guardrails (passive-RX only, no protected-content decode, wardriving off-by-default + anonymization, Location-master-off detection) are implemented as part of Task 20 and the permission flow.

---

## Self-review notes

- **Spec coverage:** honesty grammar (Tasks 2,7,8), frequency math (3), axis (4), normalization (5), sources/feature-detection (6,11,14-19), waterfall (7,8), GNSS flagship (11,12), NFC/UWB/BT-Classic + record/export/wardriving chosen tiers (17-20), Docker/GHCR + APK CI + Cloudflare TLS (13), device-matrix/replay testing (mapping tests per radio + M2 gate). External SDR + root are intentionally out of scope per the design.
- **Types:** `RfSample`/`Emission`/`RadioSource`/`SourceCapabilities` are defined once (Tasks 2,6) and reused verbatim by every source.
- **TDD applies** to all pure logic (model, bandplan, axis, normalize, mock, colormap, csv, skyplot, per-radio mappers); GL/DOM/native/CI verified by build + dev smoke + CI + real-device smoke.
