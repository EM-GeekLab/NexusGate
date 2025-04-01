import i18n from 'i18next';
import { initReactI18next } from'react-i18next';
import LanguageDetector from 'i18next - browser - languagedetector';
import enUS from './locales/en - US.json';
import zhCN from './locales/zh - CN.json';

i18n
.use(LanguageDetector)
.use(initReactI18next)
.init({
  resources: {
    en: {
      translation: enUS
    },
    zh: {
      translation: zhCN
    }
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
});

export default i18n;