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
 *
 * ══ ZLECENIA (4.0.0, `docs/zlecenia.md` §12) ══
 * `orderId` otwiera kartę zlecenia, a `recipientId` mówi, CZYJA to rozmowa - wątek jest
 * parą zlecenie × adresat (§7.1). Bez niego telefon nie wiedziałby, czy budzik dotyczy
 * rozmowy, którą pilot właśnie ma otwartą, i pokazałby baner nad nią samą (pkt 43).
 * Treść wiadomości, nazwiska i godziny dalej zostają w skrzynce.
 *
 * ══ CISZA W KOKPICIE (pkt 44 zleceń; decyzje właściciela 2026-10-06) ══
 * `quiet: true` dostaje wyłącznie budzik do ZAŁOGI operacji w toku. Czyta je reguła banera
 * w aplikacji (`app/src/ui/screens/logic/inAppBanner.ts`): push odebrany przy otwartej
 * aplikacji - chwila bez łącza - nie stawia wtedy banera nad ekranem drugiego pilota.
 * Dźwięk i baner systemu wycisza osobno kanał (`PushMessage.quiet` → `channelId`).
 */

import type { NotificationDraft } from './bookingNotices.ts';

/** Identyfikatory, po których telefon wybiera ekran; poza nimi jadą `kind` i `orgId`. */
export const PUSH_DATA_KEYS = ['bookingId', 'aircraftId', 'orderId', 'recipientId'] as const;

export type PushData = {
  kind: NotificationDraft['kind'];
  orgId: string;
  bookingId?: string;
  aircraftId?: string;
  orderId?: string;
  recipientId?: string;
  /** Wyłącznie przy budziku do załogi operacji w toku - klucz istnieje tylko z wartością. */
  quiet?: true;
};

/** Dane budzika dla jednej wiadomości - czysta funkcja, bez dostępu do bazy. */
export function pushData(
  orgId: string,
  draft: Pick<NotificationDraft, 'kind' | 'payload'>,
  quiet = false,
): PushData {
  const data: PushData = { kind: draft.kind, orgId };
  for (const key of PUSH_DATA_KEYS) {
    const value = draft.payload[key];
    if (typeof value === 'string' && value !== '') data[key] = value;
  }
  if (quiet) data.quiet = true;
  return data;
}
