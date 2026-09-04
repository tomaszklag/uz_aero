/**
 * UZ Aero - PRZYCISK ZGŁOSZENIA BŁĘDU (issue #87, na czas testów z pilotami).
 *
 * „Na każdym ekranie i w każdym popup, w prawym górnym rogu" - a że ekranów jest
 * kilkanaście, a arkuszy dwadzieścia, przycisk mieszka w RAMACH, nie w ekranach:
 * `ScreenHeader`, `AppBar` i `SheetSurface`. Nowy ekran dostaje go w chwili powstania,
 * bez ani jednej linijki u siebie - dokładnie tak, jak nowy arkusz dostaje sufit
 * wysokości od `SheetSurface`.
 *
 * ══ ARKUSZ OTWIERA SIĘ TAM, GDZIE STOI PRZYCISK ══
 * Komponent trzyma WŁASNY egzemplarz `BugReportSheet`, zamiast wołać jeden globalny.
 * Powód jest natywny: `Modal` na Androidzie to osobne okno, a okno otwarte z korzenia
 * aplikacji nie ma gwarancji, że stanie NAD oknem arkusza, z którego pilot je wywołał.
 * Arkusz zgłoszenia zamontowany wewnątrz tamtego okna ma tę gwarancję z definicji.
 * Egzemplarzy jest wiele, otwarty bywa jeden - a niewidoczny arkusz nie renderuje nic
 * poza `Modal visible={false}`.
 *
 * ══ PRZYCISK JEST CICHY ══
 * Ta sama szarość, co zębatka. Amber przy każdym nagłówku przez cały dzień testów
 * uczyłby oko pomijać róg ekranu - dokładnie ten błąd, który issue #12 wyrzuciło
 * z SyncChipa. Kolor niesie dopiero arkusz.
 *
 * 32 dp widocznego celu i `hitSlop` 8. Pełne 44 dp kwadratu rozpychałoby nagłówek
 * i zwężało tytuł - a na ekranie 10 tytułem jest SYGNATURA operacji, czyli
 * identyfikator, który ucięty przestaje identyfikować. `hitSlop` dokłada zapas tam,
 * gdzie mieści się w granicach rodzica (Android nie dostarcza dotknięć poza nie).
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../theme';
import { Icon } from '../foundation/Icon';
import { BUG_REPORTER_ENABLED } from './bugReporter';
import { BugReportSheet } from './BugReportSheet';

export interface BugButtonProps {
  /**
   * Tytuł ARKUSZA, w którym stoi przycisk - `null` na ekranie.
   *
   * Rama podaje go sama (`SheetSurface.contextLabel`), bo tylko ona wie, czy jest
   * arkuszem. Ekran nie podaje niczego: jego tożsamość bierze się z trasy nawigacji
   * (`bugReporter.bugRoute()`), a nie z tytułu, który na ekranie 10 jest sygnaturą
   * operacji i zmienia się co lot.
   */
  sheet?: string | null;
}

export function BugButton({ sheet = null }: BugButtonProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);

  if (!BUG_REPORTER_ENABLED) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zgłoś błąd"
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Icon name="bug" size={17} color={theme.colors.textMuted} />
      </Pressable>

      <BugReportSheet visible={open} sheet={sheet} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
