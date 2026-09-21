/**
 * Ninerdeck - WYBÓR DRUGIEGO PILOTA przy zakładaniu rezerwacji (`design/22a`).
 *
 * Lista pilotów z cache'u referencyjnego (§4.8), więc działa offline - a że sama
 * rezerwacja sieci wymaga, brak zasięgu i tak zatrzyma pilota wcześniej, przy zapisie.
 *
 * ══ PIC-a NA LIŚCIE NIE MA ══
 * Jedna osoba nie leci sama ze sobą w dwóch rolach (`DUAL_IS_PIC`), a opcja, którą
 * reguła i tak odrzuci, jest gorsza niż jej brak. Filtruje WOŁAJĄCY - arkusz nie wie,
 * kto jest zalogowany.
 *
 * ══ DLACZEGO NIE ARKUSZ Z 07 ══
 * Tamten pyta o ZMIANĘ załogi w trakcie operacji: pokazuje wychodzącego Duala, mówi
 * o zapisie zdarzenia i nazywa się „Zmiana drugiego pilota". Tutaj nikt nie wychodzi -
 * pilot planuje lot, którego jeszcze nie było. To dwa różne pytania, więc dwa arkusze;
 * wspólna jest kontrolka (`CardPicker`) i ona jedna.
 */

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { CardPicker, type PickerOption } from '../input/CardPicker';
import { Sheet } from './Sheet';

/** Pozycja listy - `null` w `value` znaczy „bez drugiego pilota". */
export interface DualOption {
  id: string;
  code: string;
  name: string;
}

export interface DualSheetProps {
  visible: boolean;
  dualId: string | null;
  /** Piloci klubu BEZ zalogowanego - filtruje wołający. */
  options: readonly DualOption[];
  /**
   * Powód, dla którego „bez drugiego pilota" jest zamknięte - maszyna wymaga załogi
   * dwuosobowej. Blokada stoi PRZY POZYCJI, bo tam jest wybór, którego nie wolno zrobić.
   */
  soloBlocker?: string | null;
  onSave: (dualId: string | null) => void;
  onCancel: () => void;
}

const SOLO = '__solo__';

export function DualSheet({
  visible,
  dualId,
  options,
  soloBlocker,
  onSave,
  onCancel,
}: DualSheetProps) {
  const [selected, setSelected] = useState<string | null>(null);

  // Szkic startuje od stanu zapisanego przy KAŻDYM otwarciu - arkusz zamknięty
  // „ANULUJ" nie ma prawa wrócić z wyborem z poprzedniego razu.
  useEffect(() => {
    if (visible) setSelected(dualId ?? SOLO);
  }, [visible, dualId]);

  const rows: PickerOption<string>[] = [
    ...options.map((p) => ({ value: p.id, label: p.name, avatarCode: p.code })),
    {
      value: SOLO,
      label: 'Bez drugiego pilota',
      ...(soloBlocker != null ? { disabledReason: soloBlocker } : {}),
    },
  ];

  return (
    <Sheet
      visible={visible}
      title="Drugi pilot"
      confirmLabel="ZAPISZ"
      // Pusty wybór blokuje BEZ zdania: widać go z listy nad przyciskiem, w której
      // żaden wiersz nie jest zaznaczony (wąski wyjątek reguły issue #55).
      confirmDisabled={selected == null}
      onConfirm={() => onSave(selected === SOLO ? null : selected)}
      onCancel={onCancel}
    >
      <View style={{ gap: 7 }}>
        <CardPicker options={rows} value={selected} onChange={setSelected} />
      </View>
    </Sheet>
  );
}
