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
    (key, params = {}) => {
      const dictionary = translations[language] || translations[defaultLanguage];
      const fallback = translations[defaultLanguage] || {};
      const template = dictionary?.[key] ?? fallback?.[key] ?? key;
      if (!params || typeof template !== 'string') {
        return template;
      }
      return Object.entries(params).reduce(
        (result, [paramKey, paramValue]) =>
          result.split(`{${paramKey}}`).join(String(paramValue)),
        template
      );
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
