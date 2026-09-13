/**
 * Expo config — extends app.json with environment-specific values.
 *
 * For a real device, set API_URL to your platform host's LAN/production URL:
 *   API_URL=https://your-platform.example.com npx expo start
 * (Or hardcode extra.API_URL here — it is read by src/lib/api.ts.)
 */

import appJson from "./app.json";

export default {
  ...appJson.expo,
  extra: {
    // Default targets the Android emulator host. iOS simulator also
    // accepts http://localhost:3000; physical devices need your machine's
    // LAN IP or the deployed platform URL.
    API_URL: process.env.API_URL ?? "http://10.0.2.2:3000",
  },
};
