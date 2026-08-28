/**
 * UZ Aero — Stepper
 *
 * Wprowadzanie wartości liczbowej przyciskami ±, nie suwakiem.
 *
 * Dlaczego nie suwak: audyt użyteczności wykazał, że dolewka paliwa była ustawiana
 * uchwytem 16×16 px na torze 312 px — około **1,4 litra na piksel** przeciągnięcia.
 * W rękawicach, na słońcu, przy pracującym silniku to nie jest precyzja, tylko loteria.
 * Stepper daje dokładność co do kroku i cele dotykowe 46 px.
 *
 * Używany do odczytów paliwa i motogodzin (02a, 09), liczby skoczków (05e) oraz korekty
 * czasu zdarzenia (04c, 05f).
 */

import React, { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { toneColors, type Tone } from '../tone';

/** Umowa wpisu z klawiatury: jak wartość zamienia się w tekst i z powrotem. */
export interface StepperEdit {
  /** Wartość → tekst startowy pola (zwykle to samo, co `format`). */
  toText: (value: number) => string;
  /**
   * Maska w trakcie pisania — np. dwukropek godziny stawiany za pilota
   * (`maskTimeUtcInput`). Bez niej tekst idzie do pola bez zmian.
   */
  mask?: (text: string) => string;
  /** Tekst → wartość; `null` = wpis nieczytelny, zostaje poprzednia wartość. */
  parse: (text: string) => number | null;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  /** Do czytnika ekranu — co się właściwie wpisuje („Czas zdarzenia"). */
  label?: string;
}

export interface StepperProps {
  /**
   * `null` = wartości JESZCZE NIE MA i kontrolka tego nie ukrywa (issue #62 pkt 3).
   *
   * Arkusz czasów wpisu ręcznego otwierał się z godzinami 10:00 i 11:00, których nikt
   * nie wpisał — a potem mierzył od nich przesunięcie („względem wpisu (10:00)") i tymi
   * właśnie liczbami ruszał przy ±1 min. Wartość podstawiona wygląda jak wartość
   * wpisana i to jest cały problem: pilot nie ma jak odróżnić swojego odczytu od
   * zgadywanki formularza. Ta sama reguła, która każe wpisywać paliwo przed
   * uruchomieniem zamiast brać je z cache.
   *
   * Przy `null` przyciski ± są wygaszone (nie ma czego przesuwać), a wartość pokazuje
   * `placeholder` — wpisanie z klawiatury zostaje jedyną drogą i o to chodzi.
   */
  value: number | null;
  onChange: (next: number) => void;
  /** Krok podstawowy (przyciski ±). */
  step?: number;
  /** Krok przyspieszony — drugi rząd przycisków (np. ±10 L). Brak = jeden rząd. */
  bigStep?: number;
  /**
   * Jak NAZWAĆ krok na przycisku, bez znaku („1 min"). Domyślnie sama liczba kroku —
   * co jest prawdą tylko wtedy, gdy wartość i jej jednostka są tym samym, co krok.
   *
   * Czas trzymamy w MILISEKUNDACH, więc bez tego pola przycisk pisał „+60000"
   * (zgłoszenie z urządzenia, 2026-08-14). `format` tu nie pomoże: formatuje WARTOŚĆ
   * (godzinę), a nie różnicę — „+01:00" znaczyłoby coś zupełnie innego niż „+1 min".
   */
  stepLabel?: string;
  bigStepLabel?: string;
  min?: number;
  max?: number;
  /** Jak sformatować wartość (np. litry, MH w hh:mm, czas UTC). */
  format?: (value: number) => string;
  /**
   * Wpisanie wartości Z KLAWIATURY po tapnięciu w liczbę (zgłoszenie z urządzenia,
   * 2026-08-14). Pominięte — wartość jest tylko do odczytu i zmienia się przyciskami.
   *
   * Przyciski są dobre do POPRAWKI („o minutę za późno"), ale nie do przeskoku:
   * godzina odległa o czterdzieści minut to czterdzieści dotknięć. Klawiatura obsługuje
   * ten drugi przypadek, nie zabierając niczego pierwszemu.
   */
  edit?: StepperEdit;
  /** Podpis pod wartością (np. „maks. 218 L do pełna"). */
  hint?: string;
  /** Co pokazać zamiast wartości, dopóki jej nie ma (`value === null`). */
  placeholder?: string;
  /**
   * Kontrolka OTWIERA SIĘ od razu w trybie wpisu (issue #62, trzecia tura z urządzenia).
   *
   * Arkusz czasu jest formularzem o jednym pytaniu — po jego otwarciu pilot i tak
   * tapie w wartość, żeby wbić godzinę. Bez tego każdy wpis kosztował jedno tapnięcie
   * więcej, a arkusz otwierał się w stanie, w którym nic nie zapraszało do pisania.
   *
   * SAMO to nie podnosi KLAWIATURY — do tego służy `inputRef` z `useSheetInputFocus`
   * (patrz niżej). Tu chodzi tylko o to, żeby pole W OGÓLE ISTNIAŁO w drzewie,
   * bo inaczej callback ref nie ma się na czym zawiesić.
   */
  autoEdit?: boolean;
  /**
   * Callback ref na wewnętrzny `TextInput` — WYŁĄCZNIE dla `useSheetInputFocus`.
   *
   * Klawiaturę w arkuszu podnosi drabinka prób z tego hooka i nic innego: trzy
   * podejścia już zawiodły i ich historia stoi w `hooks/keyboardFocus.ts`.
   * `autoFocus` na tym polu odpaliłby się przy montowaniu, zanim okno modala
   * istnieje — czyli dokładnie pierwszy z tych błędów.
   */
  inputRef?: (input: TextInput | null) => void;
  unit?: string;
  tone?: Tone;
  style?: ViewStyle;
}

/**
 * Przycisk kroku — komponent MODUŁOWY, nie zagnieżdżony w ciele `Stepper`.
 *
 * Zadeklarowany wewnątrz `Stepper` (tak było do issue #62) jest przy każdym renderze
 * NOWYM typem komponentu, więc React nie aktualizuje istniejącego drzewa, tylko odmontowuje
 * je i montuje od nowa. Dla `Pressable` znaczy to utratę respondera dotyku w połowie
 * tapnięcia: pierwszy dotyk po zmianie wartości potrafił nie wywołać `onPress` w ogóle.
 */
function StepButton({
  delta,
  label,
  disabled,
  accent,
  onPress,
}: {
  delta: number;
  label: string;
  disabled: boolean;
  accent: string;
  onPress: (delta: number) => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${delta > 0 ? 'Zwiększ' : 'Zmniejsz'} o ${label.replace(/^[+−-]/, '')}`}
      disabled={disabled}
      onPress={() => onPress(delta)}
      style={({ pressed }) => [
        styles.btn,
        {
          borderRadius: theme.radius.md,
          borderWidth: theme.borderWidth,
          borderColor: theme.colors.borderStrong,
          backgroundColor: pressed ? accent : theme.colors.surfaceRaised,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      {/* Jedna linia ZAWSZE: „+1 min" łamało się na dwie, bo przycisk miał sztywne
          46 px szerokości — próg rękawic policzony dla samego „+". Odtąd 46 px jest
          MINIMUM, a szerokość rośnie z napisem (uwaga z urządzenia, 2026-08-14). */}
      <AppText variant="mono" tone={disabled ? 'muted' : 'primary'} numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  bigStep,
  stepLabel,
  bigStepLabel,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  format,
  edit,
  hint,
  placeholder = '—',
  autoEdit = false,
  inputRef,
  unit,
  tone = 'amber',
  style,
}: StepperProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  /**
   * Tekst w trakcie wpisywania; `null` = pole zamknięte, wartość tylko do odczytu.
   *
   * Przy `autoEdit` startujemy OTWARCI. Inicjalizator leniwy, a nie efekt: `Modal`
   * odmontowuje dzieci przy zamknięciu arkusza (patrz `useSheetInputFocus`), więc
   * każde otwarcie montuje kontrolkę od nowa i stan liczy się raz, we właściwej chwili.
   */
  const [draft, setDraft] = useState<string | null>(() =>
    autoEdit && edit != null ? (value == null ? '' : edit.toText(value)) : null,
  );

  const clamp = useCallback(
    (n: number) => Math.min(max, Math.max(min, n)),
    [max, min],
  );

  /**
   * Krok ± liczy się od WPISU W TOKU, jeśli taki jest (issue #62 pkt 3).
   *
   * Do issue #62 brał wyłącznie `value`, czyli wartość sprzed otwarcia klawiatury:
   * pilot wpisywał 08:15, dotykał „+1 min" i dostawał 10:01, bo przycisk przesuwał
   * godzinę podstawioną przez formularz, a nie tę wpisaną. Zatwierdzenie pola dzieje
   * się przy `onBlur`, więc w chwili tapnięcia świeża wartość istnieje TYLKO w `draft` —
   * i to ona jest tym, co pilot ma przed oczami.
   */
  const bump = useCallback(
    (delta: number) => {
      const pending = draft != null ? (edit?.parse(draft) ?? null) : null;
      const base = pending ?? value;
      if (draft != null) setDraft(null);
      // Wartości nie ma i wpis jej nie dał — nie ma czego przesuwać (przycisk i tak
      // jest wtedy wygaszony; ta gałąź broni przed wpisem nieczytelnym).
      if (base == null) return;
      const next = clamp(base + delta);
      if (next !== value) onChange(next);
    },
    [clamp, draft, edit, onChange, value],
  );

  /**
   * Zamknięcie pola wpisu. Wpis nieczytelny albo poza granicami NIE jest błędem
   * do pokazania — po prostu zostaje wartość sprzed edycji. Granice przycina
   * ta sama arytmetyka, co przyciski, więc klawiatura nie ma jak ich obejść.
   */
  const commit = useCallback(() => {
    if (draft == null) return;
    const parsed = edit?.parse(draft) ?? null;
    setDraft(null);
    if (parsed == null) return;
    const next = clamp(parsed);
    if (next !== value) onChange(next);
  }, [clamp, draft, edit, onChange, value]);

  /** Czy krok wyszedłby poza granice — przy braku wartości nie ma czego przesuwać. */
  const stepBlocked = (delta: number): boolean =>
    value == null || value + delta > max || value + delta < min;

  return (
    <View style={[{ gap: theme.spacing.sm }, style]}>
      <View
        style={[
          styles.row,
          {
            gap: theme.spacing.sm,
            padding: theme.spacing.sm,
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth,
            borderColor: c.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <StepButton
          delta={-step}
          label={`−${stepLabel ?? step}`}
          disabled={stepBlocked(-step)}
          accent={c.muted}
          onPress={bump}
        />

        {/* Wartość jest CELEM DOTKNIĘCIA, gdy da się ją wpisać — przyciski zostają
            do poprawki o krok, klawiatura do przeskoku. Bez `edit` to zwykły napis. */}
        {draft != null && edit != null ? (
          <TextInput
            /* `autoFocus` TYLKO poza `autoEdit`: tam pole pojawia się w odpowiedzi na
               tapnięcie pilota, więc okno modala od dawna istnieje i fokus jest
               natychmiastowy. Przy `autoEdit` pole montuje się razem z arkuszem —
               i wtedy fokus należy do drabinki `useSheetInputFocus`, bo `autoFocus`
               odpala się, zanim okno modala w ogóle jest (`hooks/keyboardFocus.ts`). */
            autoFocus={!autoEdit}
            ref={inputRef}
            value={draft}
            /**
             * WARTOŚĆ WYCHODZI NA KAŻDĄ ZMIANĘ TEKSTU, nie na wyjściu z pola
             * (issue #62, uwaga z urządzenia).
             *
             * Do tej pory wpis szedł do rodzica dopiero przy `onBlur`, więc wszystko,
             * co z tej wartości liczą arkusze — czas trwania pary, podpis przesunięcia,
             * powód blokady „ZAPISZ" — odpowiadało dopiero po tapnięciu gdzieś obok.
             * Pilot wpisywał godzinę, patrzył na wiersz „Blok" i widział poprzedni
             * wynik: formularz sprawiał wrażenie, że nie przyjął tego, co wpisał.
             *
             * Niepełny wpis („08:3") nie parsuje się i po prostu nie rusza wartości —
             * to nie jest błąd do pokazania, tylko normalny stan w połowie pisania.
             * `commit` przy `onBlur` ZOSTAJE jako domknięcie: to on kasuje szkic
             * i przywraca widok wartości.
             */
            onChangeText={(text) => {
              const masked = edit.mask ? edit.mask(text) : text;
              setDraft(masked);
              const parsed = edit.parse(masked);
              if (parsed == null) return;
              const next = clamp(parsed);
              if (next !== value) onChange(next);
            }}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType={edit.keyboardType ?? 'number-pad'}
            maxLength={edit.maxLength}
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={edit.label}
            selectionColor={theme.colors.selection}
            cursorColor={c.accent}
            style={[
              styles.value,
              styles.input,
              { color: c.accent, fontFamily: theme.fontFamily.monoBold },
            ]}
          />
        ) : (
          <Pressable
            accessibilityRole={edit != null ? 'button' : 'text'}
            accessibilityLabel={
              edit == null ? undefined : `${edit.label ?? 'Wartość'} — wpisz z klawiatury`
            }
            disabled={edit == null}
            /* Pusta wartość otwiera PUSTE pole — `toText` opisuje liczbę, a nie jej brak. */
            onPress={() => setDraft(value == null ? '' : (edit?.toText(value) ?? null))}
            /* BEZ podkreślenia (uwaga z urządzenia, 2026-08-14). Przerywana kreska pod
               godziną wyglądała jak usterka rysowania, a nie jak zaproszenie do wpisu —
               wartość steppera i tak jest największym elementem kontrolki, więc palec
               ląduje na niej sam. */
            style={styles.value}
          >
            {/* Brak wartości bierze KOLOR placeholdera (issue #58), ale ZOSTAJE przy
                metryce wartości — inaczej niż zachęty w polach formularza. Placeholder
                steppera nie jest zdaniem („wybierz lotnisko"), tylko pustym slotem
                w kształcie liczby („--:--"), a zmiana kroju przy wpisaniu godziny
                podskoczyłaby wysokością całej kontrolki. */}
            {value == null ? (
              <AppText variant="param" style={{ color: theme.colors.textPlaceholder }}>
                {placeholder}
              </AppText>
            ) : (
              <AppText variant="param" style={{ color: c.accent }}>
                {format ? format(value) : String(value)}
              </AppText>
            )}
            {unit != null && value != null && (
              <AppText variant="label" tone="secondary">
                {unit}
              </AppText>
            )}
          </Pressable>
        )}

        <StepButton
          delta={step}
          label={`+${stepLabel ?? step}`}
          disabled={stepBlocked(step)}
          accent={c.muted}
          onPress={bump}
        />
      </View>

      {bigStep != null && (
        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <StepButton
            delta={-bigStep}
            label={`−${bigStepLabel ?? bigStep}`}
            disabled={stepBlocked(-bigStep)}
            accent={c.muted}
            onPress={bump}
          />
          <View style={{ flex: 1 }} />
          <StepButton
            delta={bigStep}
            label={`+${bigStepLabel ?? bigStep}`}
            disabled={stepBlocked(bigStep)}
            accent={c.muted}
            onPress={bump}
          />
        </View>
      )}

      {hint != null && (
        <AppText variant="label" tone="muted">
          {hint}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // 46 px — próg celu dotykowego dla rękawic (audyt ergonomii). MINIMUM, nie sztywna
  // szerokość: przycisk z napisem („1 min") musi się w jednej linii zmieścić.
  btn: {
    minWidth: 46,
    height: 46,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  value: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  // Pole wpisu ma STAĆ W MIEJSCU wartości: ta sama wysokość i to samo wyśrodkowanie,
  // żeby wejście w edycję nie przesuwało układu arkusza o kilka pikseli.
  input: { height: 46, textAlign: 'center', fontSize: 30, padding: 0 },
});
