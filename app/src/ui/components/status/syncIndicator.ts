/**
 * UZ Aero - stan wskaźnika łączności i treść arkusza synchronizacji.
 *
 * Stoi przy komponencie, nie w `ui/screens/logic/`, z tego samego powodu co `syncStamp`:
 * chip wisi na wszystkich ekranach, więc nie należy do żadnego. `.tsx` eksportuje
 * wyłącznie komponenty (`docs/architektura-kodu.md` §2), a to jest decyzja, którą da się
 * sprawdzić bez React Native - i którą trzeba sprawdzać, bo raz już była nieprawdziwa.
 *
 * ── DLACZEGO TEN MODUŁ POWSTAŁ (uwaga z urządzenia, 2026-08-30) ─────────────────────
 *
 * Zgłoszenie: „klikam «ponów próbę» i nie dostaję żadnego feedback czy się udało czy nie.
 * Dodatkowo po kliknięciu w logach api widzę, że udało się połączenie, ale UI nadal mówi,
 * że jest offline."
 *
 * Obie połowy miały jedną przyczynę: **chip nazywał „offline" niepustą KOLEJKĘ**
 * (`synced: count === 0` w `sessionQueries.outboxStatus`), a nie brak sieci. Kolejka
 * bywa niepusta z powodów niemających z siecią nic wspólnego - i wtedy pill mówił
 * o zasięgu, którego pilot nie stracił, a arkusz obiecywał, że „wyślą się same, gdy
 * wróci sieć", choć sieć była i to serwer odmówił.
 *
 * Aplikacja miała już WŁAŚCIWĄ definicję i stosowała ją gdzie indziej - w Ustawieniach
 * (`lastSync?.kind === 'offline'`, z komentarzem „innego pojęcia o sieci aplikacja nie ma
 * i nie udaje, że ma") oraz w plakietce zaległości na 12 (`CLAUDE.md`, issue #35:
 * „rozstrzyga wynik OSTATNIEJ próby synca"). Chip był jedynym miejscem z definicją drugą,
 * powtórzoną w piętnastu wywołaniach jako `status={synced ? 'synced' : 'offline'}`.
 * Dlatego rachunek przenosi się TUTAJ, a ekrany przestają go liczyć: szesnasta kopia nie
 * ma jak się rozjechać, skoro nie ma czego kopiować.
 *
 * ── TRZY STANY, BO TRZY RÓŻNE WIADOMOŚCI ────────────────────────────────────────────
 *
 *  • `hidden`  - nie ma o czym mówić. Zsynchronizowano jest stanem DOMYŚLNYM (issue #12),
 *                a kolejka, która opróżni się sama przy najbliższej okazji, też nim jest:
 *                pilot nie ma tu nic do zrobienia. Cisza.
 *  • `offline` - ostatnia próba nie znalazła serwera. Bursztyn, bo to przejdzie samo.
 *  • `blocked` - serwer ODPOWIEDZIAŁ i odmówił, albo sesja wygasła. **To nie jest
 *                offline** i nie wolno tego tak nazwać: sieć jest, a kolejka mimo to
 *                stoi i sama ruszy dopiero, gdy ktoś coś zrobi. Czerwień, bo bursztyn
 *                w tej aplikacji znaczy „poczekaj, samo przejdzie".
 *
 * Rozdzielenie `offline` od `blocked` nie jest ozdobą stanu awaryjnego - to warunek tego,
 * żeby raport z ponowienia w ogóle mógł być prawdziwy. Bez niego jedyną odpowiedzią na
 * odmowę serwera było zdanie o czekaniu na zasięg.
 */

import type { SyncOutcome } from '../../../application/sync/syncEngine';
import { eventsCount, plural, timeUtc } from '../../format';
import type { Tone } from '../tone';

export type SyncIndicator = 'hidden' | 'offline' | 'blocked';

/**
 * Wynik ostatniej próby rozstrzyga o SIECI, kolejka o tym, czy jest o czym mówić.
 *
 * Pusta kolejka gasi wskaźnik nawet po nieudanej próbie: „offline" bez ani jednego
 * zdarzenia do wysłania jest informacją o pogodzie, nie o pracy pilota (§4.1 - brak
 * sieci niczego nie blokuje). `last == null` też gasi - przed pierwszą próbą nie wiemy
 * nic, a zgadywanie z niepustej kolejki jest dokładnie tym błędem, który ten moduł
 * naprawia.
 */
export function syncIndicator(outboxCount: number, last: SyncOutcome | null): SyncIndicator {
  if (outboxCount <= 0 || last == null) return 'hidden';
  switch (last.kind) {
    case 'offline':
      return 'offline';
    case 'rejected':
    case 'auth_expired':
      return 'blocked';
    // `synced` i `idle` z niepustą kolejką znaczą „dopisano coś PO tamtej próbie" -
    // najbliższa okazja to zabierze i pilot nie ma tu nic do roboty.
    default:
      return 'hidden';
  }
}

/** Napis pilla: „OFFLINE · 2" / „SYNC STOI · 2". */
export function syncPillLabel(indicator: SyncIndicator, outboxCount: number): string {
  return indicator === 'blocked' ? `SYNC STOI · ${outboxCount}` : `OFFLINE · ${outboxCount}`;
}

export function syncPillTone(indicator: SyncIndicator): Tone {
  return indicator === 'blocked' ? 'red' : 'amber';
}

export interface SyncReport {
  text: string;
  tone: Tone;
}

/**
 * Baner arkusza - fakt i to, co się z nim stanie.
 *
 * Zdanie o odmowie kończy się DROGĄ WYJŚCIA („zgłoś administratorowi"), bo bez niej
 * baner jest samą złą wiadomością. Nie ma tu za to ani słowa o kopercie czy budowie
 * kolejki - ta sama granica, którą issue #43 wyznaczyło arkuszom korekty: pilot dostaje
 * odpowiedź na swoje pytanie, nie opis wnętrza rejestru.
 *
 * KOD odmowy jednak PADA, bo jest jedyną rzeczą, którą da się z tym ekranem zrobić:
 * pilot przeczyta go administratorowi przez telefon. Bez niego rozmowa zaczyna się
 * od zgadywania.
 */
export function syncReport(
  indicator: SyncIndicator,
  outboxCount: number,
  last: SyncOutcome | null,
): SyncReport {
  const queued = eventsCount(outboxCount);
  const wait = plural(outboxCount, 'czeka', 'czekają', 'czeka');

  if (last?.kind === 'synced') {
    return {
      tone: 'green',
      text:
        outboxCount > 0
          ? `Wysłano ${eventsCount(last.pushed)}. W kolejce zostało ${queued}.`
          : `Wysłano ${eventsCount(last.pushed)} - kolejka jest pusta.`,
    };
  }

  if (indicator === 'blocked') {
    return last?.kind === 'auth_expired'
      ? {
          tone: 'red',
          text:
            `Sesja wygasła - ${queued} ${wait} w kolejce i nie wyślą się same. ` +
            'Twoje zapisy są bezpieczne w telefonie. Zaloguj się ponownie.',
        }
      : {
          tone: 'red',
          text:
            `Serwer odmówił przyjęcia - ${queued} ${wait} w kolejce i nie wyślą się same. ` +
            'Twoje zapisy są bezpieczne w telefonie. Zgłoś to administratorowi' +
            `${last?.kind === 'rejected' ? ` (kod: ${last.code})` : ''}.`,
        };
  }

  if (indicator === 'offline') {
    return {
      tone: 'amber',
      text: `Offline - ${queued} ${wait} w kolejce. Wyślą się same, gdy wróci sieć.`,
    };
  }

  // Kolejka czeka na najbliższą okazję - stan normalny, nie awaria.
  return {
    tone: 'neutral',
    text: `${queued} w kolejce. Wyślą się przy najbliższej okazji.`,
  };
}

export interface AttemptStamp {
  value: string;
  tone?: Tone;
}

/**
 * Wiersz „Ostatnia próba" - JEDYNY ślad tego, że ponowienie się odbyło.
 *
 * Przy nieudanym ponowieniu nic innego w arkuszu się nie zmienia: kolejka stoi, stempel
 * udanego syncu stoi, pill stoi. Bez tego wiersza tapnięcie w „PONÓW PRÓBĘ" wyglądało
 * więc dokładnie jak przycisk, który nie działa - i to było sednem zgłoszenia.
 *
 * `null` przed pierwszą próbą: wiersz o niczym byłby szumem (ta sama reguła, którą
 * issue #43 wyrzuciło „Historia zmian: 0").
 */
export function attemptStamp(last: SyncOutcome | null, at: number | null): AttemptStamp | null {
  if (last == null || at == null) return null;
  const time = `${timeUtc(at)} UTC`;
  switch (last.kind) {
    case 'synced':
      return { value: `${time} - wysłano ${last.pushed}`, tone: 'green' };
    case 'idle':
      return { value: `${time} - nie było czego wysłać` };
    case 'offline':
      return { value: `${time} - brak sieci`, tone: 'amber' };
    case 'auth_expired':
      return { value: `${time} - sesja wygasła`, tone: 'red' };
    case 'rejected':
      return { value: `${time} - odrzucone`, tone: 'red' };
  }
}
