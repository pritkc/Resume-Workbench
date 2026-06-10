'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  fetchLanguageConfig,
  updateLanguageConfig,
  type SupportedLanguage,
} from '@/lib/api/config';
import { localeNames, type Locale } from '@/i18n/config';

const CONTENT_STORAGE_KEY = 'resume_matcher_content_language';
const UI_STORAGE_KEY = 'resume_matcher_ui_language';

const EN: Locale = 'en';

interface LanguageContextValue {
  contentLanguage: SupportedLanguage;
  uiLanguage: Locale;
  isLoading: boolean;
  setContentLanguage: (lang: SupportedLanguage) => Promise<void>;
  setUiLanguage: (lang: Locale) => void;
  languageNames: typeof localeNames;
  supportedLanguages: readonly Locale[];
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [contentLanguage, setContentLanguageState] = useState<SupportedLanguage>(EN);
  const [uiLanguage, setUiLanguageState] = useState<Locale>(EN);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadLanguages = async () => {
      try {
        localStorage.setItem(UI_STORAGE_KEY, EN);
        localStorage.setItem(CONTENT_STORAGE_KEY, EN);
        setUiLanguageState(EN);
        setContentLanguageState(EN);

        const config = await fetchLanguageConfig();
        if (config.content_language !== EN || config.ui_language !== EN) {
          await updateLanguageConfig({ content_language: EN, ui_language: EN });
        }
      } catch (error) {
        console.error('Failed to load language config:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadLanguages();
  }, []);

  const setContentLanguage = useCallback(async () => {
    /* English only — no-op for API compatibility */
  }, []);

  const setUiLanguage = useCallback(() => {
    /* English only — no-op for API compatibility */
  }, []);

  return (
    <LanguageContext.Provider
      value={{
        contentLanguage,
        uiLanguage,
        isLoading,
        setContentLanguage,
        setUiLanguage,
        languageNames: localeNames,
        supportedLanguages: [EN],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
