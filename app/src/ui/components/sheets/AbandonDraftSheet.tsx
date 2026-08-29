/**
 * UZ Aero — AbandonDraftSheet (`design/02h-preflight-rezygnacja.html`)
 *
 * Arkusz pod „wstecz" z PIERWSZEGO kroku formularza, który jeszcze nic nie zapisał:
 * pyta, czy pilot na pewno rezygnuje, ZANIM wybory przepadną. Ta sama mechanika co
 * blokada kokpitu (04d) — `usePreventRemove` łapie i przycisk sprzętowy, i gest
 * krawędziowy — ale inna stawka i stąd dwie różnice:
 *
 *  • pojawia się WYŁĄCZNIE nad niepustym formularzem. Pusty wychodzi bez pytania:
 *    arkusz „na pewno rezygnujesz?" nad formularzem, w którym nic nie ma, pytałby
 *    o zgodę na nic;
 *  • potwierdzenie jest BURSZTYNOWE, nie czerwone: nic się nie psuje i nic nie znika
 *    z rejestru — zapis robi dopiero przycisk na ostatnim kroku. Pilot po prostu
 *    odkłada rzecz na później.
 *
 * ══ JEDEN ARKUSZ NA OBIE DROGI DO LOTU (uwaga z urządzenia, 2026-08-29) ══
 * Powstał dla preflightu (issue #55) jako `AbandonPreflightSheet`, a wpis ręczny
 * potrzebuje DOKŁADNIE tego samego — bo jest tym samym: wielokrokowym formularzem,
 * z którego „wstecz" wychodzi bezpowrotnie. Osobna kopia rozjechałaby się co do
 * uzasadnienia (a to ono jest tu treścią), więc różnice jadą PARAMETRAMI: tytuł,
 * wiersze podsumowania i NAZWA PRZYCISKU, który dopiero zapisuje. Zdanie o tym, że
 * w rejestrze nie ma jeszcze nic i że formularz zacznie od nowa, zostaje wspólne —
 * bo w obu flow jest tak samo prawdziwe.
 *
 * Bezpieczne wyjście jest domyślne przy każdym porzuceniu arkusza: „wstecz" jeszcze raz
 * i tapnięcie w tło zostawiają pilota w formularzu (`Sheet` stoi na `Modal` z RN).
 */

import React from 'react';

import { Sheet, type SheetRow } from './Sheet';

export interface AbandonDraftSheetProps {
  visible: boolean;
  /** „ZREZYGNOWAĆ Z NOWEGO LOTU?" / „ZREZYGNOWAĆ Z WPISU RĘCZNEGO?" */
  title: string;
  /**
   * Nazwa przycisku, który dopiero zapisuje („ROZPOCZNIJ LOT", „ZAPISZ LOT") — wchodzi
   * do zdania o rejestrze. Pilot ma poznać moment, w którym zapis NAPRAWDĘ następuje,
   * a ten moment jest w każdym flow inny.
   */
  saveLabel: string;
  /**
   * Wiersze odniesienia — WYŁĄCZNIE faktyczne wybory. Kreska niczego nie przypomina
   * (ta sama reguła, co godzina przejęcia w `LeaveCockpitSheet`), więc wołający
   * odfiltrowuje puste u siebie.
   */
  rows: SheetRow[];
  /** Zostaw pilota w formularzu (anuluj, „wstecz", tapnięcie w tło). */
  onStay: () => void;
  /** Porzuć formularz i wyjdź. */
  onAbandon: () => void;
}

export function AbandonDraftSheet({
  visible,
  title,
  saveLabel,
  rows,
  onStay,
  onAbandon,
}: AbandonDraftSheetProps) {
  return (
    <Sheet
      visible={visible}
      title={title}
      rows={rows}
      warning={
        `Do rejestru nie trafiło jeszcze nic — zapis robi dopiero „${saveLabel}". ` +
        'Po rezygnacji formularz zaczyna następnym razem od nowa, bez zapamiętanych wyborów.'
      }
      warningTone="amber"
      confirmLabel="ZREZYGNUJ"
      confirmTone="amber"
      onConfirm={onAbandon}
      cancelLabel="ZOSTAŃ"
      onCancel={onStay}
    />
  );
}
