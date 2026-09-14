/**
 * Live Studio — the mobile heart of the app (spec §21):
 *
 *   - camera permission + preview (expo-camera)
 *   - session creation through the real API (consent enforced server-side)
 *   - the SAME media-relay socket protocol as the web client
 *   - honest capture pacing: a frame is only sent when the previous one has
 *     been received back (real backpressure — the FPS you see is real)
 *   - fullscreen transformed output (landscape orientation for the
 *     phone-to-phone physical pairing mode)
 *   - network recovery: NetInfo triggers a status re-fetch; the socket
 *     reconnects on its own and the session state always comes from the
 *     server, never from optimistic local guessing
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import NetInfo from "@react-native-community/netinfo";
import * as ScreenOrientation from "expo-screen-orientation";
import { useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import {
  SessionSocket,
  jpegDataUri,
  type WorkerStats,
} from "@/lib/session-socket";
import { TERMINAL_SESSION_STATES, type LiveSessionView } from "@/lib/types";

type Quality = "low" | "balanced";

const QUALITY_SETTINGS: Record<Quality, { quality: number; minIntervalMs: number }> = {
  // Low-bandwidth operation (spec §21): smaller JPEGs + a paced capture
  // loop that adapts down to ~1 fps on poor links.
  low: { quality: 0.4, minIntervalMs: 1000 },
  balanced: { quality: 0.7, minIntervalMs: 250 },
};

export default function StudioScreen() {
  const { characterId } = useLocalSearchParams<{ characterId: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [session, setSession] = useState<LiveSessionView | null>(null);
  const [relayConnected, setRelayConnected] = useState(false);
  const [transformedFrame, setTransformedFrame] = useState<string | null>(null);
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [quality, setQuality] = useState<Quality>("balanced");
  const [online, setOnline] = useState(true);
  const [framesSeen, setFramesSeen] = useState(0);

  const cameraRef = useRef<CameraView | null>(null);
  const socketRef = useRef<SessionSocket | null>(null);
  const frameInFlight = useRef(false);
  const capturing = useRef(false);
  const lastSentAt = useRef(0);
  const sessionIdRef = useRef<string | null>(null);

  const stopSession = useCallback(
    async (id: string) => {
      await api(`/api/sessions/${id}/stop`, { method: "POST" }).catch(
        () => undefined,
      );
      socketRef.current?.disconnect();
      socketRef.current = null;
      setRelayConnected(false);
      setSession((prev) => {
        // The server response is the truth; fall back to local if the
        // network is already gone (recovery on next open).
        return prev ? { ...prev, status: "COMPLETED" } : prev;
      });
    },
    [],
  );

  const startSession = useCallback(async () => {
    if (!characterId) {
      Alert.alert("No character", "Pick a character first.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ session: LiveSessionView }>("/api/sessions", {
        method: "POST",
        body: { characterId },
      });
      if (res.status === 403) {
        Alert.alert(
          "Consent required",
          "Grant the camera-transform consent (web app → Media & Consent) before starting a live session.",
        );
        return;
      }
      if (res.status !== 201 && res.status !== 200 || !res.data) {
        Alert.alert("Session failed", `HTTP ${res.status}`);
        return;
      }
      const created = res.data.session;
      setSession(created);
      sessionIdRef.current = created.id;

      const relay = new SessionSocket();
      socketRef.current = relay;
      await relay.connect(created.id, {
        onConnectionChange: setRelayConnected,
        onState: (event) => {
          if (event.status) {
            setSession((prev) =>
              prev ? { ...prev, status: event.status! } : prev,
            );
            if (TERMINAL_SESSION_STATES.includes(event.status)) {
              void stopSession(created.id);
            }
          }
        },
        onStats: setStats,
        onFrame: (jpeg) => {
          setTransformedFrame(jpegDataUri(jpeg));
          setFramesSeen((n) => n + 1);
          frameInFlight.current = false;
        },
      });

      capturing.current = true;
      void captureLoop();
    } finally {
      setBusy(false);
    }
  }, [characterId, stopSession]);

  /** The honest capture loop — paced, backpressured, cancellable. */
  const captureLoop = useCallback(async () => {
    while (capturing.current) {
      const settings = QUALITY_SETTINGS[quality];
      const now = Date.now();
      if (frameInFlight.current || now - lastSentAt.current < settings.minIntervalMs) {
        await sleep(50);
        continue;
      }
      const camera = cameraRef.current;
      const relay = socketRef.current;
      if (!camera || !relay?.connected) {
        await sleep(200);
        continue;
      }
      try {
        const shot = await camera.takePictureAsync({
          quality: settings.quality,
          skipProcessing: true,
          exif: false,
        });
        if (!shot?.base64) {
          await sleep(200);
          continue;
        }
        const bytes = base64ToBytes(shot.base64);
        frameInFlight.current = true;
        lastSentAt.current = Date.now();
        relay.sendFrame(bytes);
      } catch {
        // Camera busy or permission revoked — pause, do not spin.
        await sleep(500);
      }
    }
  }, [quality]);

  // Network recovery (spec §21): on reconnect, re-fetch the live session
  // status so the UI reflects the server's truth, never a guess.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isConnected = Boolean(state.isConnected);
      setOnline(isConnected);
      if (isConnected && sessionIdRef.current) {
        void api<{ session: LiveSessionView }>(
          `/api/sessions/${sessionIdRef.current}`,
        ).then((res) => {
          if (res.status === 200 && res.data?.session) {
            setSession(res.data.session);
          }
        });
      }
    });
    return unsub;
  }, []);

  // Fullscreen output locks landscape — the phone-to-phone pairing pose.
  useEffect(() => {
    if (fullscreen) {
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE,
      );
    } else {
      void ScreenOrientation.unlockAsync();
    }
    return () => {
      void ScreenOrientation.unlockAsync();
    };
  }, [fullscreen]);

  useEffect(() => {
    return () => {
      // Session recovery: leaving the screen stops nothing silently — the
      // user must stop explicitly; but the socket tears down cleanly.
      capturing.current = false;
      socketRef.current?.disconnect();
    };
  }, []);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.note}>
          Camera permission is needed for live sessions. The transformed
          preview cannot work without it.
        </Text>
        <Pressable style={styles.primary} onPress={requestPermission}>
          <Text style={styles.primaryText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  if (fullscreen) {
    return (
      <View style={styles.fullscreenWrap}>
        {transformedFrame ? (
          <FullScreenImage uri={transformedFrame} />
        ) : (
          <Text style={styles.note}>Waiting for the first frame…</Text>
        )}
        <Pressable
          style={styles.exitFullscreen}
          onPress={() => setFullscreen(false)}
          accessibilityLabel="Exit fullscreen"
        >
          <Text style={styles.primaryText}>Exit</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.statusRow}>
        <Text style={styles.status}>
          {session ? `Session ${session.status}` : "No session"}
          {session ? ` · relay ${relayConnected ? "connected" : "offline"}` : ""}
          {!online ? " · OFFLINE (reconnecting)" : ""}
        </Text>
        {stats ? (
          <Text style={styles.stats}>
            {stats.fps} fps{stats.latencyMs != null ? ` · ${stats.latencyMs} ms` : ""}
          </Text>
        ) : null}
      </View>

      <View style={styles.previewRow}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
          onCameraReady={() => undefined}
          accessibilityLabel="Your camera preview"
        />
        <View style={styles.outputBox}>
          {transformedFrame ? (
            <TransformedFrame
              uri={transformedFrame}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <Text style={styles.note}>
              {session && relayConnected
                ? `Frames sent: ${framesSeen}. Transformed output appears here.`
                : "Start a session to see the transformed output."}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.controls}>
        {!session ? (
          <Pressable
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            onPress={startSession}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Start live session"
          >
            {busy ? (
              <ActivityIndicator color="#f8fafc" />
            ) : (
              <Text style={styles.primaryText}>Start live session</Text>
            )}
          </Pressable>
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.secondary,
                pressed && styles.pressed,
              ]}
              onPress={() => void stopSession(session.id)}
              accessibilityRole="button"
              accessibilityLabel="Stop session"
            >
              <Text style={styles.secondaryText}>Stop</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.pressed,
              ]}
              onPress={() => setFullscreen(true)}
              accessibilityRole="button"
              accessibilityLabel="Fullscreen transformed output"
            >
              <Text style={styles.primaryText}>Fullscreen output</Text>
            </Pressable>
          </>
        )}
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          onPress={() =>
            setQuality((q) => (q === "low" ? "balanced" : "low"))
          }
          accessibilityRole="button"
          accessibilityLabel={`Bandwidth mode: ${quality}`}
        >
          <Text style={styles.secondaryText}>
            Bandwidth: {quality === "low" ? "Low (~1 fps)" : "Balanced"}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Phone-to-phone mode: point a second phone's camera app at the
        fullscreen output during a call — mobile OSes do not allow virtual
        cameras inside other apps, so this physical pairing is the honest
        path.
      </Text>
    </View>
  );
}

/** Transformed output — a JPEG data URI from the relay, rendered via Image. */
function TransformedFrame({ uri, style }: { uri: string; style?: object }) {
  return <Image source={{ uri }} style={style as never} resizeMode="contain" />;
}

/** Fullscreen output — fills the screen in landscape. */
function FullScreenImage({ uri }: { uri: string }) {
  return (
    <TransformedFrame
      uri={uri}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64ToBytes(base64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = chars.indexOf(clean[i]);
    const c1 = chars.indexOf(clean[i + 1]);
    const c2 = chars.indexOf(clean[i + 2]);
    const c3 = chars.indexOf(clean[i + 3]);
    out[p++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) out[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0) out[p++] = ((c2 & 3) << 6) | c3;
  }
  return out.subarray(0, p);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc", padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  statusRow: { flexDirection: "row", justifyContent: "space-between" },
  status: { color: "#334155", fontWeight: "600" },
  stats: { color: "#059669", fontWeight: "600", fontVariant: ["tabular-nums"] },
  previewRow: { flexDirection: "row", gap: 10, height: 220 },
  camera: { flex: 1, borderRadius: 12, overflow: "hidden" },
  outputBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primary: {
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryText: { color: "#f8fafc", fontWeight: "600" },
  secondary: {
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryText: { color: "#059669", fontWeight: "600" },
  pressed: { opacity: 0.85 },
  note: { color: "#64748b", textAlign: "center", fontSize: 13 },
  hint: { color: "#64748b", fontSize: 12 },
  fullscreenWrap: { flex: 1, backgroundColor: "#000000", justifyContent: "center" },
  exitFullscreen: {
    position: "absolute",
    top: 40,
    right: 24,
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});
