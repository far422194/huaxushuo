import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Lang } from "@/i18n/types";

interface PreferencesState {
  language?: Lang;
  setLanguage: (lang: Lang) => void;
  resetLanguage: () => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      language: undefined,
      setLanguage: (lang) => set({ language: lang }),
      resetLanguage: () => set({ language: undefined }),
    }),
    {
      name: "hxs.preferences",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
