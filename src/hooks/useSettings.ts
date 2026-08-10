import { useCallback, useEffect, useState } from "react";
import { getSetting, setSetting } from "@/db/db";

export type ThemePreference = "light" | "dark" | "system";

export interface AppSettings {
  theme: ThemePreference;
  showImages: boolean;
  cardProvider: "local" | "swu-db-api";
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  showImages: true,
  cardProvider: "local"
};

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const theme = await getSetting<ThemePreference>("theme", DEFAULT_SETTINGS.theme);
      const showImages = await getSetting<boolean>("showImages", DEFAULT_SETTINGS.showImages);
      const cardProvider = await getSetting<AppSettings["cardProvider"]>(
        "cardProvider",
        DEFAULT_SETTINGS.cardProvider
      );
      setSettingsState({ theme, showImages, cardProvider });
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const applyDark = (dark: boolean) => root.classList.toggle("light", !dark);

    if (settings.theme === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      applyDark(mql.matches);
      const listener = (e: MediaQueryListEvent) => applyDark(e.matches);
      mql.addEventListener("change", listener);
      return () => mql.removeEventListener("change", listener);
    }
    applyDark(settings.theme === "dark");
  }, [settings.theme]);

  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setSettingsState((prev) => ({ ...prev, [key]: value }));
      await setSetting(key, value);
    },
    []
  );

  return { settings, updateSetting, loaded };
}
