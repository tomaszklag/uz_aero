/**
 * UZ Aero - AddEventSheet (mockup `design/10h` „Dodaj wpis")
 *
 * Dopisanie zdarzenia, którego w logu NIE MA: GPS zgubił lądowanie, zrzut nie został
 * zapisany, tankowanie umknęło. Różni się tym od `CorrectionSheet`, który poprawia
 * zdarzenie już istniejące - i dlatego jest osobnym arkuszem, mimo podobnego kształtu:
 * tam mówi się „było inaczej", tu „w ogóle tego nie zapisałem".
 *
 * ══ CZEGO NIE MA NA LIŚCIE ══
 * Klamry silnika (`engine_start`/`engine_stop`). Sesja ma dokładnie jeden bieg
 * (`SESSION_ALREADY_RAN`), więc dopisanie drugiego łamałoby model, a czas istniejącej
 * klamry poprawia się ołówkiem na osi. Zrzut i załadunek pojawiają się WYŁĄCZNIE
 * w dniu skokowym (issue #19) - to brak akcji, nie blokada z powodem.
 *
 * Wpis dostaje w rejestrze metodę `manual`. Mówimy o tym RAZ, tutaj, a nie plakietką
 * przy każdym wierszu osi (issue #40 pkt 6): sposób powstania zapisu jest sprawą
 * rejestru i panelu, nie codziennego czytania.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../foundation/AppText';
import type { IconName } from '../foundation/Icon';
import { OptionGrid } from '../input/OptionGrid';
import { ReasonField } from '../input/ReasonField';
import { TimeStepper } from '../input/TimeStepper';
import { Field, TextField } from '../input/Field';
import { Sheet, type SheetRow } from './Sheet';

/** Typ zdarzenia, które wolno dopisać - lista pochodzi z `logic/sessionEdit.ts`. */
export interface AddEventOption {
  id: string;
  label: string;
  icon: IconName;
}

export interface AddEventSheetProps {
  visible: boolean;
  options: AddEventOption[];
  /** Czas startowy suwaka - zwykle koniec biegu silnika albo „teraz". */
  initialTime: number;
  formatTime: (t: number) => string;
  /** Górna granica - dopisanie zdarzenia z przyszłości nie jest wpisem, tylko planem. */
  maxTime: number;
  /** Wiersze odniesienia zależne od wybranego typu (który lot domyka, zakres biegu). */
  refsFor?: (typeId: string, time: number) => SheetRow[];
  /** Stan paliwa W CHWILI otwarcia arkusza - podpowiedź „przed" dla tankowania. */
  fuelBeforeL?: number | null;
  busy?: boolean;
  onConfirm: (typeId: string, time: number, note: string | null, extra?: AddEventExtra) => void;
  onCancel: () => void;
}

/** Pola specyficzne dla typu - tankowanie (trójka) i dolewka oleju (jedna liczba). */
export interface AddEventExtra {
  refuel?: { beforeL: number; addedL: number; afterL: number };
  /** Dolewka oleju (issue #60) - sama ilość: poziomu po dolewce nie ma jak zmierzyć. */
  oilAddedL?: number;
}

export function AddEventSheet({
  visible,
  options,
  initialTime,
  formatTime,
  maxTime,
  refsFor,
  fuelBeforeL,
  busy = false,
  onConfirm,
  onCancel,
}: AddEventSheetProps) {
  const [typeId, setTypeId] = useState(options[0]?.id ?? '');
  const [time, setTime] = useState(initialTime);
  const [note, setNote] = useState('');
  // Tankowanie niesie TRÓJKĘ przed/dolane/po (§3.4) i domena pilnuje jej arytmetyki
  // (`FUEL_ARITHMETIC`). Pytamy więc o dwie liczby, a trzecią LICZYMY - wpisywanie
  // wszystkich trzech to zaproszenie do wpisu, który reguła odrzuci.
  const [beforeText, setBeforeText] = useState('');
  const [addedText, setAddedText] = useState('');
  const [oilText, setOilText] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTypeId(options[0]?.id ?? '');
    setTime(initialTime);
    setNote('');
    setBeforeText(fuelBeforeL == null ? '' : String(Math.round(fuelBeforeL)));
    setAddedText('');
    setOilText('');
  }, [visible, initialTime, options, fuelBeforeL]);

  const rows = refsFor?.(typeId, time) ?? [];
  const isRefuel = typeId === 'refuel';
  const isOilAdd = typeId === 'oil_add';
  const before = parseNumber(beforeText);
  const added = parseNumber(addedText);
  const after = before != null && added != null ? before + added : null;
  const oilAdded = parseNumber(oilText);
  const refuelReady = !isRefuel || (before != null && added != null && added > 0);
  const oilReady = !isOilAdd || (oilAdded != null && oilAdded > 0);

  return (
    <Sheet
      visible={visible}
      title="DODAJ WPIS"
      rows={rows}
      confirmLabel="DODAJ WPIS"
      onConfirm={
        typeId === '' || busy || !refuelReady || !oilReady
          ? undefined
          : () =>
              onConfirm(
                typeId,
                time,
                note.trim() === '' ? null : note.trim(),
                isRefuel && before != null && added != null && after != null
                  ? { refuel: { beforeL: before, addedL: added, afterL: after } }
                  : isOilAdd && oilAdded != null
                    ? { oilAddedL: oilAdded }
                    : undefined,
              )
      }
      onCancel={onCancel}
    >
      <Field label="Co się wydarzyło">
        <OptionGrid
          options={options.map((o) => ({ value: o.id, label: o.label, icon: o.icon }))}
          value={typeId === '' ? null : typeId}
          onChange={setTypeId}
        />
      </Field>

      {/* Bez `originalTime`: dopisywany fakt nie ma godziny sprzed edycji, więc nie ma
          względem czego mierzyć przesunięcia. Rząd ±10 min istniał tu, dopóki przyciski
          były jedyną drogą do godziny - od chwili, gdy da się ją WPISAĆ, jest gorszą
          wersją klawiatury i zabiera wysokość arkusza. */}
      <TimeStepper value={time} onChange={setTime} format={formatTime} max={maxTime} />

      {isRefuel && (
        <>
          <View style={styles.fuelGrid}>
            <TextField
              label="Stan przed"
              value={beforeText}
              onChangeText={setBeforeText}
              keyboardType="decimal-pad"
              hint="litry z paliwomierza"
              style={styles.fuelCell}
            />
            <TextField
              label="Dolano"
              value={addedText}
              onChangeText={setAddedText}
              keyboardType="decimal-pad"
              hint="litry z dystrybutora"
              style={styles.fuelCell}
            />
          </View>
          <AppText variant="mono" tone="muted" style={styles.note}>
            {after == null
              ? 'Podaj stan przed tankowaniem i ilość dolaną - stan po policzymy sami.'
              : `Stan po tankowaniu: ${after} L. Liczymy go z pary wyżej, żeby wpis nie mógł być wewnętrznie sprzeczny.`}
          </AppText>
        </>
      )}

      {/* Dolewka oleju (issue #60): JEDNA liczba - poziomu po dolewce nie ma jak
          uczciwie zmierzyć (silnik zwykle gorący), a rachunek traktuje dolewkę jako
          składnik interwału pomiar→pomiar, nie granicę. */}
      {isOilAdd && (
        <TextField
          label="Dolano"
          value={oilText}
          onChangeText={setOilText}
          keyboardType="decimal-pad"
          hint="ilość w litrach"
        />
      )}

      <ReasonField
        value={note}
        onChangeText={setNote}
        placeholder="np. telefon stracił fixa na pasie"
      />
    </Sheet>
  );
}

/** `''` i śmieci → `null` (przycisk zostaje bez akcji z podanym powodem). */
function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const styles = StyleSheet.create({
  note: { fontSize: 8.5, letterSpacing: 0.8, lineHeight: 14 },
  fuelGrid: { flexDirection: 'row', gap: 9 },
  fuelCell: { flex: 1 },
});
