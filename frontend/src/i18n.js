// frontend/src/i18n.js
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend"; // 1. Importer le backend HTTP

i18n
  // Load translation using http -> see /public/locales
  .use(Backend) // 2. L'ajouter à la chaîne "use"
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // Init i18next
  .init({
    fallbackLng: "en", // Default language if the detected language is not available
    supportedLngs: ["fr", "en", "es", "it", "de"],
    debug: false,
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
    // 3. Configurer le chemin de chargement des traductions
    backend: {
      loadPath: "/locales/{{lng}}/translation.json",
    },
    detection: {
      order: ["navigator"],
    },
  });

export default i18n;
