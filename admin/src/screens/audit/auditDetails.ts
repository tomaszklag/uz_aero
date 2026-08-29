/**
 * UZ Aero - panel: kolumna „Szczegóły" dziennika, `details` → wiersze (moduł CZYSTY).
 *
 * `admin_audit.details` jest workiem `JSONB` o kształcie zależnym od akcji. Serwer
 * wydaje go BEZ interpretacji (`domain/adminActions.ts`: „serwer nie zna języka
 * interfejsu"), więc nazwanie pól jest sprawą panelu - i tu mieszka.
 *
 * ══ REGUŁA NADRZĘDNA: POKAŻ WSZYSTKO, ZGADUJ NIC ══
 * Pole, którego panel nie zna, trafia na ekran z SUROWĄ nazwą klucza i surową
 * wartością. Nie jest pomijane i nie jest podmieniane na „-". Dziennik audytu, który
 * ukrywa pole, bo go nie rozumie, przestaje być narzędziem nadzoru - a to jedyne, po
 * co ta tabela istnieje. Z tego samego powodu NIE zmieniamy kolejności kluczy:
 * porządek jest taki, w jakim przyszedł z serwera.
 *
 * Jedyna interpretacja, na którą sobie pozwalamy, to `newTime` - bo panel wie, skąd
 * ten klucz pochodzi (`application/admin/commands/corrections.ts` zapisuje tam epokę
 * w ms), a surowe `1782212493000` nie jest odpowiedzią na pytanie „na kiedy przesunięto
 * lądowanie". Liczba zostaje widoczna obok, więc nic nie znika.
 */

import { dateTimeUtc } from '@uzaero/format';

export interface DetailRow {
  /** Surowy klucz z `details` - także wtedy, gdy panel go zna (spójność z bazą). */
  key: string;
  /** Etykieta po polsku; dla klucza nieznanego RÓWNA się kluczowi. */
  label: string;
  /** Wartość jako TEKST. Nigdy HTML - payloady pochodzą z telefonów i z formularzy. */
  value: string;
  /** `false` = klucz spoza tego, co panel umie nazwać; wiersz jest wygaszony. */
  known: boolean;
}

/**
 * Klucze, które faktycznie zapisują dzisiejsze komendy panelu:
 * `flag.resolve` → `note`, `type`, `sessionUuids`;
 * `event.correct` → `sessionUuid`, `correctionUuid`, `action`, `newTime`, `reason`.
 *
 * Lista jest OTWARTA z założenia - nowa komenda dołoży swoje pola i pojawią się one
 * na ekranie z surowymi nazwami, dopóki ktoś ich tu nie nazwie. To jest właściwa
 * kolejność zdarzeń: najpierw widać wszystko, potem robi się z tego czytelne.
 */
const LABELS: Record<string, string> = {
  note: 'komentarz',
  reason: 'powód',
  type: 'typ flagi',
  sessionUuid: 'sesja',
  sessionUuids: 'sesje',
  correctionUuid: 'uuid korekty',
  action: 'rodzaj korekty',
  newTime: 'nowy czas zdarzenia',
  revision: 'rewizja karty',
};

/** Klucz niosący epokę w ms - jedyne pole, które panel tłumaczy na czas. */
const EPOCH_KEYS = new Set(['newTime']);

/**
 * Wartość → tekst. Kolejność gałęzi jest kolejnością pewności: im mniej wiemy
 * o kształcie, tym bardziej dosłowny zapis.
 */
function textOf(key: string, value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (typeof value === 'number') {
    if (EPOCH_KEYS.has(key) && Number.isFinite(value)) {
      // Obie postaci naraz: czytelna dla człowieka i surowa dla porównania z bazą.
      return `${dateTimeUtc(value)} UTC (${value})`;
    }
    return String(value);
  }

  if (typeof value === 'string' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    // Pusta tablica NIE znika: „(pusta lista)" i brak pola to dwie różne informacje.
    if (value.length === 0) return '(pusta lista)';
    return value.map((item) => textOf(key, item)).join(' · ');
  }

  // Obiekt zagnieżdżony (np. diff `{from, to}`) - JSON dosłownie. Rozbieranie go
  // na własną prezentację byłoby zgadywaniem kształtu, którego nikt nie obiecał.
  return JSON.stringify(value);
}

/**
 * `details` → wiersze, W KOLEJNOŚCI Z SERWERA. Pusty worek daje pustą listę, a nie
 * wiersz „brak danych" - o tym, co napisać w komórce, decyduje ekran.
 *
 * ══ DLACZEGO `hasOwnProperty`, A NIE `LABELS[key]` ══
 * `details` jest workiem OTWARTYM: klucze pochodzą z `JSONB`, więc panel nie ma nad
 * nimi kontroli. `LABELS['toString']` nie jest `undefined` - jest funkcją z prototypu
 * `Object`. Zwykły odczyt uznałby więc taki klucz za ZNANY i wstawił funkcję w miejsce
 * etykiety, a React na funkcji w drzewie rzuca: zamiast dziennika audytu byłby biały
 * ekran. To samo dotyczy `constructor`, `valueOf` i `hasOwnProperty`. Ten sam wzorzec
 * stoi obok, w `auditActions.ts` (`isAuditAction`) - i z tego samego powodu.
 */
export function detailRows(details: Record<string, unknown>): DetailRow[] {
  return Object.entries(details).map(([key, value]) => {
    const known = Object.prototype.hasOwnProperty.call(LABELS, key);
    return {
      key,
      label: known ? LABELS[key]! : key,
      value: textOf(key, value),
      known,
    };
  });
}

/**
 * Podpis komórki bez szczegółów.
 *
 * Rozróżniamy DWA przypadki, bo znaczą co innego: akcja bez kontekstu (np. czyszczenie
 * tokenów, które niczego nie opisuje) i akcja, której kontekst po prostu nie dotarł.
 * Dziś oba wyglądają w bazie tak samo (`'{}'::jsonb`), więc panel mówi tyle, ile wie.
 */
export const EMPTY_DETAILS_NOTE = 'bez szczegółów - komenda nie zapisała kontekstu';
