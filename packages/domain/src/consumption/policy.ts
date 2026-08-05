/**
 * UZ Aero — progi analityki zużycia: co wchodzi do modelu i kiedy wolno go pokazać.
 *
 * ══ WSZYSTKIE WARTOŚCI SĄ DO KALIBRACJI ══
 * Bazowe pochodzą z rozumowania o dokładności paliwomierza i o tym, ile równań
 * potrzeba, żeby regresja o czterech niewiadomych cokolwiek znaczyła — nie z danych
 * z lotów. Kalibrujemy je na realnej historii klubu PO wdrożeniu etapu 1, tą samą
 * metodą co progi detekcji (`docs/algorytm-detekcji.md` §15: „progów NIE stroimy
 * na wyczucie"). Zmiana któregokolwiek z nich zmienia liczby na ekranie A10a.
 *
 * ══ DLACZEGO PROGI PUBLIKACJI W OGÓLE ISTNIEJĄ ══
 * Stawka policzona z dwóch odczytów paliwomierza jest liczbą — ale nie jest wiedzą.
 * Ekran, który ją pokaże, skłamie skuteczniej niż ekran, który powie „za mało danych",
 * bo liczba wygląda na wynik pomiaru. Poniżej progu pokazujemy więc postęp zbierania
 * i surowe interwały (mockup `A10b`), nigdy stawkę „wstępną".
 */

import { isUsableInterval, type FuelInterval, type IntervalRejection } from './interval';

/** Godzina w milisekundach — mianownik wszystkich stawek. */
export const HOUR_MS = 3_600_000;

/**
 * Krótszy interwał nie wchodzi do regresji (30 min pracy silnika).
 *
 * Paliwomierz ma błąd odczytu rzędu kilku litrów NIEZALEŻNIE od długości odcinka, więc
 * przy dziesięciu minutach ten błąd jest całym sygnałem: 3 L pomyłki na 0,2 h daje 15 L/h
 * czystego szumu wpisanego w równanie. Dłuższe interwały rozkładają ten sam błąd na
 * większy mianownik — i dlatego regresja waży je mocniej (patrz `nnls.ts`).
 */
export const MIN_INTERVAL_ENGINE_MS = 30 * 60_000;

/** Minimalna liczba przyjętych interwałów, żeby opublikować stawki. */
export const MIN_PUBLISH_INTERVALS = 5;

/** Minimalny łączny czas pracy silnika w oknie, żeby opublikować stawki (10 h). */
export const MIN_PUBLISH_ENGINE_MS = 10 * HOUR_MS;

/**
 * Minimalna liczba zamkniętych dni, żeby opublikować przeliczniki motogodzin.
 *
 * Osobny próg od paliwowego, bo model MH ma inne wejście: jedno równanie na DZIEŃ
 * (licznik odczytujemy dwa razy dziennie), nie na interwał. Trzy dni dałyby jeden
 * stopień swobody i przedział szerszy od samej wartości; przy pięciu zaczyna to
 * cokolwiek znaczyć — a `k` są stałymi maszyny, więc zbiegają się szybko.
 */
export const MIN_PUBLISH_MH_DAYS = 5;

/**
 * Ile odchyleń standardowych reszty czyni interwał odstającym.
 *
 * Odstający NIE ZNIKA: wypada z regresji i trafia na listę z powodem (mockup A10a,
 * plakietka „Odstaje"). Interwał, którego model nie tłumaczy, jest zwykle śladem
 * czegoś realnego — pomyłki w odczycie albo dolewki spoza aplikacji — więc ukrycie go
 * kosztowałoby dokładnie tę informację, dla której ten ekran powstał.
 */
export const OUTLIER_SIGMA = 3;

/**
 * Powyżej tej WZGLĘDNEJ szerokości przedziału ufności uznajemy, że faz nie da się
 * rozdzielić, i schodzimy o szczebel niżej na drabinie modeli (`model.ts`).
 *
 * Próg stoi na przedziale, a nie na liczbie warunkowej ani na współczynniku inflacji
 * wariancji, świadomie: dla kolumn nieujemnych i niecentrowanych (czasy) korelacje są
 * z natury wysokie, więc podręcznikowy próg „VIF > 10" nie ma tu żadnej kalibracji.
 * Przedział natomiast jest w jednostkach, które i tak pokazujemy, i czyta się wprost:
 * „nie umiemy rozdzielić tych faz, bo jedna wychodzi ±50%".
 */
export const MAX_RELATIVE_CI = 0.5;

/** Poziom ufności przedziałów (dwustronnych). Zmiana wymaga zmiany tablicy `T_TWO_SIDED_95`. */
export const CI_LEVEL = 0.95;

/**
 * Dlaczego interwał nie wchodzi do regresji — bez odstających, bo te rozstrzyga
 * dopiero dopasowany model (`model.ts`), a ta funkcja działa przed nim.
 */
export function intervalRejection(interval: FuelInterval): IntervalRejection | null {
  // Paliwa przybyło bez tankowania. Zwykle literówka w odczycie albo dolewka zrobiona
  // poza aplikacją; jedno i drugie jest sprawą do wyjaśnienia przy dniu, nie danymi.
  if (interval.consumedL < 0) return 'negative-consumption';
  if (interval.engineMs <= 0) return 'no-engine';
  if (interval.engineMs < MIN_INTERVAL_ENGINE_MS) return 'engine-too-short';
  return null;
}

/** Stan bramki publikacji — pod mierniki postępu na `A10b`. */
export interface PublicationGate {
  published: boolean;
  /** Ile interwałów przyjęto (po odrzuceniach). */
  intervals: number;
  /** Łączny czas pracy silnika przyjętych interwałów (ms). */
  engineMs: number;
  /** Ile interwałów brakuje do progu; 0 gdy próg spełniony. */
  missingIntervals: number;
  /** Ile czasu silnika brakuje do progu (ms); 0 gdy próg spełniony. */
  missingEngineMs: number;
}

/** Czy zebrane interwały wystarczają, żeby pokazać stawki. */
export function publicationGate(intervals: readonly FuelInterval[]): PublicationGate {
  const accepted = intervals.filter(isUsableInterval);
  const engineMs = accepted.reduce((sum, interval) => sum + interval.engineMs, 0);

  return {
    published:
      accepted.length >= MIN_PUBLISH_INTERVALS && engineMs >= MIN_PUBLISH_ENGINE_MS,
    intervals: accepted.length,
    engineMs,
    missingIntervals: Math.max(0, MIN_PUBLISH_INTERVALS - accepted.length),
    missingEngineMs: Math.max(0, MIN_PUBLISH_ENGINE_MS - engineMs),
  };
}
