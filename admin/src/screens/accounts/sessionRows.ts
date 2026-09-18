/**
 * Ninerdeck - panel: sesja logowania -> WIERSZ LISTY URZĄDZEŃ (2.1.0, issue #134 D4/D6;
 * mockupy `piloci-konto` i `konto`).
 *
 * Moduł CZYSTY (bez Reacta), bo to są decyzje o treści dwóch linijek - a te same dwie
 * linijki rysują się na DWÓCH ekranach: w karcie członka (sesje w tym klubie) i na
 * `#/konto` (własne sesje ze wszystkich klubów). Jeden kształt, żeby nie rozjechały się
 * przy pierwszej poprawce jednego z nich - ta sama zasada, co przy kafelku operacji
 * w aplikacji pilota.
 *
 * ══ LISTA ODPOWIADA NA JEDNO PYTANIE: „CZY TO MOJE URZĄDZENIE" ══
 * Wszystko, co tu stoi, ma pomóc je rozpoznać, i nic ponadto. Stąd brak kolumny
 * z adresem IP w wierszu (jest w tytule, dla kogoś, kto naprawdę szuka) i brak
 * identyfikatora sesji: człowiek nie rozpoznaje urządzenia po uuid.
 */

import { dateTimeUtcShort, relativeAge } from '@ninerdeck/format';

import type { LoginSessionDto, SessionMethodDto, SessionSurfaceDto } from '../../api/dto';

/**
 * Ikona wiersza. DWIE, nie trzy: rozstrzyga POWIERZCHNIA, która jest danymi - kształtu
 * obudowy („tablet czy telefon") rejestr nie zna i nie ma skąd wziąć.
 */
export type SessionIcon = 'monitor' | 'phone';

export interface SessionRow {
  id: string;
  icon: SessionIcon;
  /** Pierwsza linia - KTÓRE to urządzenie. */
  device: string;
  /** Druga linia (mono) - metoda, od kiedy i kiedy ostatnio widziane. */
  meta: string;
  /** Adres w tytule wiersza; `null` = nieznany, więc tytułu nie ma. */
  ip: string | null;
  /** Ta karta przeglądarki: plakietka „To urządzenie" zamiast przycisku „Wyloguj". */
  current: boolean;
}

const METHOD_LABEL: Record<SessionMethodDto, string | null> = {
  google: 'Google',
  password: 'hasło',
  // `legacy` nie jest metodą, tylko brakiem odpowiedzi o sesji sprzed 2.1.0. Wiersz
  // milczy o niej zamiast pisać „wcześniejsze wydanie" - to byłoby zdanie o wydaniach
  // aplikacji, a nie o urządzeniu, które człowiek próbuje rozpoznać.
  legacy: null,
};

/**
 * Doba UTC danej chwili - panel nie ma innej strefy i mówi to przy każdym stemplu.
 * Liczymy w dniach od epoki, bo pytanie brzmi „ten sam dzień?", a nie „ile minęło".
 */
const dayOf = (ms: number): number => Math.floor(ms / 86_400_000);

/**
 * „dziś 08:12" / „wczoraj 19:40" / „12 WRZ 08:04".
 *
 * Trzy zapisy, bo trzy różne pytania: przy dzisiejszej sesji liczy się godzina, przy
 * wczorajszej - że to było wczoraj, a dalej wstecz data. Mockup rysuje dokładnie te trzy.
 */
export function whenText(iso: string, now: number): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '—';

  const days = dayOf(now) - dayOf(at);
  const time = dateTimeUtcShort(at).slice(-5);
  if (days === 0) return `dziś ${time}`;
  if (days === 1) return `wczoraj ${time}`;
  return dateTimeUtcShort(at);
}

/**
 * „3 min temu" dla świeżej aktywności, data dla starszej.
 *
 * Granica biegnie po DOBIE, nie po liczbie godzin: „26 h temu" każe liczyć w głowie,
 * a „wczoraj 19:40" odpowiada od razu. Dokładność jest i tak ograniczona przepustnicą
 * 60 s po stronie serwera - i ta lista nie udaje, że jest większa.
 */
export function lastSeenText(iso: string, now: number): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '—';
  if (dayOf(now) - dayOf(at) > 0) return whenText(iso, now);
  return `${relativeAge(Math.max(0, now - at))} temu`;
}

/**
 * Napis urządzenia.
 *
 * Człon powierzchni dokładamy WYŁĄCZNIE tam, gdzie napis jeszcze jej nie mówi:
 * etykieta przeglądarki („Chrome · Windows") nie mówi, w czym człowiek w niej siedzi,
 * a etykietę telefonu składa sama aplikacja i nazywa w niej siebie („Ninerdeck 2.1.0").
 * Dopisanie tam słowa „telefon" byłoby trzecim powtórzeniem w jednej linii.
 */
export function deviceText(device: string | null, surface: SessionSurfaceDto): string {
  if (device == null || device.trim() === '') {
    return surface === 'panel' ? 'urządzenie nieznane · panel' : 'urządzenie nieznane · telefon';
  }
  return surface === 'panel' ? `${device} · panel` : device;
}

export function sessionRow(session: LoginSessionDto, now: number): SessionRow {
  const method = METHOD_LABEL[session.method];
  const parts = [
    ...(method == null ? [] : [method]),
    `od ${whenText(session.createdAt, now)}`,
    // Przy BIEŻĄCEJ sesji „ostatnio" znaczyłoby „przed chwilą" i tyle - a to jest
    // dokładnie to, co mówi już plakietka „To urządzenie".
    ...(session.current ? [] : [`ostatnio ${lastSeenText(session.lastSeenAt, now)}`]),
  ];

  return {
    id: session.id,
    icon: session.surface === 'panel' ? 'monitor' : 'phone',
    device: deviceText(session.device, session.surface),
    meta: parts.join(' · '),
    ip: session.ip,
    current: session.current,
  };
}

/**
 * Kolejność listy: BIEŻĄCA na górze, potem od najświeższej aktywności.
 *
 * „Czy to moje urządzenie" zaczyna się od rozpoznania tego, przy którym się siedzi -
 * a reszta układa się tak, jak człowiek ją pamięta: wczorajszy tablet przed telefonem
 * sprzed miesiąca.
 */
export function sessionRows(sessions: readonly LoginSessionDto[], now: number): SessionRow[] {
  return [...sessions]
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    })
    .map((session) => sessionRow(session, now));
}
