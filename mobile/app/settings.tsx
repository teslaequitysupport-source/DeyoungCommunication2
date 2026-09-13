/**
 * Settings — account management on mobile (spec §21): credits balance +
 * history, honest job costs, sign-out, and the door to the full legal/help
 * surfaces (which live on the web platform and open in the system browser
 * via Linking — deliberately NOT a WebView replica of the app).
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { api, baseUrl, signOut } from "@/lib/api";
import type { CreditsView } from "@/lib/types";

const KIND_LABELS: Record<string, string> = {
  SIGNUP_BONUS: "Welcome credits",
  ADMIN_GRANT: "Granted by staff",
  JOB_SPEND: "Job submitted",
  JOB_REFUND: "Refund — work not delivered",
};

export default function SettingsScreen() {
  const [credits, setCredits] = useState<CreditsView | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await api<CreditsView>("/api/account/credits");
    if (res.status === 200 && res.data) setCredits(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openWeb(path: string) {
    await Linking.openURL(`${baseUrl()}${path}`).catch(() => {
      Alert.alert("Cannot open", "No browser is available on this device.");
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Credits</Text>
        {loading ? (
          <ActivityIndicator color="#059669" />
        ) : credits ? (
          <>
            <Text style={styles.balance}>{credits.balance}</Text>
            <Text style={styles.balanceCaption}>credits available</Text>
            <View style={styles.costs}>
              {Object.entries(credits.costs).map(([type, cost]) => (
                <Text key={type} style={styles.costLine}>
                  {type}: {cost === 0 ? "free" : `${cost} credits`}
                </Text>
              ))}
            </View>
            <Text style={styles.policy}>
              Jobs that end without delivering work are refunded
              automatically. No payment provider is integrated in this phase —
              see the Refund Policy (below).
            </Text>
          </>
        ) : (
          <Text style={styles.note}>Could not load your balance.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent activity</Text>
        {credits && credits.history.length > 0 ? (
          <FlatList
            data={credits.history}
            keyExtractor={(e) => e.id}
            style={{ maxHeight: 180 }}
            renderItem={({ item }) => (
              <View style={styles.entry}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryTitle}>
                    {KIND_LABELS[item.kind] ?? item.kind}
                  </Text>
                  <Text style={styles.entryDetail}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>
                </View>
                <Text
                  style={
                    item.delta > 0
                      ? styles.entryDeltaPlus
                      : styles.entryDelta
                  }
                >
                  {item.delta > 0 ? `+${item.delta}` : item.delta}
                </Text>
              </View>
            )}
          />
        ) : (
          <Text style={styles.note}>No credit movements yet.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Legal, help & your data</Text>
        <Text style={styles.policy}>
          The complete legal set, in-app help, data export, and account
          deletion live on the platform — they open in your browser, signed in
          with this device's session.
        </Text>
        <View style={styles.linkColumn}>
          {[
            ["Help & documentation", "/help"],
            ["Privacy Policy (full data map)", "/privacy"],
            ["Terms of Service", "/terms"],
            ["Refund Policy", "/refunds"],
            ["Voice & likeness rights", "/voice-rights"],
          ].map(([label, path]) => (
            <Pressable key={path} onPress={() => void openWeb(path)}>
              <Text style={styles.link}>{label} →</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.danger, pressed && styles.pressed]}
        onPress={async () => {
          await signOut();
          router.replace("/");
        }}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.dangerText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc", padding: 16, gap: 12 },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#052e16" },
  balance: { fontSize: 36, fontWeight: "700", color: "#059669" },
  balanceCaption: { color: "#64748b", marginTop: -4 },
  costs: { gap: 2, marginTop: 6 },
  costLine: { color: "#334155", fontSize: 12, fontFamily: "monospace" },
  policy: { color: "#64748b", fontSize: 12, marginTop: 4 },
  entry: { flexDirection: "row", paddingVertical: 6, gap: 8 },
  entryTitle: { fontWeight: "600", color: "#0f172a" },
  entryDetail: { color: "#64748b", fontSize: 11 },
  entryDelta: { color: "#0f172a", fontWeight: "700" },
  entryDeltaPlus: { color: "#059669", fontWeight: "700" },
  note: { color: "#64748b" },
  linkColumn: { gap: 10, marginTop: 8 },
  link: { color: "#059669", fontWeight: "600" },
  danger: {
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  dangerText: { color: "#dc2626", fontWeight: "600" },
  pressed: { opacity: 0.85 },
});
