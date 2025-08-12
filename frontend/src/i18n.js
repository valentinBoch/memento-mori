// frontend/src/i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";

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
  try {
    i18n.changeLanguage(lng);
    localStorage.setItem("i18nextLng", lng);
  } catch (e) {
    console.error("Failed to change language", e);
  }
};

export const getCurrentLanguage = () =>
  i18n.language || localStorage.getItem("i18nextLng") || "en";

// --- Utilities for theme/accent persistence ---
export const setThemePreference = (theme) => {
  try {
    localStorage.setItem("theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    console.error("Failed to save theme preference", e);
  }
};

export const getThemePreference = () => {
  return localStorage.getItem("theme") || "dark";
};

export const setAccentPreference = (accent) => {
  try {
    localStorage.setItem("accent", accent);
    document.documentElement.setAttribute("data-accent", accent);
  } catch (e) {
    console.error("Failed to save accent preference", e);
  }
};

export const getAccentPreference = () => {
  return localStorage.getItem("accent") || "amber";
};
