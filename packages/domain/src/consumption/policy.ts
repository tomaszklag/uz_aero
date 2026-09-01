/**
 * UZ Aero - progi analityki zużycia: co wchodzi do modelu i kiedy wolno go pokazać.
 *
 * ══ WSZYSTKIE WARTOŚCI SĄ DO KALIBRACJI ══
 * Bazowe pochodzą z rozumowania o dokładności paliwomierza i o tym, ile równań
 * potrzeba, żeby regresja o czterech niewiadomych cokolwiek znaczyła - nie z danych
 * z lotów. Kalibrujemy je na realnej historii klubu PO wdrożeniu etapu 1, tą samą
 * metodą co progi detekcji (`docs/algorytm-detekcji.md` §15: „progów NIE stroimy
 * na wyczucie"). Zmiana któregokolwiek z nich zmienia liczby na ekranie A10a.
 *
 * ══ DLACZEGO PROGI PUBLIKACJI W OGÓLE ISTNIEJĄ ══
 * Stawka policzona z dwóch odczytów paliwomierza jest liczbą - ale nie jest wiedzą.
 * Ekran, który ją pokaże, skłamie skuteczniej niż ekran, który powie „za mało danych",
 * bo liczba wygląda na wynik pomiaru. Poniżej progu pokazujemy więc postęp zbierania
 * i surowe interwały (mockup `A10b`), nigdy stawkę „wstępną".
 */

import { isUsableInterval, type FuelInterval, type IntervalRejection } from './interval';

/** Godzina w milisekundach - mianownik wszystkich stawek. */
export const HOUR_MS = 3_600_000;

/**
 * Krótszy interwał nie wchodzi do regresji (30 min pracy silnika).
 *
 * Paliwomierz ma błąd odczytu rzędu kilku litrów NIEZALEŻNIE od długości odcinka, więc
 * przy dziesięciu minutach ten błąd jest całym sygnałem: 3 L pomyłki na 0,2 h daje 15 L/h
 * czystego szumu wpisanego w równanie. Dłuższe interwały rozkładają ten sam błąd na
 * większy mianownik - i dlatego regresja waży je mocniej (patrz `nnls.ts`).
 */
export const MIN_INTERVAL_ENGINE_MS = 30 * 60_000;

/**
 * Górny próg długości interwału (16 h pracy silnika).
 *
 * Znaleziony przebiegiem po realnej historii (2026-08-05): w rejestrze stała sesja
 * z `engine_start` 27 lipca 19:00 i `engine_stop` 29 lipca 11:33 - czterdzieści godzin
 * „pracy silnika" przez dwie noce. To nie jest lot, tylko zapomniane wyłączenie, więc
 * czas w takim interwale jest fikcją, a stawka z niego - fikcją pomnożoną przez paliwo.
 *
 * Próg jest lustrem `MIN_INTERVAL_ENGINE_MS`: tam odcinamy odcinki, w których błąd
 * odczytu przeważa nad sygnałem, tu - takie, w których mianownik nie opisuje niczego
 * rzeczywistego. Szesnaście godzin jest wyraźnie ponad najdłuższym realnym dniem
 * lotnym (Antonow przy skokach robi 8–10 h), więc prawdziwego dnia nie utnie.
 */
export const MAX_INTERVAL_ENGINE_MS = 16 * 3_600_000;

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
 * cokolwiek znaczyć - a `k` są stałymi maszyny, więc zbiegają się szybko.
 */
export const MIN_PUBLISH_MH_DAYS = 5;

/**
 * Ile odchyleń standardowych reszty czyni interwał odstającym.
 *
 * Odstający NIE ZNIKA: wypada z regresji i trafia na listę z powodem (mockup A10a,
 * plakietka „Odstaje"). Interwał, którego model nie tłumaczy, jest zwykle śladem
 * czegoś realnego - pomyłki w odczycie albo dolewki spoza aplikacji - więc ukrycie go
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

/**
 * Górny próg współczynnika inflacji wariancji - DRUGA, niezależna bramka rozdzielności.
 *
 * ══ DLACZEGO SAM PRZEDZIAŁ NIE WYSTARCZA (przebieg z 2026-08-05) ══
 * Pierwsza wersja pilnowała wyłącznie `MAX_RELATIVE_CI` i przepuściła model, w którym
 * stawka ziemi wyszła WYŻSZA niż stawka lotu (52 vs 37 L/h dla Cessny 182) - fizyczny
 * absurd. Przedziały wyglądały wtedy przyzwoicie (±21% i ±14%), bo dane były wewnętrznie
 * spójne, więc σ reszt było maleńkie. Iloczyn `σ · √VIF` może być mały nawet przy VIF
 * rzędu tysiąca - czyli przy kolumnach praktycznie nierozróżnialnych.
 *
 * To są dwie różne rzeczy i muszą mieć dwie bramki: przedział mówi, JAK DOKŁADNIE znamy
 * stawkę przy tych danych, a VIF - czy dane w ogóle niosą informację o tym podziale.
 * Model idealnie dopasowany do danych, których proporcje faz są prawie stałe, podaje
 * podział dowolny, a nie wyznaczony.
 *
 * Wartość 100 znaczy „niepewność najwyżej dziesięciokrotnie większa niż przy fazach
 * idealnie rozdzielonych" (VIF wchodzi pod pierwiastek). Klasyczny podręcznikowy próg
 * to 10, ale kolumny czasów są nieujemne i niecentrowane, więc ich cosinusy są z natury
 * wysokie - 10 wycinałoby modele, które jeszcze coś znaczą.
 */
export const MAX_VARIANCE_INFLATION = 100;

/** Poziom ufności przedziałów (dwustronnych). Zmiana wymaga zmiany tablicy `T_TWO_SIDED_95`. */
export const CI_LEVEL = 0.95;

/**
 * DOLNA GRANICA pasma oczekiwania dla paliwa (L) - issue #38.
 *
 * Pasmo liczy się z rozrzutu obserwacji (`ratio.ts`), a ten przy danych wewnętrznie
 * spójnych potrafi zejść do zera - dokładnie tak, jak przedziały w `mhModel.ts` przy
 * historii bez szumu. Werdykt „powyżej normy" zapalałby się wtedy na różnicy mniejszej
 * niż to, co paliwomierz w ogóle umie pokazać.
 *
 * Sześć litrów, bo zużycie sesji jest RÓŻNICĄ dwóch odczytów, a każdy z nich ma błąd
 * rzędu trzech litrów (to samo rozumowanie, co przy `MIN_INTERVAL_ENGINE_MS`).
 * DO KALIBRACJI razem z resztą progów tego pliku - `server/scripts/consumptionReplay.ts`.
 */
export const FUEL_BAND_FLOOR_L = 6;

/**
 * DOLNA GRANICA pasma oczekiwania dla motogodzin (h) - issue #38.
 *
 * Ten sam argument co wyżej, tylko jednostką jest podziałka licznika: przyrost MH to
 * różnica dwóch odczytów po 0,05 h rozdzielczości, więc 0,1 h to czysta arytmetyka
 * zaokrągleń, a nie próg „na wyczucie". Poniżej tej wartości nie ma o czym orzekać.
 */
export const MH_BAND_FLOOR_H = 0.1;

/**
 * Dlaczego interwał nie wchodzi do regresji - bez odstających, bo te rozstrzyga
 * dopiero dopasowany model (`model.ts`), a ta funkcja działa przed nim.
 */
export function intervalRejection(interval: FuelInterval): IntervalRejection | null {
  // Paliwa przybyło bez tankowania. Zwykle literówka w odczycie albo dolewka zrobiona
  // poza aplikacją; jedno i drugie jest sprawą do wyjaśnienia przy dniu, nie danymi.
  if (interval.consumedL < 0) return 'negative-consumption';
  if (interval.engineMs <= 0) return 'no-engine';
  if (interval.engineMs < MIN_INTERVAL_ENGINE_MS) return 'engine-too-short';
  if (interval.engineMs > MAX_INTERVAL_ENGINE_MS) return 'engine-too-long';
  return null;
}

/** Stan bramki publikacji - pod mierniki postępu na `A10b`. */
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

/**
 * Względna szerokość pasma wokół normy Z DOKUMENTACJI (issue #66).
 *
 * ══ DLACZEGO OSOBNY PRÓG, A NIE ROZRZUT JAK WSZĘDZIE INDZIEJ ══
 * Pozostałe pasma tego modułu biorą się z ROZRZUTU OBSERWACJI (`ratio.ts`) - i to jest
 * właściwa odpowiedź wszędzie tam, gdzie obserwacje są. Norma z instrukcji użytkowania
 * ich nie ma z definicji: jest jedną liczbą wpisaną w panelu, zanim maszyna przeleci
 * pierwszą godzinę. Pasmo trzeba więc ZADEKLAROWAĆ, a nie zmierzyć - i ta różnica jest
 * treścią `ExpectationBasis: 'nominal'`, żeby ekran umiał ją nazwać.
 *
 * Piętnaście procent, bo tyle mniej więcej dzieli spalanie w przelocie od spalania
 * w dniu z długim kołowaniem, a norma z dokumentacji nie rozdziela faz - jest średnią
 * na godzinę pracy silnika. Pasmo węższe zapalałoby werdykt przy każdej sesji o innej
 * mieszance ziemi i powietrza, czyli mówiłoby o zadaniu, a nie o maszynie.
 *
 * DO KALIBRACJI razem z resztą progów tego pliku - `server/scripts/consumptionReplay.ts`
 * puszcza realną historię przez ten sam kod, co serwer.
 */
export const NOMINAL_BAND_RATIO = 0.15;
