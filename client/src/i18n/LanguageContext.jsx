import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { defaultLanguage, translations } from './translations.js';

const LanguageContext = createContext({
  language: defaultLanguage,
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(defaultLanguage);

  const t = useCallback(
    (key) => {
      const dictionary = translations[language] || translations[defaultLanguage];
      const fallback = translations[defaultLanguage] || {};
      return dictionary?.[key] ?? fallback?.[key] ?? key;
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
    }),
    [language, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
