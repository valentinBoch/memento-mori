// frontend/src/i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";

const SUPPORTED_LANGUAGES = new Set(["fr", "en", "es", "it", "de"]);
const SUPPORTED_THEMES = new Set(["dark", "light"]);
const SUPPORTED_ACCENTS = new Set(["amber", "teal", "indigo"]);

// Notes:
// - nonExplicitSupportedLngs maps e.g. "fr-FR" -> "fr" when only base languages are provided.
// - detection caches the chosen language to localStorage/cookie so we avoid flicker on reload.
// - load: 'languageOnly' strips regions to keep bundles small (en-US -> en).

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: ["en"],
    supportedLngs: ["fr", "en", "es", "it", "de"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    debug: false,
    returnNull: false, // prefer empty strings over nulls in the UI
    interpolation: {
      escapeValue: false, // React already escapes
    },
    backend: {
      // Where translation files live (served from public/)
      loadPath: "/locales/{{lng}}/translation.json",
    },
    detection: {
      // Order matters: prefer previously selected language, then system
      order: ["localStorage", "cookie", "navigator", "htmlTag", "querystring"],
      lookupQuerystring: "lng",
      lookupCookie: "i18next",
      lookupLocalStorage: "i18nextLng",
      caches: ["localStorage", "cookie"],
      cookieMinutes: 525600, // 1 year
    },
    // React i18next options
    react: {
      useSuspense: false, // avoid suspense boundary flicker in simple apps
    },
  });

export default i18n;

// --- Utilities for language switching and persistence ---
export const setLanguage = (lng) => {
  const safeLanguage = SUPPORTED_LANGUAGES.has(lng) ? lng : "en";
  try {
    i18n.changeLanguage(safeLanguage);
    localStorage.setItem("i18nextLng", safeLanguage);
    document.documentElement.lang = safeLanguage;
  } catch (e) {
    console.error("Failed to change language", e);
  }
};

export const getCurrentLanguage = () =>
  (i18n.resolvedLanguage || i18n.language || localStorage.getItem("i18nextLng") || "en")
    .split("-")[0];

// --- Utilities for theme/accent persistence ---
export const setThemePreference = (theme) => {
  const safeTheme = SUPPORTED_THEMES.has(theme) ? theme : "dark";
  try {
    localStorage.setItem("theme", safeTheme);
    document.documentElement.setAttribute("data-theme", safeTheme);
    document.documentElement.style.colorScheme = safeTheme;
  } catch (e) {
    console.error("Failed to save theme preference", e);
  }
};

export const getThemePreference = () => {
  const storedTheme = localStorage.getItem("theme");
  return SUPPORTED_THEMES.has(storedTheme) ? storedTheme : "dark";
};

export const setAccentPreference = (accent) => {
  const safeAccent = SUPPORTED_ACCENTS.has(accent) ? accent : "amber";
  try {
    localStorage.setItem("accent", safeAccent);
    document.documentElement.setAttribute("data-accent", safeAccent);
  } catch (e) {
    console.error("Failed to save accent preference", e);
  }
};

export const getAccentPreference = () => {
  const storedAccent = localStorage.getItem("accent");
  return SUPPORTED_ACCENTS.has(storedAccent) ? storedAccent : "amber";
};
