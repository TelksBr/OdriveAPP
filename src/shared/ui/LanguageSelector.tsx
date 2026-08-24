import { useState, useRef, useEffect } from 'react';
import type { Locale } from '../../i18n/messages';
import { FlagBR, FlagUS, FlagES } from './FlagIcons';

interface LanguageSelectorProps {
  locale: Locale;
  onChange: (locale: Locale) => void;
}

const LANGUAGES: { id: Locale; label: string; code: string; Flag: typeof FlagBR }[] = [
  { id: 'pt', label: 'Português', code: 'PT', Flag: FlagBR },
  { id: 'en', label: 'English', code: 'EN', Flag: FlagUS },
  { id: 'es', label: 'Español', code: 'ES', Flag: FlagES },
];

export function LanguageSelector({ locale, onChange }: LanguageSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = LANGUAGES.find((lang) => lang.id === locale) ?? LANGUAGES[0];
  const CurrentFlag = current.Flag;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="language-selector" ref={containerRef}>
      <button
        type="button"
        className="language-selector-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Idioma / Language: ${current.label}`}
      >
        <CurrentFlag size={18} />
        <span className="language-selector-code">{current.code}</span>
        <svg
          className={`language-selector-chevron ${open ? 'is-open' : ''}`}
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1 1L5 5L9 1" />
        </svg>
      </button>

      {open && (
        <div className="language-selector-dropdown" role="listbox" tabIndex={-1}>
          {LANGUAGES.map((item) => {
            const ItemFlag = item.Flag;
            const isSelected = item.id === locale;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`language-selector-option ${isSelected ? 'is-selected' : ''}`}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
              >
                <ItemFlag size={18} />
                <span className="language-selector-option-text">{item.label}</span>
                <span className="language-selector-option-code">({item.code})</span>
                {isSelected && (
                  <svg
                    className="language-selector-check"
                    width="12"
                    height="10"
                    viewBox="0 0 12 10"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="1.5 5 4.5 8 10.5 2" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
