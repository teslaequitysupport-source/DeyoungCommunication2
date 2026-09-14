/**
 * Sign-in / sign-up — the first screen. Real auth against the platform's
 * Better Auth endpoints; the session cookie lives in SecureStore.
 */

import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { signIn, signUp } from "@/lib/api";

export default function SignInScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password || (mode === "signup" && !name.trim())) {
      Alert.alert("Missing details", "Fill in every field to continue.");
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === "signin"
          ? await signIn(email.trim(), password)
          : await signUp(name.trim(), email.trim(), password);
      if (!result.ok) {
        Alert.alert("Could not continue", result.message ?? "Try again.");
        return;
      }
      router.replace("/characters");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <View style={styles.mark} accessibilityLabel="Live Character Platform" />
        <Text style={styles.title}>Live Character Platform</Text>
        <Text style={styles.subtitle}>
          Create a character, grant consent, and transform your live camera
          through a real worker.
        </Text>

        {mode === "signup" && (
          <TextInput
            style={styles.input}
            placeholder="Display name"
            autoCapitalize="words"
            value={name}
            onChangeText={setName}
            accessibilityLabel="Display name"
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          accessibilityLabel="Email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          accessibilityLabel="Password"
        />

        <Pressable
          style={({ pressed }) => [
            styles.primary,
            (pressed || busy) && styles.primaryPressed,
          ]}
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={
            mode === "signin" ? "Sign in" : "Create account"
          }
        >
          {busy ? (
            <ActivityIndicator color="#f8fafc" />
          ) : (
            <Text style={styles.primaryText}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
          accessibilityRole="button"
        >
          <Text style={styles.switchText}>
            {mode === "signin"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
  },
  card: {
    margin: 24,
    padding: 24,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 12,
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#052e16",
    borderWidth: 4,
    borderColor: "#34d399",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#052e16",
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#0f172a",
  },
  primary: {
    backgroundColor: "#059669",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryPressed: {
    opacity: 0.85,
  },
  primaryText: {
    color: "#f8fafc",
    fontWeight: "600",
    fontSize: 16,
  },
  switchText: {
    color: "#059669",
    textAlign: "center",
    marginTop: 4,
  },
});
