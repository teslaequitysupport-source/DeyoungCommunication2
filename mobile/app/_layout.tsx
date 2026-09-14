import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import * as ScreenOrientation from "expo-screen-orientation";
import { hasSession } from "@/lib/api";
import { router } from "expo-router";

export default function RootLayout() {
  // Unlock orientation globally: the studio goes landscape for fullscreen
  // output; every other screen stays portrait (spec §21 orientation).
  useEffect(() => {
    void ScreenOrientation.unlockAsync();
  }, []);

  useEffect(() => {
    void hasSession().then((authed) => {
      if (authed) router.replace("/characters");
    });
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#f8fafc" },
          headerTitleStyle: { color: "#052e16", fontWeight: "600" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Live Character Platform" }} />
        <Stack.Screen name="characters" options={{ title: "Characters" }} />
        <Stack.Screen name="studio" options={{ title: "Live Studio" }} />
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
      </Stack>
    </>
  );
}
