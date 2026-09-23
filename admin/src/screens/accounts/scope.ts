/**
 * Ninerdeck - panel: ZAKRES UPRAWNIEŃ członka klubu (epik #197, `docs/uprawnienia.md`).
 *
 * Moduł CZYSTY (bez Reacta), bo to są decyzje o treści ekranu, a nie o jego układzie -
 * i dlatego ma test obok.
 *
 * ══ ZESTAW JEST SKRÓTEM, NIE BYTEM ══
 * Do 3.1.0 członek miał ROLĘ, a rola nadawała komplet zdolności naraz. Odkąd zdolność
 * nadaje się pojedynczo, „administrator" przestał istnieć w modelu: w bazie stoi ZBIÓR,
 * a nazwa zestawu liczy się z niego z powrotem (`scopeLabel`). Dzięki temu dopisanie
 * „Skarbnika" albo przemianowanie „Technika" NIE RUSZA nikomu uprawnień - przestawia
 * tylko to, co panel proponuje następnemu.
 *
 * ══ KATALOG MIESZKA TUTAJ, A NIE NA SERWERZE ══
 * Serwer nie zna języka interfejsu (ta sama zasada, co przy kodach `AccountRefusal`)
 * i nie ma powodu znać nazw zestawów: nie rozstrzyga nimi niczego. Trzyma komplet
 * zdolności klubowych dla bootstrapu i egzekwuje pojedyncze pozycje - reszta jest
 * słownikiem ekranu.
 *
 * ══ NIEZNANA ZDOLNOŚĆ NIE WYWRACA EKRANU ══
 * Zbiór z serwera bywa szerszy niż katalog panelu (wdrożenie serwera idzie pierwsze).
 * Pozycja, której panel nie zna, nie ma nazwy, więc nie pokazuje się na liście -
 * ale LICZY SIĘ do podsumowania i przeżywa zapis, bo formularz wysyła zbiór, który
 * dostał, a nie zbiór, który umiał narysować.
 */

import type { Capability } from '../../api/dto';

/**
 * Zdolności, które wolno nadać CZŁONKOWI KLUBU - w kolejności czytania, nie katalogu.
 *
 * `bugs.triage` i `platform.manage` tu NIE STOJĄ i to nie jest przeoczenie: należą do
 * osi PLATFORMOWEJ (`pilots.platform_role`), której administrator klubu nie dotyka.
 * Wpuszczenie ich na ten ekran obiecywałoby władzę, której serwer nie nada.
 */
export const CLUB_CAPABILITIES: readonly Capability[] = [
  'panel.access',
  'accounts.manage',
  'fleet.manage',
  'events.correct',
  'flags.resolve',
  'reservations.manage',
  'reservations.approve',
  'thresholds.manage',
  'audit.read',
  'maintenance.run',
];

/** Co dana zdolność OTWIERA - jedno zdanie, językiem klubu, nie katalogu tras. */
export const CAPABILITY_LABELS: Record<Capability, { label: string; desc: string }> = {
  'panel.access': {
    label: 'Wejście do panelu',
    desc: 'Bez tego reszta zakresu nie otwiera niczego - osoba pracuje wyłącznie w aplikacji na telefonie.',
  },
  'accounts.manage': {
    label: 'Konta i kod klubu',
    desc: 'Przyjmowanie do klubu, zakresy uprawnień, kod klubu, wylogowywanie cudzych urządzeń.',
  },
  'fleet.manage': {
    label: 'Flota',
    desc: 'Samoloty, normy zużycia, pojemności, format licznika, wyłączanie maszyn z użytku.',
  },
  'events.correct': {
    label: 'Korekty w dzienniku',
    desc: 'Poprawianie i unieważnianie cudzych operacji, także po oknie 24 godzin.',
  },
  'flags.resolve': {
    label: 'Uwagi serwera',
    desc: 'Rozstrzyganie tego, co serwer zgłasza przy operacjach: nakładki, rozjazdy liczników.',
  },
  'reservations.manage': {
    label: 'Cudze rezerwacje',
    desc: 'Odwoływanie i przesuwanie cudzych terminów oraz wpisanie rezerwacji za pilota.',
  },
  'reservations.approve': {
    label: 'Akceptacja rezerwacji',
    desc: 'Rozstrzyganie kroków ścieżki akceptacji i podgląd wszystkich terminów klubu w komplecie.',
  },
  'thresholds.manage': {
    label: 'Progi i reguły',
    desc: 'Strojenie progów analityki zużycia.',
  },
  'audit.read': {
    label: 'Dziennik zmian',
    desc: 'Odczyt tego, kto i co zmienił w panelu.',
  },
  'maintenance.run': {
    label: 'Narzędzia serwisowe',
    desc: 'Przebudowa danych dziennika ze strumienia zdarzeń i odczyt stanu bazy.',
  },
  'bugs.triage': {
    label: 'Zgłoszenia błędów',
    desc: 'Kolejka zgłoszeń z aplikacji - moduł platformy, nie klubu.',
  },
  'platform.manage': {
    label: 'Kluby',
    desc: 'Zakładanie i wyłączanie klubów - wyłącznie superadministrator.',
  },
};

/**
 * ZESTAWY - sześć skrótów odwzorowujących funkcje w klubie (zatwierdzone 2026-09-23).
 *
 * „Własny zakres" jest ZAWSZE ostatni i NIE MA własnej listy: znaczy „ten zbiór nie
 * odpowiada żadnemu skrótowi" i wskakuje sam, gdy tknąć którąkolwiek zdolność. Pozycja,
 * którą trzeba wybrać, ŻEBY MÓC coś zmienić, byłaby bramką przed samą czynnością.
 */
export interface ScopePreset {
  id: string;
  label: string;
  capabilities: readonly Capability[];
}

export const SCOPE_PRESETS: readonly ScopePreset[] = [
  { id: 'pilot', label: 'Pilot', capabilities: [] },
  // Akceptujący NIE MA wejścia do panelu i to jest sedno tej pozycji: mechanik
  // rozstrzyga swój krok z telefonu (ekran 26), a do back-office’u nie wchodzi.
  { id: 'approver', label: 'Akceptujący', capabilities: ['reservations.approve'] },
  {
    id: 'dispatcher',
    label: 'Koordynator lotów',
    capabilities: ['panel.access', 'reservations.manage', 'reservations.approve'],
  },
  { id: 'tech', label: 'Technik', capabilities: ['panel.access', 'fleet.manage'] },
  { id: 'admin', label: 'Administrator', capabilities: CLUB_CAPABILITIES },
];

/** Etykieta pozycji „nic z powyższych" - nie jest zestawem, więc nie stoi w katalogu. */
export const CUSTOM_SCOPE = { id: 'custom', label: 'Własny zakres' } as const;

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');

/** Który zestaw odpowiada temu zbiorowi; `null` = własny zakres. */
export function presetOf(capabilities: readonly Capability[]): ScopePreset | null {
  return SCOPE_PRESETS.find((p) => sameSet(p.capabilities, capabilities)) ?? null;
}

/**
 * Nazwa zakresu DLA CZŁOWIEKA - do plakietki w tabeli i do podpisu karty.
 *
 * Liczona ze ZBIORU, nie przechowywana: kolumna z nazwą ostatnio użytego zestawu
 * rozjechałaby się ze zbiorem przy pierwszej ręcznej poprawce i nikt by tego nie
 * zauważył (`docs/uprawnienia.md` §2.3).
 */
export function scopeLabel(capabilities: readonly Capability[]): string {
  return presetOf(capabilities)?.label ?? CUSTOM_SCOPE.label;
}

/**
 * Ton plakietki. Zieleni tu nie ma: zakres nie jest stanem „w normie", tylko faktem
 * o koncie. Administrator świeci błękitem (to informacja: ten człowiek ma władzę nad
 * klubem), własny zakres bursztynem (wart spojrzenia), pilot jest wygaszony - bo to
 * stan domyślny, a plakietka świecąca przy każdym wierszu uczy oko pomijać kolumnę.
 */
export function scopeTone(capabilities: readonly Capability[]): 'blue' | 'amber' | 'dim' {
  const preset = presetOf(capabilities);
  if (preset == null) return 'amber';
  if (preset.id === 'pilot') return 'dim';
  if (preset.id === 'admin') return 'blue';
  return 'dim';
}

/**
 * Podpis pod listą zestawów: ILE i CZEGO - bez rozwijania listy.
 *
 * Nazwy wypisujemy do trzech; dalej sama liczba, bo wiersz ma zostać wierszem. Przy
 * pustym zbiorze nie ma czego wyliczać i zdanie mówi to wprost - „0 z 9" brzmiałoby
 * jak usterka, a nie jak stan domyślny członka.
 */
export function scopeSummary(capabilities: readonly Capability[]): string {
  const known = capabilities.filter((c) => c in CAPABILITY_LABELS);
  if (known.length === 0) return 'Bez zdolności panelu - wyłącznie aplikacja na telefonie.';

  const names = known.slice(0, 3).map((c) => CAPABILITY_LABELS[c].label);
  const tail = known.length > 3 ? ` i ${known.length - 3} więcej` : '';
  return `Nadane ${known.length} z ${CLUB_CAPABILITIES.length} zdolności · ${names.join(' · ')}${tail}`;
}

/**
 * Przełączenie jednej zdolności - zbiór zostaje w kolejności KATALOGU, nie klikania.
 *
 * Kolejność nie jest informacją (serwer i tak porównuje zbiory), ale stabilna kolejność
 * sprawia, że diff w dzienniku nadzoru czyta się tak samo za każdym razem.
 */
export function toggleCapability(
  capabilities: readonly Capability[],
  capability: Capability,
): Capability[] {
  const next = new Set(capabilities);
  if (next.has(capability)) next.delete(capability);
  else next.add(capability);
  return [...CLUB_CAPABILITIES, ...capabilities].filter(
    (c, i, all) => next.has(c) && all.indexOf(c) === i,
  );
}
