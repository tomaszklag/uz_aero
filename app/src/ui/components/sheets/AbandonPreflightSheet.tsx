/**
 * UZ Aero — AbandonPreflightSheet (`design/02h-preflight-rezygnacja.html`)
 *
 * Arkusz pod „wstecz" z kroku 1 nowego lotu (issue #55): pyta, czy pilot na pewno
 * rezygnuje z rozpoczęcia lotu, ZANIM wybory z formularza przepadną. Ta sama mechanika
 * co blokada kokpitu (04d) — `usePreventRemove` łapie i przycisk sprzętowy, i gest
 * krawędziowy — ale inna stawka i stąd dwie różnice:
 *
 *  • pojawia się WYŁĄCZNIE nad niepustym formularzem (wybrany samolot albo Dual).
 *    Pusty wychodzi bez pytania: arkusz „na pewno rezygnujesz?" nad formularzem,
 *    w którym nic nie ma, pytałby o zgodę na nic;
 *  • potwierdzenie jest BURSZTYNOWE, nie czerwone: nic się nie psuje i nic nie znika
 *    z rejestru — zapis robi dopiero „ROZPOCZNIJ LOT" na kroku 3. Pilot po prostu
 *    odkłada start na później.
 *
 * Potwierdzenie CZYŚCI szkic (druga połowa issue #55): skoro rezygnacja jest świadoma
 * — jest arkusz — to wolno jej naprawdę przepaść. Wcześniej porzucony formularz wracał
 * z wyborami sprzed godziny i czytał się jak podpowiedź, którą nie był. Arkusz mówi to
 * wprost, żeby „od nowa" przy następnym wejściu nie wyglądało jak zgubione dane.
 *
 * Bezpieczne wyjście jest domyślne przy każdym porzuceniu arkusza: „wstecz" jeszcze raz
 * i tapnięcie w tło zostawiają pilota w formularzu (`Sheet` stoi na `Modal` z RN).
 */

import React from 'react';

import { Sheet, type SheetRow } from './Sheet';

export interface AbandonPreflightSheetProps {
  visible: boolean;
  /** Wybrany samolot („SP-AXA · Cessna 182") albo `null`, gdy dotąd wybrano tylko Duala. */
  aircraftLabel: string | null;
  /** Wybrany drugi pilot (nazwisko) albo `null`. */
  dualName: string | null;
  /** Zostaw pilota w formularzu (anuluj, „wstecz", tapnięcie w tło). */
  onStay: () => void;
  /** Porzuć nowy lot: wyczyść szkic i wyjdź na „Mój dzień". */
  onAbandon: () => void;
}

export function AbandonPreflightSheet({
  visible,
  aircraftLabel,
  dualName,
  onStay,
  onAbandon,
}: AbandonPreflightSheetProps) {
  // Wiersz odniesienia tylko dla faktycznych wyborów — kreska niczego nie przypomina
  // (ta sama reguła co godzina przejęcia w LeaveCockpitSheet).
  const rows: SheetRow[] = [
    ...(aircraftLabel != null ? [{ label: 'Wybrany samolot', value: aircraftLabel }] : []),
    ...(dualName != null ? [{ label: 'Drugi pilot', value: dualName }] : []),
  ];

  return (
    <Sheet
      visible={visible}
      title="ZREZYGNOWAĆ Z NOWEGO LOTU?"
      rows={rows}
      warning={
        'Do rejestru nie trafiło jeszcze nic — zapis robi dopiero „ROZPOCZNIJ LOT". ' +
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
