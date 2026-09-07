/**
 * UZ Aero - panel: pole wyszukiwania w pasku filtrów (`.search` z `SZABLON.html`).
 *
 * Cała etykieta jest `<label>` - kliknięcie w lupę ustawia fokus w polu, dokładnie
 * jak w mockupie, i bez własnej obsługi zdarzeń.
 *
 * Skrót `/` ustawia fokus (`docs/architektura-panelu-frontend.md` §7) i jest
 * ogłoszony w `placeholderze`, bo skrót, o którym nikt nie wie, nie istnieje.
 */

import { useEffect, useRef } from 'react';

import { SearchIcon } from './icons';

interface SearchInputProps {
  value: string;
  placeholder: string;
  ariaLabel: string;
  onChange: (value: string) => void;
  /** Wywołane po Enterze - wyszukiwanie jedzie do serwera, nie filtruje wierszy. */
  onSubmit: () => void;
}

export function SearchInput({ value, placeholder, ariaLabel, onChange, onSubmit }: SearchInputProps) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== '/') return;
      // Ukośnik jest znakiem, więc przechwytujemy go WYŁĄCZNIE wtedy, gdy nikt go
      // właśnie nie pisze - inaczej nie dałoby się wpisać go w komentarz do flagi.
      const active = document.activeElement;
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (typing) return;

      event.preventDefault();
      input.current?.focus();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <label className="search">
      <SearchIcon size={13} />
      <input
        ref={input}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit();
        }}
      />
    </label>
  );
}
