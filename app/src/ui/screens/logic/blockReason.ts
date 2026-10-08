/**
 * Ninerdeck - POWÓD WYŁĄCZENIA Z UŻYTKU po polsku (kalendarz, karta maszyny, obserwowane).
 *
 * Serwer zna wyłącznie trzy kody (`maintenance` / `defect` / `other` - ograniczenie
 * w bazie), a cudza zajętość jedzie na telefon BEZ notatki (pola W7), więc kod jest
 * jedynym, co nazywa taką zajętość. Do 4.0.0 cztery ekrany pisały go wprost: na pasku
 * osi kalendarza stało „maintenance", a odmowa brzmiała „… · maintenance." Słownik jest
 * jeden, żeby pasek, odmowa, filtr maszyn i karta maszyny nie mówiły różnie o tym samym.
 *
 * Kod nieznany (nowszy serwer) zostaje, jak przyszedł - lepszy obcy wyraz niż pustka.
 */

const LABEL: Readonly<Record<string, string>> = {
  maintenance: 'przegląd',
  defect: 'usterka',
  other: 'wyłączona',
};

/** Powód w środku zdania: „przegląd", „usterka", „wyłączona". */
export function blockReasonLabel(reason: string | null): string {
  if (reason == null || reason === '') return LABEL.other!;
  return LABEL[reason] ?? reason;
}

/**
 * Powód jako NAPIS SAMODZIELNY - pasek osi, plakietka filtra, karta wolnej maszyny:
 * „Przegląd", „Usterka", a bez konkretnego powodu „Wyłączony z użytku" (samolot).
 */
export function blockReasonTitle(reason: string | null): string {
  if (reason == null || reason === '' || reason === 'other') return 'Wyłączony z użytku';
  const label = LABEL[reason] ?? reason;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Dopisek powodu po zdaniu, które już mówi „wyłączona z użytku" („… · przegląd").
 * Bez konkretnego powodu dopisku nie ma - „wyłączona z użytku … · wyłączona" mówiłoby
 * to samo dwa razy.
 */
export function blockReasonSuffix(reason: string | null): string {
  if (reason == null || reason === '' || reason === 'other') return '';
  return ` · ${blockReasonLabel(reason)}`;
}
