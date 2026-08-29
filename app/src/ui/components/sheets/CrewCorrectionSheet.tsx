/**
 * UZ Aero - CrewCorrectionSheet: poprawka DRUGIEGO PILOTA całej sesji (issue #43).
 *
 * ══ CO TO ZNACZY „POPRAWIĆ DUALA" ══
 * „Wpisałem złego drugiego pilota" - poprawka działa WSTECZ na całą sesję, więc czas
 * blokowy w całości przypisuje się wskazanej osobie. To NIE JEST zmiana załogi w trakcie
 * (od tego jest `crew_change` i ekran 07): tamta dzieli sesję na odcinki i każdemu
 * pilotowi daje jego kawałek. Arkusz mówi o tym wprost, bo z samej listy nazwisk nie
 * dałoby się tego odgadnąć.
 *
 * Lista pilotów pochodzi z cache'u referencyjnego (§4.8), więc działa offline. PIC-a na
 * niej nie ma: jedna osoba nie leci sama ze sobą w dwóch rolach (`DUAL_IS_PIC`), a opcja,
 * którą reguła i tak odrzuci, jest gorsza niż jej brak.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../foundation/AppText';
import { HistoryLink } from '../data/HistoryLink';
import { CardPicker } from '../input/CardPicker';
import { ReasonField } from '../input/ReasonField';
import { Sheet } from './Sheet';

export interface CrewOption {
  id: string;
  /** Kod pilota („AKO") - monospacing, tak jak w dokumentach. */
  code: string;
  name: string;
}

export interface CrewCorrectionSheetProps {
  visible: boolean;
  /** Dual W MOCY teraz; `null` = sesja jednoosobowa. */
  dualId: string | null;
  /** Piloci z cache'u referencyjnego, BEZ PIC-a tej sesji. */
  options: readonly CrewOption[];
  historyCount?: number;
  onOpenHistory?: () => void;
  /** `null` = „sesja jednoosobowa" - to decyzja, nie brak wyboru. */
  onSave: (dualId: string | null, reason: string | null) => void;
  onCancel: () => void;
}

/** Identyfikator pozycji „bez Duala" - nie koliduje z uuid pilota. */
const NONE = '__none__';

export function CrewCorrectionSheet({
  visible,
  dualId,
  options,
  historyCount = 0,
  onOpenHistory,
  onSave,
  onCancel,
}: CrewCorrectionSheetProps) {
  const [selected, setSelected] = useState<string>(dualId ?? NONE);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSelected(dualId ?? NONE);
    setReason('');
  }, [visible, dualId]);

  const changed = (selected === NONE ? null : selected) !== dualId;

  return (
    <Sheet
      visible={visible}
      title="KOREKTA ZAŁOGI"
      confirmLabel="ZAPISZ KOREKTĘ"
      onConfirm={
        changed
          ? () =>
              onSave(
                selected === NONE ? null : selected,
                reason.trim() === '' ? null : reason.trim(),
              )
          : undefined
      }
      onCancel={onCancel}
    >
      {/*
        Nagłówek nie powtarza „cała sesja": zakres poprawki jest treścią przypisu pod
        listą, gdzie stoi razem z powodem („czas blokowy przypisze się…") i z tym, czego
        ten arkusz NIE robi (zmiana załogi w trakcie). Napisany dwa razy - raz jako
        etykieta bez wyjaśnienia, raz jako zdanie - pierwszy raz nie mówi nic.
      */}
      <CardPicker
        options={[
          { value: NONE, label: 'Bez Duala', note: 'sesja jednoosobowa' },
          ...options.map((pilot) => ({
            value: pilot.id,
            label: pilot.name,
            avatarCode: pilot.code,
          })),
        ]}
        value={selected}
        onChange={setSelected}
      />

      <ReasonField
        value={reason}
        onChangeText={setReason}
        placeholder="np. w kabinie siedział kto inny, niż zapisałem"
      />

      {onOpenHistory != null && <HistoryLink count={historyCount} onPress={onOpenHistory} />}

      <View style={styles.note}>
        <AppText variant="mono" tone="muted" style={styles.noteText}>
          Poprawka obejmuje CAŁĄ sesję - czas blokowy przypisze się wskazanej osobie od
          przejęcia do zdania. Jeśli drugi pilot zmienił się W TRAKCIE, to nie jest to
          miejsce: taką zmianę zapisuje się w kokpicie, przed uruchomieniem silnika.
        </AppText>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  note: { paddingTop: 2 },
  noteText: { fontSize: 8.5, letterSpacing: 0.8, lineHeight: 14 },
});
