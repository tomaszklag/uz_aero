/**
 * UZ Aero - KONTROLKA CZASU ZDARZENIA (mockupy `design/10e`, `10f`, `10g`, `10h`, `05f`).
 *
 * ══ JEDNA CZYNNOŚĆ, JEDEN KSZTAŁT ══
 * Ustawienie godziny zdarza się w pięciu arkuszach - korekta czasu na osi, korekta
 * odczytu przy przejęciu, korekta zrzutu, dopisanie brakującego wpisu i wpis ręczny
 * z kokpitu - i do issue #43 każdy składał ją sobie sam. Efekt po pięciu kopiach był
 * dokładnie taki, jakiego można się spodziewać (zgłoszenia z urządzenia, 2026-08-14):
 * jedna nie pozwalała wpisać godziny, druga miała zbędny rząd ±10 min, trzecia pisała
 * na przycisku „+60000", a KAŻDA miała inny kolor ramki - bursztyn, błękit, zieleń -
 * choć wszystkie robiły to samo.
 *
 * ══ CO KONTROLKA USTALA RAZ DLA WSZYSTKICH ══
 *  • **jeden wygląd** - ton NEUTRALNY, bez parametru. Kolor akcentu niósł tu informację
 *    o niczym: ton arkusza, nie stan wartości. Ta sama czynność ma wyglądać tak samo;
 *  • **krok to MINUTA** i tylko ona - dalszy skok wpisuje się z klawiatury, a nie
 *    odklikuje dziesiątkami tapnięć;
 *  • **godzinę da się WPISAĆ** (tapnięcie w wartość): maska stawia dwukropek, a dzień
 *    bierze się z poprawianego zdarzenia (`timeStepperEdit`);
 *  • **podpis pojawia się TYLKO przy zmianie** (`timeShiftHint`), a miejsce na niego
 *    jest zarezerwowane - zdanie wskakuje bez przesuwania reszty arkusza;
 *  • **czas lokalny drobnym drukiem** (`localTime`, issue #62 pkt 6) - rejestr jedzie
 *    w UTC i tak zostaje, ale pilot patrzy na zegarek na ręce. Linia jest jedna dla
 *    wszystkich arkuszy; do issue #62 składał ją sobie sam arkusz zdarzenia ręcznego
 *    (05F, issue #19), a arkusze czasów wpisu ręcznego zamiast niej niosły datę,
 *    którą i tak widać w nagłówku ekranu.
 *
 * Arkusz podaje wyłącznie to, co go naprawdę różni: etykietę pola, granice i stopkę.
 */

import React from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { useTheme } from '../../theme';
import { timeLocal } from '../../format';
import { AppText } from '../foundation/AppText';
import { Field } from './Field';
import { Stepper } from './Stepper';
import { timeShiftHint } from './timeShiftHint';
import { timeStepperEdit } from './timeStepperEdit';

/** Krok kontrolki: jedna minuta w milisekundach. */
const MINUTE = 60_000;

export interface TimeStepperProps {
  /** Etykieta pola - „Czas zdarzenia (UTC)", „Czas zrzutu (UTC)". */
  label?: string;
  /**
   * `null` = godziny JESZCZE NIE MA (issue #62 pkt 3) - kontrolka pokazuje wtedy
   * `placeholder`, a przyciski ± są wygaszone. Uzasadnienie przy `StepperProps.value`.
   */
  value: number | null;
  onChange: (next: number) => void;
  /** Jak wypisać godzinę (zwykle `timeUtc`) - ta sama funkcja zasila pole wpisu. */
  format: (t: number) => string;
  /**
   * Wartość sprzed edycji. Podana - pod kontrolką pojawia się podpis „zmiana o +2 min",
   * ale dopiero PO zmianie. Pominięta (dopisywany wpis) - nie ma względem czego mierzyć.
   */
  originalTime?: number;
  /** Skąd wzięła się wartość pierwotna („odczytu GPS", „wpisu") - do podpisu. */
  origin?: string;
  min?: number;
  max?: number;
  /** Co pokazać, dopóki godziny nie ma (`value === null`). */
  placeholder?: string;
  /**
   * Plakietka WŁAŚCIWOŚCI pola („opcjonalne") - ta sama, co w `Field`. Różni się od
   * `localTime` rolą: plakietka mówi o WŁAŚCIWOŚCI pola, adnotacja o jego bieżącej WARTOŚCI.
   */
  tag?: { label: string };
  /** Kontrolka otwiera się w trybie wpisu - patrz `StepperProps.autoEdit`. */
  autoEdit?: boolean;
  /** Callback ref pola wpisu dla `useSheetInputFocus` - patrz `StepperProps.inputRef`. */
  inputRef?: (input: TextInput | null) => void;
  /**
   * Dopisać czas lokalny urządzenia drobnym drukiem („10:30 LT", issue #62 pkt 6).
   * Rejestr jedzie w UTC - LT jest tu wartością DRUGORZĘDNĄ i tak ma wyglądać.
   */
  localTime?: boolean;
  /**
   * Dopisek POD kontrolką - „3 min temu" i tym podobne. Rzeczy, które mówią coś o TEJ
   * godzinie, a nie o przesunięciu; arkusz kokpitu (05f) potrzebuje ich obok LT.
   */
  footer?: React.ReactNode;
}

export function TimeStepper({
  label = 'Czas zdarzenia (UTC)',
  value,
  onChange,
  format,
  originalTime,
  origin,
  min,
  max,
  placeholder,
  tag,
  autoEdit = false,
  inputRef,
  localTime = false,
  footer,
}: TimeStepperProps) {
  const { theme } = useTheme();
  const shift =
    originalTime == null || value == null
      ? null
      : timeShiftHint(value, originalTime, format, origin);

  /* CZAS LOKALNY STOI W LINII ETYKIETY, PO PRAWEJ (uwaga z urządzenia, 2026-08-29:
     „LMT jest za nisko, jest za duży padding między inputem a tą wartością - to powinno
     być bliżej, aby było jednoznacznie wiadomo, że to jest związane z tą kontrolką").
     Pod kontrolką wisiał ZA zarezerwowanym wierszem podpisu przesunięcia, złożony tak
     samo jak wiersze odniesienia arkusza - i czytał się jak pierwszy z NICH.
     W linii etykiety para mówi wszystko sama: po lewej strefa wpisu, po prawej „która
     to u mnie". Bez godziny nie ma czego przeliczać, więc adnotacja znika z wartością. */
  const note = localTime && value != null ? `${timeLocal(value)} LT` : undefined;

  return (
    <Field label={label} {...(tag != null ? { tag } : {})} {...(note != null ? { labelNote: note } : {})}>
      <Stepper
        value={value}
        onChange={onChange}
        step={MINUTE}
        /* Bez tej nazwy przycisk pisał „+60000" - czas trzymamy w milisekundach. */
        stepLabel="1 min"
        min={min}
        max={max}
        format={format}
        {...(placeholder != null ? { placeholder } : {})}
        autoEdit={autoEdit}
        {...(inputRef != null ? { inputRef } : {})}
        /* Odniesieniem wpisu jest wartość, a przy jej braku - DOLNA GRANICA arkusza
           (doba lotu). Bez tego godzina wpisana do pustego pola trafiłaby w dzień
           „dziś", czyli nie w ten, którego dotyczy wpis ręczny. */
        edit={timeStepperEdit(value ?? min ?? 0, format, label)}
        tone="neutral"
      />

      {/*
        Miejsce na podpis jest ZAREZERWOWANE, choć podpis bywa pusty: bez tego pierwsze
        tapnięcie w ±1 min przesuwało wszystko poniżej o jedną linijkę, a przy zerowaniu
        zmiany wszystko wracało (uwaga z urządzenia). Arkusz ma stać w miejscu.
      */}
      {originalTime != null && (
        <View style={styles.shift}>
          {shift != null && (
            <AppText variant="mono" tone="amber" style={styles.shiftText}>
              {shift}
            </AppText>
          )}
        </View>
      )}

      {footer}
    </Field>
  );
}

const styles = StyleSheet.create({
  // Wysokość JEDNEJ linii podpisu - tyle, ile zajmuje `shiftText`.
  shift: { minHeight: 13, justifyContent: 'center' },
  shiftText: { fontSize: 9, letterSpacing: 0.5, lineHeight: 13 },
});
