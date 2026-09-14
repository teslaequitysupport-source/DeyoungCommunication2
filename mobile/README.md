# Live Character Platform — Mobile (Expo)

The React Native (Expo Router) companion app for the AI Live Character
Platform. It is a **real native app, not a WebView wrapper**: the camera
stream, the media-relay socket, credit views, uploads, and session
lifecycle all run natively against the same platform APIs the web app
uses.

## What is implemented (spec §21 mapping)

| Requirement | Implementation |
|---|---|
| Camera / microphone permissions | `expo-camera` + `useCameraPermissions`; permission strings in `app.json` (declared honestly: video flows, mic reserved for future voice transforms) |
| Live sessions | `POST /api/sessions` + the same socket.io relay protocol the web client speaks (ticket auth, binary `frame` events, `session-state`, `stats`) |
| Transformed preview | Relay frames (JPEG) rendered natively via `Image` |
| Character selection | Characters screen (list/create) → Go live |
| Media upload | `expo-image-picker` → real file size → presign → PUT → per-asset consent grant |
| Media download | Assets are served ownership-checked via the platform's authenticated endpoints (Settings → web surfaces) |
| Session recovery | Socket.io auto-reconnect + `NetInfo` listener re-fetches the server-authoritative session state |
| Network recovery | Same NetInfo path — the UI shows OFFLINE and syncs state on reconnect |
| Low-bandwidth operation | Bandwidth toggle: `low` = 0.4-quality JPEGs paced at ≥1 s intervals; `balanced` = 0.7/250 ms. Frame sends are backpressured (a new frame goes out only after the previous one returns) |
| Orientation handling | `expo-screen-orientation` unlock globally; landscape lock in fullscreen |
| Fullscreen live output | Fullscreen button fills the screen with the transformed stream — the phone-to-phone physical pairing pose |
| Account management | Settings: credits balance/history/costs, sign-out, links to legal/help/data controls |
| Notifications | **Not implemented** — deliberately. No push notification provider is configured on the platform; when one is, this line changes with the code. |

## Auth model

The platform uses Better Auth cookie sessions. The app stores the signed
session cookie in `expo-secure-store` (device keystore/keychain) and
attaches it to every request — never AsyncStorage, never plaintext.

**Deployment requirement:** add the app's origin (Expo Go `exp://` URL or
your custom scheme `livechar://`) to the platform's `TRUSTED_ORIGINS`
environment variable, exactly as you would any other trusted client.

## Running it

```bash
cd mobile
bun install            # or npm install
API_URL=http://<your-machine-lan-ip>:3000 npx expo start
```

- Android emulator: default `http://10.0.2.2:3000` works with no override.
- iOS simulator: `API_URL=http://localhost:3000`.
- Physical device: your machine's LAN IP (same Wi-Fi), or the deployed
  platform URL.
- Media relay: the app derives the relay URL from the API URL (port 3031
  in dev). In production the relay sits behind the same domain.

## Honest status (per the build specification's no-fake-claims rule)

- The code is complete and typed, written against the platform's real API
  and relay protocol.
- It has **not been compiled or run in this build environment**: the Expo
  toolchain + a device/simulator are required. Treat the first `expo
  start` as the integration test: dependency versions above target
  Expo SDK 53 but may need `npx expo install --fix` pinning.
- Capture uses `takePictureAsync` in a paced loop (1–4 fps depending on
  the bandwidth mode) — an honest, universally-compatible capture path,
  not a frame-processor pipeline. Upgrading to camera frame processors
  is the known next step for higher fps.

## Layout

```
mobile/
  app.json / app.config.js   Expo config (permissions, scheme, API_URL)
  app/
    _layout.tsx               Root stack + orientation + auth redirect
    index.tsx                 Sign-in / sign-up
    characters.tsx            Characters + face upload with consent
    studio.tsx                Live session: camera, relay, fullscreen, recovery
    settings.tsx              Credits, legal links, sign-out
  src/lib/
    api.ts                    Cookie-session API client (SecureStore)
    session-socket.ts         Relay protocol client + binary helpers
    types.ts                  Shared platform types
```
