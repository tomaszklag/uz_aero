/**
 * UZ Aero - JumperDefaultsSheet (arkusz „Domyślny skład skoczków", 02e)
 *
 * Skład ustawiony TU staje się wartością startową każdego załadunku bez własnej
 * deklaracji w tej sesji (`boardingInitialJumpers`, `logic/boardingPrefill.ts`) -
 * pilot dnia skokowego z powtarzalnym składem (np. zawsze 4 tandemy) nie wpisuje go
 * przy każdym załadunku od nowa, tylko raz, na kroku „zadanie".
 *
 * Te same trzy liczniki co `BoardingSheet`/`DropSheet`, ale inny, lżejszy arkusz
 * (generyczny `Sheet`, bez czasu ani numeru lotu - na tym kroku żadna sesja jeszcze
 * nie istnieje): to tylko wartość szkicu preflightu (`usePreflightDraft.jumperDefaults`),
 * nic się jeszcze nie zapisuje do rejestru.
 */

import React, { useEffect, useState } from 'react';

import { AppText } from '../foundation/AppText';
import { CounterRow } from '../input/CounterRow';
import { Sheet } from './Sheet';
import { jumpersKey } from './jumpersKey';
import type { JumperCounts } from './DropSheet';

export interface JumperDefaultsSheetProps {
  visible: boolean;
  /** Bieżący default (szkic preflightu); `null` = jeszcze nie ustawiono. */
  initialJumpers: JumperCounts | null;
  /** Surowe liczniki - normalizację „suma zero = brak deklaracji" robi wołający. */
  onConfirm: (jumpers: JumperCounts) => void;
  onCancel: () => void;
}

const EMPTY: JumperCounts = { tandem: 0, aff: 0, solo: 0 };

export function JumperDefaultsSheet({
  visible,
  initialJumpers,
  onConfirm,
  onCancel,
}: JumperDefaultsSheetProps) {
  const [jumpers, setJumpers] = useState<JumperCounts>(EMPTY);

  // Klucz składu, nie identyczność obiektu - ta sama zasada co w `BoardingSheet`
  // (issue #28): `initialJumpers` bywa nowym obiektem o tych samych liczbach.
  const prefillKey = jumpersKey(initialJumpers);
  useEffect(() => {
    if (visible) setJumpers(initialJumpers ?? EMPTY);
  }, [visible, prefillKey]);

  const set = (key: keyof JumperCounts) => (value: number) =>
    setJumpers((j) => ({ ...j, [key]: value }));

  return (
    <Sheet
      visible={visible}
      title="Domyślny skład skoczków"
      confirmLabel="ZAPISZ"
      confirmTone="blue"
      onConfirm={() => onConfirm(jumpers)}
      onCancel={onCancel}
    >
      <CounterRow label="Tandem" hint="z instruktorem" value={jumpers.tandem} onChange={set('tandem')} />
      <CounterRow label="AFF" hint="szkolenie" value={jumpers.aff} onChange={set('aff')} />
      <CounterRow label="Solo" hint="licencjonowani" value={jumpers.solo} onChange={set('solo')} />

      <AppText variant="mono" tone="muted" style={{ fontSize: 9, letterSpacing: 0.5, lineHeight: 13 }}>
        Ten skład podstawi się przy każdym załadunku tego lotu bez własnej deklaracji -
        przy konkretnym załadunku nadal można go zmienić.
      </AppText>
    </Sheet>
  );
}
