/**
 * UZ Aero - Icon (prymityw DS)
 *
 * Mockupy rysują ikony wklejonymi SVG z zestawu **Feather** (`eye`, `alert-triangle`,
 * `check`, `arrow-right`, `settings`, `check-circle`, `edit-2` - to dosłownie te ścieżki).
 * Tutaj bierzemy je z `@expo/vector-icons`: biblioteka fontowa, więc działa bez
 * przebudowy dev clienta (żadnego modułu natywnego ponad `expo-font`, który już mamy).
 *
 * Ekran NIE podaje nazwy glifu ani zestawu - podaje nazwę **znaczeniową** (`peek`,
 * `warning`, `op-skoki`). Dzięki temu:
 *  • podmiana biblioteki ikon to zmiana w jednym pliku,
 *  • ta sama rzecz wygląda tak samo na każdym ekranie,
 *  • w kodzie ekranu widać intencję, a nie „parachute".
 *
 * Czego tu nie ma: dwóch ikon oznaczających to samo. Jeśli potrzebujesz nowej - dopisz
 * ją do rejestru, nie importuj Feathera w ekranie.
 */

import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { createIconSet } from '@expo/vector-icons';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Fazy lotu (hero 05) potrzebują dwóch glifów, których nie ma w żadnym z zestawów:
 * śmigła i samolotu kołującego. Żyją we własnym foncie generowanym ze źródeł
 * `assets/phase-icons/` przez `npm run build:phase-font` - font, a nie SVG, bo
 * projekt nie dokłada modułów natywnych ponad expo-font (patrz wyżej).
 * Punkty kodowe są kontraktem z generatorem - zmieniasz tu, zmień i tam.
 */
const PHASE_GLYPHS = { 'plane-taxi': 0xe001, propeller: 0xe002 } as const;
type PhaseName = keyof typeof PHASE_GLYPHS;
const PhaseIcons = createIconSet(
  PHASE_GLYPHS,
  'UZAeroPhases',
  require('../../../../assets/fonts/UZAeroPhases.ttf'),
);

type Glyph =
  | { set: 'feather'; glyph: FeatherName; rotateDeg?: number }
  | { set: 'mci'; glyph: MciName; rotateDeg?: number }
  | { set: 'phase'; glyph: PhaseName; rotateDeg?: number };

const f = (glyph: FeatherName): Glyph => ({ set: 'feather', glyph });
const m = (glyph: MciName, rotateDeg?: number): Glyph => ({ set: 'mci', glyph, rotateDeg });
const p = (glyph: PhaseName): Glyph => ({ set: 'phase', glyph });

/**
 * Rejestr znaczeniowy. Zestaw Feather (te same kształty co w mockupach) uzupełniamy
 * o MaterialCommunityIcons tam, gdzie Feather nie ma odpowiednika - samolot i spadochron.
 */
const REGISTRY = {
  // stany i komunikaty
  check: f('check'),
  warning: f('alert-triangle'),
  info: f('alert-circle'),
  /**
   * Pytajnik banerów POUCZAJĄCYCH (uwaga z urządzenia, 2026-08-27): baner, który
   * wyjaśnia, PYTA - nie ostrzega. `info` (alert-circle) rysuje wykrzyknik w kółku
   * i na ekranie czytał się jak ostrzeżenie; wyjaśnienia dostają własny glif,
   * ten sam w banerze i w zwiniętym chipie.
   */
  help: f('help-circle'),
  peek: f('eye'), // podgląd read-only cudzego samolotu (04B)
  // Przejęcie samolotu (`.takeover-btn` z 04B) - strzałki rozchodzące się na zewnątrz.
  // To dokładnie ten kształt, który mockup wkleja jako SVG (Feather `maximize-2`):
  // ruch „na zewnątrz podglądu", a nie kolejna strzałka w prawo, która myliłaby się
  // z „DALEJ".
  takeover: f('maximize-2'),
  edit: f('edit-2'),
  // Dopisanie czegoś, czego jeszcze nie ma (zwinięte liczniki serii na 09A) - plus,
  // a nie ołówek: ołówek obiecuje poprawianie istniejącej wartości.
  add: f('plus'),
  // Lupa, a nie ołówek, przy polach otwierających arkusz z WYSZUKIWANIEM (trasa, 02E):
  // zgłoszenie z urządzenia mówiło wprost, że po polu tekstowym „nie widać, że tam jest
  // przeszukiwanie" - ikona jest pierwszym miejscem, w którym to widać (issue #14).
  search: f('search'),
  next: f('arrow-right'),
  // Powrót to `chevron-left`, nie `arrow-left` - tak jest w `.back-btn` mockupów.
  // Strzałka jest zarezerwowana dla ruchu naprzód („DALEJ"), żeby dwa kierunki
  // nie wyglądały jak ta sama akcja odbita w lustrze.
  back: f('chevron-left'),
  sync: f('refresh-cw'),
  offline: f('wifi-off'),
  clock: f('clock'),
  fuel: f('droplet'),
  // Historia zmian zdarzenia (issue #43, arkusz 10I) - strzałka cofająca się w czasie,
  // nie zegar: `clock` znaczy w tej aplikacji TERMIN (okno korekty, godzina zdarzenia),
  // a tu chodzi o przeszłe wersje tej samej danej.
  history: f('rotate-ccw'),
  // Unieważnienie zdarzenia („tego lądowania nie było", issue #43). KOSZ, nie ostrzeżenie:
  // to jedyna akcja arkusza korekty, która coś ODEJMUJE z logu, i jedyna, przy której
  // ikona wystarcza za napis - a wielki czerwony przycisk krzyczał jak akcja główna,
  // choć intencją wchodzącego jest poprawka, nie kasowanie (uwaga z urządzenia).
  trash: f('trash-2'),
  // Zdjęcie WYBORU z pola („×" przy wybranym lotnisku, issue #62). To NIE jest `trash`:
  // kosz odejmuje coś z rejestru i dlatego jest czerwony, a tu chodzi o wyczyszczenie
  // wartości formularza, której pilot jeszcze nigdzie nie zapisał.
  clear: f('x'),

  // akcje kokpitu
  start: f('play'),
  stop: f('square'),
  takeoff: f('arrow-up'),
  landing: f('arrow-down'),
  settings: f('settings'),
  lock: f('lock'), // dni po oknie korekty (12) - „zamknięte", nie „ostrzeżenie"
  more: f('chevron-right'),

  // akcje naziemne (siatka na 04)
  refuel: m('fuel'),
  /** Dolewka oleju (issue #60) - kropla; dystrybutor zostaje przy tankowaniu. */
  oil: f('droplet'),
  crew: f('user-check'),
  'manual-log': f('file-text'),
  'end-day': f('log-out'),
  drop: m('parachute'),
  // Załadunek skoczków (issue #21) - grupa ludzi, nie `user-check` (ten znaczy załogę)
  // i nie spadochron (ten znaczy zrzut): wsiadanie i wynoszenie to dwa końce tej samej
  // historii i mają wyglądać jak para, ale nie jak duplikat.
  boarding: m('account-group'),

  // Lot bez zapisu GPS (16A): pinezka PRZEKREŚLONA - mówi „nie ma śladu", a nie
  // „nie ma sieci" (`offline` znaczy brak łączności) ani „nie było lotu"
  // (`aircraft-off` znaczy sesję bez lotu). Ślad nie ma z siecią nic wspólnego.
  'no-track': m('map-marker-off'),

  // przełącznik motywu (13, issue #72)
  // Księżyc i słońce, bo pilot wybiera JASNOŚĆ ekranu, a nie nazwę palety - ta sama
  // para działa bez czytania etykiety, w rękawicach i pod słońcem. Próbek koloru tu
  // nie ma: przy dwóch pozycjach czarny i biały kwadrat mówiłyby to, co napis obok.
  'theme-dark': f('moon'),
  'theme-light': f('sun'),

  // obiekty
  aircraft: m('airplane'),
  // Sesja, w której silnik ani razu nie ruszył (09C) - samolot PRZEKREŚLONY, nie zwykły:
  // stan pusty ma powiedzieć „nie było lotu", a nie „tu był samolot".
  'aircraft-off': m('airplane-off'),

  // powody zdania samolotu bez lotu (siatka kart 09C)
  'reason-weather': f('cloud-drizzle'),
  'reason-malfunction': f('tool'),
  'reason-cancelled': f('minus-circle'),
  'reason-other': f('align-left'),

  // fazy lotu - hero kokpitu 05 (komplet zatwierdzony 2026-08-04)
  'phase-idle': p('propeller'),
  'phase-taxi': p('plane-taxi'),
  'phase-climb': m('airplane-takeoff'),
  // Dziób pionowo w górę - symbol „w powietrzu", nie trajektoria: naturalna
  // orientacja glifu (45° w prawo-górę) sugerowała wznoszenie obok `takeoff`.
  'phase-cruise': m('airplane', -45),
  'phase-descent': m('airplane-landing'),

  // rodzaje operacji (siatka kart - `CLAUDE.md`: ikony, nie select)
  'op-skoki': m('parachute'),
  'op-ferry': m('airplane'),
  'op-egzamin': f('check-circle'),
  'op-techniczny': f('settings'),
  'op-inne': f('alert-circle'),
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof REGISTRY;

export interface IconProps {
  name: IconName;
  /** Rozmiar w px. Domyślnie 16 - tyle mają ikony inline w mockupach. */
  size?: number;
  color: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 16, color, style }: IconProps) {
  const entry: Glyph = REGISTRY[name];
  const common = {
    size,
    color,
    // Obrót mieszka w rejestrze (np. cruise −45°), nie w ekranach - glif i jego
    // orientacja to jedna decyzja designu, nie dwie.
    style: (entry.rotateDeg != null
      ? [style, { transform: [{ rotate: `${entry.rotateDeg}deg` }] }]
      : style) as StyleProp<TextStyle>,
    allowFontScaling: false,
  };

  return entry.set === 'feather' ? (
    <Feather name={entry.glyph} {...common} />
  ) : entry.set === 'phase' ? (
    <PhaseIcons name={entry.glyph} {...common} />
  ) : (
    <MaterialCommunityIcons name={entry.glyph} {...common} />
  );
}
