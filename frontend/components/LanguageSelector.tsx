import { useState, useEffect, useRef } from 'react';

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
];

export function getStoredLanguage(): string {
  if (typeof window === 'undefined') return 'en';
  return localStorage.getItem('govbot_lang') || 'en';
}

export function setStoredLanguage(code: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('govbot_lang', code);
  }
}

export default function LanguageSelector() {
  const [lang, setLang] = useState(getStoredLanguage);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(code: string) {
    setLang(code);
    setStoredLanguage(code);
    setOpen(false);
  }

  const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-[#ff9933]/50 rounded-lg transition-colors text-xs bg-white"
      >
        <span className="text-sm">🌐</span>
        <span className="text-slate-700">{current.native}</span>
        <span className="text-slate-400 text-[10px]">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl z-50 min-w-[140px] shadow-lg shadow-slate-200/50 overflow-hidden">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => handleSelect(l.code)}
              className={`w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 transition-colors flex items-center justify-between ${
                lang === l.code ? 'text-[#ff9933] font-medium bg-orange-50' : 'text-slate-700'
              }`}
            >
              <span>{l.native}</span>
              <span className="text-slate-400 text-[10px]">{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
