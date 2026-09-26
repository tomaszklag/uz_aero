/**
 * Ninerdeck (serwer) - DANE BUDZIKA: dokładnie to, co telefon z nich czyta
 * (issue #228, 2026-09-25; `docs/rezerwacje.md` §12.6).
 *
 * ══ PUSH JEST BUDZIKIEM, WIĘC WOZI ADRES, NIE TREŚĆ ══
 * Treść stoi w skrzynce (§12.1), a `data` budzika służy JEDNEMU pytaniu: co otworzyć po
 * tapnięciu. Aplikacja czyta z niego `kind`, `orgId`, `bookingId` i `aircraftId`
 * (`app/src/ui/screens/logic/pushTarget.ts`) - i nic więcej. Do #228 `wake` rozlewał tu
 * CAŁY payload wiadomości, więc przez Expo Push Service i FCM jechały godziny terminu,
 * identyfikatory osób, nazwa kroku, powód odmowy i odczyty przy zdaniu samolotu - dane,
 * których po drugiej stronie nikt nie czytał, a dwaj pośrednicy widzieli.
 *
 * ══ KLUCZ ISTNIEJE TYLKO Z WARTOŚCIĄ ══
 * `bookingId: null` (uruchomienie poza planem) nie wchodzi do `data` wcale: telefon
 * i tak traktuje wszystko poza niepustym napisem jako brak, a klucz z `null` byłby
 * bajtem w budziku, który nic nie znaczy.
 *
 * Nowe pole czytane przez `pushTarget` dopisuje się do `PUSH_DATA_KEYS` - tu i w teście;
 * `notifier.ts` nie zna listy pól.
 */

import type { NotificationDraft } from './bookingNotices.ts';

/** Identyfikatory, po których telefon wybiera ekran; poza nimi jadą `kind` i `orgId`. */
export const PUSH_DATA_KEYS = ['bookingId', 'aircraftId'] as const;

export type PushData = {
  kind: NotificationDraft['kind'];
  orgId: string;
  bookingId?: string;
  aircraftId?: string;
};

/** Dane budzika dla jednej wiadomości - czysta funkcja, bez dostępu do bazy. */
export function pushData(orgId: string, draft: Pick<NotificationDraft, 'kind' | 'payload'>): PushData {
  const data: PushData = { kind: draft.kind, orgId };
  for (const key of PUSH_DATA_KEYS) {
    const value = draft.payload[key];
    if (typeof value === 'string' && value !== '') data[key] = value;
  }
  return data;
}
