/**
 * Characters — list, create, and (the mobile-specific parts of the
 * pipeline) upload a face image from the device gallery with per-asset
 * consent. Runs the SAME presign → PUT → consent flow as the web app.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { router } from "expo-router";
import { api } from "@/lib/api";
import type { AssetView, Character } from "@/lib/types";

export default function CharactersScreen() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ characters: Character[] }>("/api/characters");
    if (res.status === 200 && res.data) {
      setCharacters(res.data.characters);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCharacter() {
    if (!name.trim()) {
      Alert.alert("Name required", "Give the character a name first.");
      return;
    }
    setCreating(true);
    try {
      const res = await api<{ character: Character }>("/api/characters", {
        method: "POST",
        body: { name: name.trim() },
      });
      if (res.status !== 201 || !res.data) {
        Alert.alert("Could not create", `HTTP ${res.status}`);
        return;
      }
      setName("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function pickAndUploadFace() {
    // 1. Pick an image (library permission is requested by the picker).
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const image = picked.assets[0];

    setUploading(true);
    try {
      // 2. Stat the real file — the presign declaration must be honest.
      const info = await FileSystem.getInfoAsync(image.uri);
      if (!info.exists) throw new Error("Picked file vanished.");
      const sizeBytes =
        "size" in info && typeof info.size === "number"
          ? info.size
          : (await FileSystem.readAsStringAsync(image.uri, {
              encoding: FileSystem.EncodingType.Base64,
            })).length * 0.75;

      // 3. Presign (kind FACE_IMAGE, real MIME + size).
      const presignRes = await api<{
        mode: string;
        uploadUrl: string;
      }>("/api/assets/presign", {
        method: "POST",
        body: {
          kind: "FACE_IMAGE",
          mimeType: "image/jpeg",
          sizeBytes,
        },
      });
      if (presignRes.status !== 200 || !presignRes.data) {
        throw new Error(`Presign failed (HTTP ${presignRes.status})`);
      }

      // 4. Upload the real file bytes. RN fetch cannot send binary bodies
      //    from strings — expo-file-system's uploadAsync does the binary
      //    PUT against both backends: local-dev server mode (ticket in the
      //    query string) and direct R2 presigned mode.
      const uploadResult = await FileSystem.uploadAsync(
        presignRes.data.uploadUrl,
        image.uri,
        {
          httpMethod: "PUT",
          headers: { "content-type": "image/jpeg" },
          uploadType: FileSystem.FileSystemUploadType.BINARY,
        },
      );
      if (uploadResult.status !== 200) {
        throw new Error(`Upload failed (HTTP ${uploadResult.status})`);
      }
      const uploaded = JSON.parse(uploadResult.body) as { asset: AssetView };

      // 5. Grant the per-asset consent (purpose-scoped, withdrawable).
      const consentRes = await api("/api/consent", {
        method: "POST",
        body: {
          assetId: uploaded.asset.id,
          purpose: "face.transform.offline",
        },
      });
      if (consentRes.status !== 201 && consentRes.status !== 200) {
        throw new Error(
          `Consent grant failed (HTTP ${consentRes.status}) — the upload exists but cannot be used for transforms until consent is granted.`,
        );
      }

      Alert.alert(
        "Face uploaded",
        "The image is stored and consent recorded. You can transform it in a live session or withdraw consent any time on the web app.",
      );
    } catch (e) {
      Alert.alert(
        "Upload failed",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      setUploading(false);
    }
  }

  async function startSession(characterId: string) {
    // Navigate with the character preselected — the studio screen creates
    // the session itself (consent is checked server-side at that moment).
    router.push({ pathname: "/studio", params: { characterId } });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.createRow}>
        <TextInput
          style={styles.input}
          placeholder="New character name"
          value={name}
          onChangeText={setName}
          accessibilityLabel="New character name"
        />
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={createCharacter}
          disabled={creating}
          accessibilityRole="button"
          accessibilityLabel="Create character"
        >
          {creating ? (
            <ActivityIndicator color="#f8fafc" />
          ) : (
            <Text style={styles.buttonText}>Create</Text>
          )}
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
        onPress={pickAndUploadFace}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel="Upload a face image with consent"
      >
        {uploading ? (
          <ActivityIndicator color="#059669" />
        ) : (
          <Text style={styles.secondaryText}>
            Upload a face image (consent asked per upload)
          </Text>
        )}
      </Pressable>

      <FlatList
        data={characters}
        keyExtractor={(c) => c.id}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={load} />
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.characterCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.characterName}>{item.name}</Text>
              <Text style={styles.characterStatus}>
                {item.status} · created{" "}
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
              onPress={() => startSession(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Start live session as ${item.name}`}
            >
              <Text style={styles.buttonText}>Go live</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No characters yet — create one above, then go live.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc", padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  createRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#ffffff",
    color: "#0f172a",
  },
  button: {
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
  buttonText: { color: "#f8fafc", fontWeight: "600" },
  secondary: {
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  secondaryText: { color: "#059669", fontWeight: "600" },
  list: { gap: 10, paddingBottom: 32 },
  characterCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14,
  },
  characterName: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  characterStatus: { fontSize: 12, color: "#64748b", marginTop: 2 },
  empty: { color: "#64748b", textAlign: "center", marginTop: 24 },
});
