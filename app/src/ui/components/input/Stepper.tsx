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
  value: number;
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
  unit?: string;
  tone?: Tone;
  style?: ViewStyle;
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
  unit,
  tone = 'amber',
  style,
}: StepperProps) {
  const { theme } = useTheme();
  const c = toneColors(theme, tone);

  /** Tekst w trakcie wpisywania; `null` = pole zamknięte, wartość tylko do odczytu. */
  const [draft, setDraft] = useState<string | null>(null);

  const bump = useCallback(
    (delta: number) => {
      const next = Math.min(max, Math.max(min, value + delta));
      if (next !== value) onChange(next);
    },
    [max, min, onChange, value],
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
    const next = Math.min(max, Math.max(min, parsed));
    if (next !== value) onChange(next);
  }, [draft, edit, max, min, onChange, value]);

  const Button = ({ delta, label }: { delta: number; label: string }) => {
    const disabled = value + delta > max || value + delta < min;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${delta > 0 ? 'Zwiększ' : 'Zmniejsz'} o ${label.replace(/^[+−-]/, '')}`}
        disabled={disabled}
        onPress={() => bump(delta)}
        style={({ pressed }) => [
          styles.btn,
          {
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth,
            borderColor: theme.colors.borderStrong,
            backgroundColor: pressed ? c.muted : theme.colors.surfaceRaised,
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
  };

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
        <Button delta={-step} label={`−${stepLabel ?? step}`} />

        {/* Wartość jest CELEM DOTKNIĘCIA, gdy da się ją wpisać — przyciski zostają
            do poprawki o krok, klawiatura do przeskoku. Bez `edit` to zwykły napis. */}
        {draft != null && edit != null ? (
          <TextInput
            autoFocus
            value={draft}
            onChangeText={(text) => setDraft(edit.mask ? edit.mask(text) : text)}
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
            onPress={() => setDraft(edit?.toText(value) ?? null)}
            /* BEZ podkreślenia (uwaga z urządzenia, 2026-08-14). Przerywana kreska pod
               godziną wyglądała jak usterka rysowania, a nie jak zaproszenie do wpisu —
               wartość steppera i tak jest największym elementem kontrolki, więc palec
               ląduje na niej sam. */
            style={styles.value}
          >
            <AppText variant="param" style={{ color: c.accent }}>
              {format ? format(value) : String(value)}
            </AppText>
            {unit != null && (
              <AppText variant="label" tone="secondary">
                {unit}
              </AppText>
            )}
          </Pressable>
        )}

        <Button delta={step} label={`+${stepLabel ?? step}`} />
      </View>

      {bigStep != null && (
        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <Button delta={-bigStep} label={`−${bigStepLabel ?? bigStep}`} />
          <View style={{ flex: 1 }} />
          <Button delta={bigStep} label={`+${bigStepLabel ?? bigStep}`} />
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
