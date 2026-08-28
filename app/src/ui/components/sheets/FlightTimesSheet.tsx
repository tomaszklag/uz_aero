/**
 * UZ Aero — arkusz czasów wpisu ręcznego (mockup `design/15d-reczny-czas-arkusz.html`).
 *
 * Jedno wejście do KAŻDEJ godziny wpisu ręcznego: bieg silnika (para uruchomienie →
 * wyłączenie) i lot (para start → lądowanie). Kontrolką jest `TimeStepper` — ta sama,
 * co w korektach (10E) i kokpicie (05F): krok ±1 min, tapnięcie w wartość otwiera
 * klawiaturę numeryczną. `ManualEntrySheet` (komponent po skasowanym ekranie 08,
 * z krokiem 10 minut i bez wpisu z klawiatury) został skasowany razem z tą przebudową.
 *
 * Usunięcie lotu jest KOSZEM w linii tytułu (`Sheet.headerAction`), nie czerwonym
 * przyciskiem pod akcjami — intencją wchodzącego jest poprawka, nie kasowanie
 * (reguła z issue #43).
 *
 * ══ CO ZMIENIŁO ISSUE #62 (pkt 3, 5, 6, 7) ══
 * Cztery uwagi z urządzenia dotyczyły tego jednego arkusza w obu jego rolach:
 *  • **godzina bywa PUSTA i arkusz tego nie ukrywa** — do #62 bieg silnika otwierał się
 *    z 10:00 i 11:00, których nikt nie wpisał. Podstawiona godzina wygląda jak wpisana,
 *    a potem jeszcze służy za punkt odniesienia podpisu („względem wpisu (10:00)")
 *    i za bazę kroku ±1 min. `null` mówi prawdę, a zapisu pilnuje blokada;
 *  • **odwrócona para nie wychodzi z arkusza** (`flightTimesBlocker`) — odmowa padała
 *    dopiero przy „DALEJ", gdy obu godzin nie było już widać;
 *  • **daty tu nie ma** — stała w wierszu „16 SIE · czasy UTC", choć tę samą datę niesie
 *    podtytuł ekranu pod nagłówkiem. Wiersz kosztował linię i nie odpowiadał na żadne
 *    pytanie zadane w tym arkuszu;
 *  • **UTC zeszło do ETYKIET pól**, gdzie mieszka każda inna jednostka tego systemu
 *    („Wysokość zrzutu (ft)"), a pod godziną stanął czas lokalny drobnym drukiem —
 *    pilot ma na ręce zegarek, który pokazuje LT.
 */

import React, { useEffect, useState } from 'react';

import { duration, timeUtc } from '../../format';
import { IconAction } from '../data/IconAction';
import { TimeStepper } from '../input/TimeStepper';
import { Sheet } from './Sheet';
import { flightTimesBlocker } from './flightTimesBlocker';

/** Jedno pole czasu arkusza — klucz wraca w `onConfirm` z nową wartością. */
export interface FlightTimesField {
  key: string;
  /** „Uruchomienie", „Start", „Lądowanie" — bez jednostki, tę dokłada arkusz. */
  label: string;
  /**
   * `null` = godziny jeszcze nie ma i arkusz otwiera się PUSTY (issue #62 pkt 3).
   * Wartość podana jest wartością pilota — z poprawianego wpisu albo wyprowadzoną
   * z tego, co już wpisał (godziny biegu przy nowym locie, pkt 8).
   */
  value: number | null;
}

export interface FlightTimesSheetProps {
  visible: boolean;
  /** „BIEG SILNIKA", „LOT 2", „DODAJ LOT". */
  title: string;
  /** Jedno albo dwa pola; przy dwóch arkusz sam liczy wiersz czasu trwania. */
  fields: FlightTimesField[];
  /** Podpis wiersza trwania („Czas lotu", „Blok") — wchodzi też do powodu blokady. */
  durationLabel?: string;
  /** Granice doby wpisu — stepper nie wyjdzie poza dzień lotu. */
  min?: number;
  max?: number;
  /** Obecność włącza kosz w linii tytułu (usuwany lot); brak = pary nie da się usunąć. */
  onDelete?: () => void;
  onConfirm: (values: Record<string, number>) => void;
  onCancel: () => void;
}

export function FlightTimesSheet({
  visible,
  title,
  fields,
  durationLabel = 'Czas trwania',
  min,
  max,
  onDelete,
  onConfirm,
  onCancel,
}: FlightTimesSheetProps) {
  const [values, setValues] = useState<Record<string, number | null>>({});

  // Każde otwarcie startuje od wartości pól — arkusz nie pamięta poprzedniej edycji.
  useEffect(() => {
    if (visible) {
      setValues(Object.fromEntries(fields.map((f) => [f.key, f.value])));
    }
    // `fields` świadomie poza zależnościami: rodzic odtwarza tablicę przy każdym
    // renderze, a przeładowanie wartości w trakcie edycji cofałoby zmiany pilota.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const resolved = fields.map((f) => ({
    ...f,
    current: f.key in values ? values[f.key]! : f.value,
  }));
  const pair =
    resolved.length === 2 && resolved[0]!.current != null && resolved[1]!.current != null
      ? resolved[1]!.current - resolved[0]!.current
      : null;

  const blocker = flightTimesBlocker(
    resolved.map((f) => ({ label: f.label, value: f.current })),
    durationLabel,
  );

  return (
    <Sheet
      visible={visible}
      title={title}
      /* Wiersz czasu trwania zostaje — to jedyna liczba, której pilot sam nie wpisał,
         a która mówi, czy para godzin ma sens. Data z tego miejsca ZNIKŁA (pkt 6). */
      rows={
        resolved.length === 2
          ? [{ label: durationLabel, value: pair != null && pair > 0 ? duration(pair) : '—' }]
          : []
      }
      confirmLabel="ZAPISZ"
      confirmDisabledReason={blocker}
      onConfirm={() => {
        if (blocker != null) return;
        onConfirm(
          Object.fromEntries(resolved.map((f) => [f.key, f.current!])) as Record<string, number>,
        );
      }}
      onCancel={onCancel}
      headerAction={
        onDelete != null ? (
          <IconAction
            name="trash"
            tone="red"
            accessibilityLabel={`Usuń — ${title}`}
            onPress={onDelete}
          />
        ) : undefined
      }
    >
      {resolved.map((f) => (
        <TimeStepper
          key={f.key}
          /* Jednostka mieszka w ETYKIECIE, jak wszędzie w tym systemie (pkt 6). */
          label={`${f.label} (UTC)`}
          value={f.current}
          onChange={(next) => setValues((v) => ({ ...v, [f.key]: next }))}
          format={timeUtc}
          placeholder="--:--"
          localTime
          {...(f.value != null ? { originalTime: f.value, origin: 'wpisu' } : {})}
          {...(min != null ? { min } : {})}
          {...(max != null ? { max } : {})}
        />
      ))}
    </Sheet>
  );
}
