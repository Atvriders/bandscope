# Deploying BandScope

BandScope ships from one repo as two tiers, both built by GitHub Actions
(`.github/workflows/build.yml`).

## Browser / PWA tier (Docker → GHCR → docker-compose)

CI builds `ghcr.io/<owner>/bandscope:latest` (public) on every push to
`master`/`main`. To run it:

```bash
docker compose up -d
```

`docker-compose.yml` exposes the app on `:8087`.

### HTTPS is mandatory

Web NFC, Web Bluetooth, and Geolocation are **secure-context-only**. On a bare
`http://LAN-IP` they silently do nothing and the PWA can't be installed. Put TLS
in front:

- **Cloudflare Tunnel (recommended):** uncomment the `cloudflared` service in
  `docker-compose.yml`, create a named tunnel + token in the Cloudflare
  dashboard, route your hostname to `http://bandscope:80`, and set
  `CLOUDFLARE_TUNNEL_TOKEN` in a `.env` file. No open ports, free cert.
- Or any auto-TLS reverse proxy (Caddy / Traefik) in front of `:8087`.

### Make the GHCR package public

The first publish may be private. In GitHub → your profile/org → **Packages** →
`bandscope` → **Package settings** → set visibility to **Public**.

## Full-access APK tier (Capacitor + Gradle)

The `android-apk` job always builds an **unsigned debug APK** and uploads it as
the `bandscope-debug-apk` artifact — no secrets required. Download it from the
workflow run and sideload:

```bash
adb install app-debug.apk        # or open the file on the phone to install
```

The debug APK is fine for personal use and installs the full radio experience
(GNSS today; more radios in later milestones).

### Optional: signed release APK

To also produce a signed release, create an upload keystore and add these
**repository secrets**:

```bash
keytool -genkey -v -keystore bandscope.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias bandscope
base64 -w0 bandscope.jks           # value for KEYSTORE_B64
```

| Secret | Value |
|---|---|
| `KEYSTORE_B64` | base64 of `bandscope.jks` |
| `KEY_STORE_PASSWORD` | keystore password |
| `KEY_PASSWORD` | key password |
| `KEY_ALIAS` | `bandscope` |

When `KEYSTORE_B64` is present the workflow also builds and uploads
`bandscope-release-apk`. Never commit the keystore; a lost upload key means you
can't update a Play listing under the same identity.

## What runs where

| Radio | Browser PWA | APK |
|---|---|---|
| GNSS per-satellite C/N0 | ❌ (position only) | ✅ |
| WiFi / cellular / UWB / BT-Classic | ❌ (no browser API) | ✅ (later milestones) |
| NFC, BLE (chooser), Geolocation | ✅ | ✅ |

The browser tier is a genuine but reduced experience; the APK is the full
"every radio" build.
