/**
 * UZ Aero - wysokość klawiatury NALEŻĄCEJ DO TEGO EKRANU.
 *
 * `useKeyboardHeight` mówi, czy klawiatura jest w ogóle wysunięta - i to jest właściwa
 * miara dla arkusza, który ma nad nią stanąć. Ekran potrzebuje odpowiedzi węższej:
 * czy pisze się W NIM. Arkusz żyje w osobnym oknie (`Modal`), więc jego klawiatura nie
 * zasłania ekranu pod spodem, a mimo to ekran się o nią kurczył i przewijał listę.
 *
 * Zgłoszenie z urządzenia (2026-09-04): „czasem jak mam na manualnym locie przejście na
 * ekran z przebiegiem operacji, to tak jakby dwa razy muszę kliknąć DALEJ". Mechanizm
 * w całości: `keyboardBorrowedBySheet` w `keyboardGeometry.ts` i `sheetPresence.ts`.
 *
 * ══ GRANICA, KTÓRĄ ZOSTAWIAMY ŚWIADOMIE ══
 * Pożyczka gaśnie dopiero, gdy klawiatura naprawdę zniknie. Gdyby pilot zdążył
 * w te ~300 ms tapnąć pole stojące WPROST NA EKRANIE, a system nie zdążył wysłać
 * `keyboardDidHide`, ekran nie skurczyłby się pod własną klawiaturą. W tej aplikacji
 * ten stan jest nieosiągalny: wartości wpisuje się w ARKUSZACH, a jedyne pola na
 * ekranie (logowanie, PIN) stoją tam, gdzie arkuszy nie ma. Rozróżnienie „czyje jest
 * to pole" wymagałoby pytania o okno, którego RN nie wystawia - a proteza czasowa
 * (wygaszanie pożyczki po N ms) zgadywałaby długość animacji chowania klawiatury.
 *
 * Stan pożyczki trzyma `useState`, a nie ref: jego zmiana MUSI przerysować ekran, bo
 * to od niej zależy wysokość treści.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

import { keyboardBorrowedBySheet } from './keyboardGeometry';
import { sheetsOpen, subscribeSheets } from './sheetPresence';
import { useKeyboardHeight } from './useKeyboardHeight';

export function useOwnKeyboardHeight(): number {
  const raw = useKeyboardHeight();
  const sheetOpen = useSyncExternalStore(subscribeSheets, sheetsOpen);
  const [borrowed, setBorrowed] = useState(false);

  useEffect(() => {
    setBorrowed((prev) => keyboardBorrowedBySheet(prev, raw, sheetOpen));
  }, [raw, sheetOpen]);

  /* Otwarty arkusz zeruje wysokość NATYCHMIAST (bez czekania na efekt): jego okno
     pojawia się razem z klawiaturą, więc ekran nie ma ani chwili, w której powinien
     się pod nią kurczyć. Pożyczka gaśnie później - dopiero gdy klawiatura zniknie. */
  return sheetOpen || borrowed ? 0 : raw;
}
