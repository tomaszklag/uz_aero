/**
 * UZ Aero — migawka cudzej sesji → treść ekranu 04b (`design/04b-cockpit-readonly.html`).
 *
 * Osobny moduł z tego samego powodu co `cockpitLog.ts` i `statsDay.ts`: to jedyna
 * nietrywialna logika prezentacji tego ekranu i jedyna, którą da się sprawdzić bez
 * React Native.
 *
 * Cała treść tego ekranu należy do KATEGORII (b) z `CLAUDE.md` — dane z serwera. Nie ma
 * tu ani jednej wartości liczonej z własnego strumienia zdarzeń, więc każde zdanie musi
 * nieść stan świeżości (§4.8). Dlatego stopka `.ro-meta` powstaje TUTAJ, razem z tekstem
 * banera, a nie jako doklejona później adnotacja: napis o stanie samolotu i napis o wieku
 * tego stanu mają jedno wspólne źródło i nie da się zaktualizować jednego bez drugiego.
 *
 * Świeżość i łączność to dwie różne osie (patrz `FreshnessNote`), ale na tym ekranie
 * splatają się w jednym punkcie: migawkę pobieramy przy wejściu, więc brak sieci znaczy
 * „pokazujemy to, co zapamiętaliśmy". Stąd `peekFreshness` patrzy i na wiek migawki,
 * i na stan wysyłki.
 */

import type { EpochMillis, Event, SessionState } from '../../../domain';
import { timeUtc } from '../../format';
// Ten sam format daty co w oknie korekty na ekranie 10 („21 JUN 17:30"). Drugi zestaw
// skrótów miesięcy dałby dwa różne zapisy tej samej rzeczy w jednej aplikacji.
import { dateTimeUtcShort } from './statsDay';

/** Stan danych z serwera wg §4.8 — bez `manual`, bo tu nie ma czego wpisać z licznika. */
export type PeekFreshness = 'live' | 'cache' | 'brak';

/** Fragment zdania banera; `strong` = wyróżnienie (kontrakt z `components/PeekBanner`). */
export interface PeekTextSegment {
  text: string;
  strong?: boolean;
}

/**
 * Migawka cudzej sesji tak, jak przychodzi z serwera: surowy strumień zdarzeń plus
 * moment pobrania.
 *
 * Zdarzenia, a nie gotowe podsumowanie — bo `projectSession()` jest czystą funkcją
 * domeny i policzy z nich dokładnie ten sam stan, który widzi pilot prowadzący. Gdyby
 * serwer przysyłał wyliczone liczby, mielibyśmy drugie miejsce, w którym powstaje
 * prawda o dniu, i pierwszy rozjazd byłby kwestią czasu.
 */
export interface PeekSnapshot {
  events: Event[];
  /** Kiedy migawkę pobrano z serwera (UTC). */
  fetchedAt: EpochMillis;
}

/**
 * Do ilu migawka jest jeszcze „na żywo".
 *
 * Podgląd pobieramy przy wejściu na ekran i nie odświeżamy go w tle — po kilku minutach
 * czytania to już nie jest stan bieżący, tylko zapamiętany. Próg jest celowo krótki:
 * fałszywe „live" jest gorsze od nadmiarowego „cache", bo pilot podejmuje na tej podstawie
 * decyzję o przejęciu samolotu.
 */
export const LIVE_MAX_AGE_MS = 2 * 60_000;

export function peekFreshness(
  snapshot: PeekSnapshot | null,
  online: boolean,
  now: EpochMillis,
): PeekFreshness {
  if (snapshot == null) return 'brak';
  if (!online) return 'cache';
  return now - snapshot.fetchedAt <= LIVE_MAX_AGE_MS ? 'live' : 'cache';
}

/**
 * Wiek migawki słowami („sprzed 12 min", „stan sprzed ponad doby").
 *
 * Sama data pobrania nie odpowiada na pytanie pilota — „21 JUN 17:30" wymaga policzenia
 * w głowie, ile to godzin temu, a to jest właśnie ta liczba, od której zależy, czy warto
 * ufać stanowi paliwa.
 */
export function snapshotAgeLabel(ageMs: number): string {
  if (ageMs < 60_000) return 'sprzed chwili';
  if (ageMs < 3_600_000) return `sprzed ${Math.floor(ageMs / 60_000)} min`;
  if (ageMs < 86_400_000) return `sprzed ${Math.floor(ageMs / 3_600_000)} h`;
  return 'sprzed ponad doby';
}

export interface PeekBannerInput {
  freshness: PeekFreshness;
  /** Kod pilota prowadzącego samolot (np. „KRZ"); null, gdy cache go nie zna. */
  picCode: string | null;
  /** Od kiedy trwa jego claim (UTC). */
  claimSince: EpochMillis | null;
  /** Kiedy pobrano migawkę (UTC); null przy stanie `brak`. */
  fetchedAt: EpochMillis | null;
  /** Ostatnie zdarzenie w migawce (UTC) — „ostatnia aktywność KRZ 09:38". */
  lastActivityAt: EpochMillis | null;
  now: EpochMillis;
}

export interface PeekBannerModel {
  /** Ton pudełka: informacja vs uwaga na wiek danych. */
  tone: 'blue' | 'amber';
  text: PeekTextSegment[];
  /** `.stale-warn` — czego ten stan może już nie obejmować. */
  warning: string | null;
  /** `.ro-meta` — pochodzenie i wiek danych. */
  meta: string;
  /** Kropka przy stopce. */
  metaTone: 'green' | 'amber';
}

/** „KRZ · od 07:10" — wyróżniony fragment zdania o prowadzącym. */
function leadPilot(picCode: string | null, claimSince: EpochMillis | null): string {
  const who = picCode ?? 'inny pilot';
  return claimSince != null ? `${who} · od ${timeUtc(claimSince)}` : who;
}

/**
 * Baner `.ro-banner` — jedyne miejsce, które mówi wprost, dlaczego ekran nic nie zapisuje.
 *
 * Zdanie o single-writerze („dane zapisuje wyłącznie jego telefon") jest tu, a nie
 * w drobnym druku, bo to ono tłumaczy wszystkie blokady niżej. Bez niego wyszarzona
 * siatka akcji wygląda na awarię aplikacji, a nie na regułę (§4.1 pkt 3).
 */
export function peekBanner(input: PeekBannerInput): PeekBannerModel {
  const { freshness, picCode, claimSince, fetchedAt, lastActivityAt, now } = input;
  const who = picCode ?? 'prowadzący pilot';

  const text: PeekTextSegment[] = [
    { text: 'Samolot prowadzi ' },
    { text: leadPilot(picCode, claimSince), strong: true },
    { text: '. Dane zapisuje wyłącznie jego telefon — Ty widzisz stan pobrany z serwera.' },
  ];

  if (freshness === 'live') {
    const activity =
      lastActivityAt != null ? ` · ostatnia aktywność ${who} ${timeUtc(lastActivityAt)}` : '';
    return {
      tone: 'blue',
      text,
      warning: null,
      meta: `Dane z serwera · pobrano ${timeUtc(fetchedAt)}${activity}`,
      metaTone: 'green',
    };
  }

  if (freshness === 'cache' && fetchedAt != null) {
    return {
      tone: 'amber',
      text,
      warning: `Brak łączności — to ostatni znany stan. ${who} mógł już wylądować, zatankować albo zamknąć dzień.`,
      meta: `Ostatnie pobrane dane · ${dateTimeUtcShort(fetchedAt)} · stan ${snapshotAgeLabel(now - fetchedAt)}`,
      metaTone: 'amber',
    };
  }

  // `brak` (§4.8): nigdy nie pobraliśmy tej sesji. Puste miejsce po logu wyglądałoby jak
  // „pilot nic nie zrobił" — a to zupełnie inna informacja niż „nie wiemy, co zrobił".
  return {
    tone: 'amber',
    text,
    warning: 'Nie mamy jeszcze żadnej migawki tego dnia — przebieg pokażemy po pierwszym połączeniu z serwerem.',
    meta: 'Brak danych z serwera — przebieg dnia nieznany',
    metaTone: 'amber',
  };
}

/** „1 cykl" / „3 cykle" / „6 cykli" — polska liczba mnoga w nagłówku logu. */
export function cyclesLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return '1 cykl';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} cykle`;
  return `${count} cykli`;
}

/**
 * Nagłówek karty logu: „Log SP-FGK · KRZ · UTC · 1 cykl · 1 T/O" (mockup 04b).
 *
 * Samolot stoi PRZED pilotem, bo to log jednej MASZYNY. Do 2026-08-08 stało tu „Log dnia
 * KRZ", czyli obietnica przekroju przez cały dzień poprzednika — a po §3.6a jego dzień
 * może objąć kilka samolotów i ten ekran o pozostałych nic nie wie.
 */
export function peekLogTitle(
  aircraftId: string | null,
  picCode: string | null,
  state: SessionState | null,
): string {
  const machine = aircraftId ?? 'samolotu';
  const who = picCode ?? 'prowadzącego';
  if (state == null) return `Log ${machine} · ${who} · UTC · brak danych`;
  return `Log ${machine} · ${who} · UTC · ${cyclesLabel(state.legs.length)} · ${state.takeoffCount} T/O`;
}

export interface PeekStatus {
  label: string;
  tone: 'green' | 'blue' | 'neutral';
}

/**
 * Chip stanu (`.ground-chip`). Sufiks „wg serwera" jest częścią etykiety, a nie
 * przypisem obok: chip czyta się jednym spojrzeniem i to spojrzenie ma od razu wiedzieć,
 * że to cudzy stan, a nie odczyt z tego telefonu.
 */
export function peekStatusChip(state: SessionState | null): PeekStatus {
  if (state == null) return { label: 'Stan nieznany · brak danych z serwera', tone: 'neutral' };
  // `closed` znaczy ZDANY SAMOLOT, nie zamknięty dzień poprzednika (§3.6a): `day_close`
  // kończy pracę z tą maszyną, a pilot może za chwilę wziąć następną. Napis o „dniu"
  // mówił o cudzej służbie coś, czego strumień jednej sesji nie wie.
  if (state.closed) return { label: 'Samolot zdany · wg serwera', tone: 'neutral' };
  if (state.inFlight) return { label: 'W powietrzu · wg serwera', tone: 'blue' };
  if (state.engineRunning) return { label: 'Running · silnik pracuje · wg serwera', tone: 'green' };
  return { label: 'Ground · silnik wyłączony · wg serwera', tone: 'neutral' };
}

/**
 * Ostrzeżenie NAD przyciskiem „PRZEJMIJ SAMOLOT".
 *
 * Treść przyszła tu z arkusza potwierdzenia, który do issue #12 otwierał się na liście
 * samolotów (02). Arkusz pytał „PRZEJMIJ SP-FGK?" nad listą, na której nie widać było ani
 * stanu maszyny, ani tego, co poprzednik zdążył zrobić — czyli nad ekranem BEZ przesłanek
 * do tej decyzji. Tutaj przesłanki są (baner podglądu, chip stanu, log dnia), więc
 * ostrzeżenie stoi obok nich, a nie w osobnym oknie nad czymś innym.
 *
 * Offline mówi więcej niż online i tak ma być: claim jest optymistyczny (§4.4), więc
 * przejęcie bez sieci DZIAŁA — pilot musi to wiedzieć, zanim zrezygnuje z lotu, czekając
 * na zasięg. Jednocześnie ma wiedzieć, czym płaci: odczyty wpisze z liczników, a kolizja
 * z poprzednikiem zostanie oznaczona do wyjaśnienia.
 */
export function takeoverWarning(freshness: PeekFreshness, picCode: string | null): string {
  const who = picCode ?? 'poprzedni PIC';
  const base =
    `${who} może mieć niewysłane dane. Po przejęciu tylko Ty będziesz wysyłać dane dla tego ` +
    'samolotu — zweryfikuj odczyty paliwa i MH z liczników w kolejnym kroku. Spóźnione dane ' +
    'poprzednika serwer scali automatycznie.';

  if (freshness === 'live') return base;
  return (
    `${base} Przejęcie działa też bez sieci: zapisze się na telefonie i wyśle po powrocie ` +
    `zasięgu, a jeśli ${who} nadal lata, oznaczymy to do wyjaśnienia.`
  );
}

/**
 * Podpis POD „PRZEJMIJ SAMOLOT" (`.takeover-hint`) — dokąd prowadzi ten przycisk.
 *
 * Od issue #12 przycisk naprawdę przejmuje: wybiera ten samolot w preflightcie i wraca
 * na krok 1. Nic jeszcze nie trafia do rejestru — `session_claim` powstaje dopiero przy
 * potwierdzeniu na ekranie 3 — i pilot ma prawo to wiedzieć, zanim naciśnie przycisk
 * z napisem „PRZEJMIJ".
 */
export function takeoverHint(reg: string | null): string {
  const what = reg ?? 'ten samolot';
  return `Wrócisz do preflightu z wybranym ${what} — dzień zapisze się dopiero po potwierdzeniu danych`;
}
