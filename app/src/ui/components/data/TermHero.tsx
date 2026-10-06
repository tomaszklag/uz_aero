/**
 * Ninerdeck - TermHero (`.hero` z makiet 23, 28, 32): TERMIN jako bohater karty.
 *
 * Data i stan w jednej linii, godziny pod nimi, a niżej strefa, długość i odliczanie.
 * Godziny stoją POGRUBIONYM KROJEM CYFR (mono 26), a nie krojem nagłówkowym - to odczyt
 * terminu, nie tytuł ekranu. Wygląd idzie 1:1 za makietą; karta rezerwacji (23) stoi na
 * tym samym komponencie (decyzja właściciela 2026-10-06). Karta decyzji (26) bohatera
 * terminu nie ma - tam termin jest jednym z wierszy, bo ekran pyta o decyzję, nie o godzinę.
 *
 * ══ TON KARTY MÓWI, CZYJA TO RZECZ ══
 *  - `blue`  - zlecenie: pytanie klubu, jeszcze niczyje (28, 32);
 *  - `green` - moja rezerwacja w normie (23);
 *  - `amber` - czeka na cudzą decyzję (23B);
 *  - `neutral` - cudza rezerwacja w normie: zwykła ramka karty, jak szary pasek cudzej
 *              rezerwacji na osi (decyzja właściciela 2026-10-06) - zieleń mówi „moje";
 *  - `off`   - zapis zamknięty: neutralna ramka, przygaszone godziny, bez odliczania
 *              (28B, 23C) - lot może się odbyć, ale liczenie do niego byłoby cudzym zegarem.
 * Gradientu z makiety nie ma - RN nie rysuje go bez modułu natywnego (ta sama reguła,
 * co w `FleetAxis` i `SessionHero`); ton niosą obramowanie i kolor odliczania.
 *
 * „było 09:00-11:00" stoi pod godzinami WYŁĄCZNIE po zmianie terminu (28C): poprzedni
 * termin pada przy liczbie, której dotyczy, a nie w historii, której nikt nie otworzy.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors } from '../tone';

export type TermHeroTone = 'blue' | 'green' | 'amber' | 'neutral' | 'off';

/** `dim` i `neutral` wyglądają tak samo - oba mówią „to już nie czeka na Ciebie". */
export type TermBadgeTone = 'blue' | 'green' | 'amber' | 'red' | 'neutral' | 'dim';

export interface TermHeroProps {
  /** „Sobota · 3 października" - wersaliki dokłada komponent. */
  date: string;
  badge: { text: string; tone: TermBadgeTone } | null;
  /** „09:00 → 11:00". */
  hours: string;
  /** „było 09:00-11:00" - wyłącznie po zmianie terminu. */
  was?: string | null;
  /** „2 h". */
  length: string;
  /**
   * „SP-ANA · AN-2" - maszyna w linii terminu, gdy karta nie ma wiersza „Samolot" (32):
   * prowadzący pyta „kiedy i czym", a odpowiedź ma stać razem.
   */
  aircraft?: string | null;
  /** „ZA 1 DZIEŃ 14 H"; `null` = bez odliczania. */
  countdown?: string | null;
  tone: TermHeroTone;
}

export function TermHero({ date, badge, hours, was = null, length, aircraft = null, countdown = null, tone }: TermHeroProps) {
  const { theme } = useTheme();
  const s = styles(theme);
  const off = tone === 'off';
  const accent = off ? theme.colors.textMuted : toneColors(theme, tone).accent;

  return (
    <View style={[s.hero, { borderColor: off ? theme.colors.borderStrong : toneColors(theme, tone).border }]}>
      <View style={s.top}>
        <AppText variant="mono" style={s.date}>
          {date}
        </AppText>
        {badge != null && <Badge text={badge.text} tone={badge.tone} theme={theme} />}
      </View>

      <AppText variant="mono" style={[s.hours, off && s.hoursOff]}>
        {hours}
      </AppText>
      {was != null && (
        <AppText variant="mono" style={s.was}>
          {was}
        </AppText>
      )}

      <View style={s.meta}>
        <AppText variant="mono" style={s.zone}>
          czas klubu
        </AppText>
        <AppText variant="mono" style={s.length}>
          {length}
        </AppText>
        {aircraft != null && (
          <AppText variant="mono" style={s.aircraft}>
            {aircraft}
          </AppText>
        )}
        {countdown != null && !off && (
          <AppText variant="display" style={[s.countdown, { color: accent }]}>
            {countdown}
          </AppText>
        )}
      </View>
    </View>
  );
}

/** `.hero-badge` - pigułka stanu; neutralna na tle o stopień jaśniejszym niż karta. */
function Badge({ text, tone, theme }: { text: string; tone: TermBadgeTone; theme: Theme }) {
  const s = styles(theme);
  const plain = tone === 'dim' || tone === 'neutral';
  const c = plain ? null : toneColors(theme, tone);

  return (
    <View
      style={[
        s.badge,
        c == null
          ? { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.borderStrong }
          : { backgroundColor: c.muted, borderColor: c.border },
      ]}
    >
      <AppText variant="mono" style={[s.badgeText, { color: c == null ? theme.colors.textMuted : c.accent }]}>
        {text}
      </AppText>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    hero: {
      gap: 9,
      paddingVertical: 15,
      paddingHorizontal: 14,
      borderRadius: t.radius.lg,
      borderWidth: t.borderWidth,
      backgroundColor: t.colors.surface,
    },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    date: { flexShrink: 1, fontSize: 9, lineHeight: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: t.colors.textMuted },
    badge: { flexShrink: 0, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: t.borderWidth },
    badgeText: { fontSize: 8, lineHeight: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
    // Grubość cyfr idzie osobnym plikiem kroju - `fontWeight` na Androidzie nie działa
    // na czcionkach wczytanych z pakietu (typografia w `@ninerdeck/tokens`).
    hours: { fontFamily: t.fontFamily.monoBold, fontSize: 26, lineHeight: 28, letterSpacing: 1.5, color: t.colors.textPrimary },
    hoursOff: { color: t.colors.textSecondary },
    was: { marginTop: -3, fontSize: 10, lineHeight: 13, letterSpacing: 0.5, color: t.colors.textMuted },
    meta: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
    zone: { fontSize: 8, lineHeight: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: t.colors.textMuted },
    length: { fontSize: 10, lineHeight: 13, letterSpacing: 1, color: t.colors.textSecondary },
    aircraft: { fontSize: 10, lineHeight: 13, letterSpacing: 1.5, color: t.colors.textSecondary },
    countdown: { fontSize: 17, lineHeight: 19, letterSpacing: 1.5 },
  });
