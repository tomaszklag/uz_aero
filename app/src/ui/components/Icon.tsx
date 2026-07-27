/**
 * UZ Aero — Icon (prymityw DS)
 *
 * Mockupy rysują ikony wklejonymi SVG z zestawu **Feather** (`eye`, `alert-triangle`,
 * `check`, `arrow-right`, `settings`, `check-circle`, `edit-2` — to dosłownie te ścieżki).
 * Tutaj bierzemy je z `@expo/vector-icons`: biblioteka fontowa, więc działa bez
 * przebudowy dev clienta (żadnego modułu natywnego ponad `expo-font`, który już mamy).
 *
 * Ekran NIE podaje nazwy glifu ani zestawu — podaje nazwę **znaczeniową** (`peek`,
 * `warning`, `op-skoki`). Dzięki temu:
 *  • podmiana biblioteki ikon to zmiana w jednym pliku,
 *  • ta sama rzecz wygląda tak samo na każdym ekranie,
 *  • w kodzie ekranu widać intencję, a nie „parachute".
 *
 * Czego tu nie ma: dwóch ikon oznaczających to samo. Jeśli potrzebujesz nowej — dopisz
 * ją do rejestru, nie importuj Feathera w ekranie.
 */

import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type Glyph = { set: 'feather'; glyph: FeatherName } | { set: 'mci'; glyph: MciName };

const f = (glyph: FeatherName): Glyph => ({ set: 'feather', glyph });
const m = (glyph: MciName): Glyph => ({ set: 'mci', glyph });

/**
 * Rejestr znaczeniowy. Zestaw Feather (te same kształty co w mockupach) uzupełniamy
 * o MaterialCommunityIcons tam, gdzie Feather nie ma odpowiednika — samolot i spadochron.
 */
const REGISTRY = {
  // stany i komunikaty
  check: f('check'),
  warning: f('alert-triangle'),
  info: f('alert-circle'),
  peek: f('eye'), // podgląd read-only cudzego samolotu (04B)
  edit: f('edit-2'),
  next: f('arrow-right'),
  // Powrót to `chevron-left`, nie `arrow-left` — tak jest w `.back-btn` mockupów.
  // Strzałka jest zarezerwowana dla ruchu naprzód („DALEJ"), żeby dwa kierunki
  // nie wyglądały jak ta sama akcja odbita w lustrze.
  back: f('chevron-left'),
  sync: f('refresh-cw'),
  offline: f('wifi-off'),
  clock: f('clock'),
  fuel: f('droplet'),

  // akcje kokpitu
  start: f('play'),
  stop: f('square'),
  takeoff: f('arrow-up'),
  landing: f('arrow-down'),
  settings: f('settings'),
  more: f('chevron-right'),

  // akcje naziemne (siatka na 04)
  refuel: m('fuel'),
  crew: f('user-check'),
  'manual-log': f('file-text'),
  'end-day': f('log-out'),
  drop: m('parachute'),

  // obiekty
  aircraft: m('airplane'),

  // rodzaje operacji (siatka kart — `CLAUDE.md`: ikony, nie select)
  'op-skoki': m('parachute'),
  'op-ferry': m('airplane'),
  'op-egzamin': f('check-circle'),
  'op-techniczny': f('settings'),
  'op-inne': f('alert-circle'),
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof REGISTRY;

export interface IconProps {
  name: IconName;
  /** Rozmiar w px. Domyślnie 16 — tyle mają ikony inline w mockupach. */
  size?: number;
  color: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 16, color, style }: IconProps) {
  const entry: Glyph = REGISTRY[name];
  const common = { size, color, style, allowFontScaling: false };

  return entry.set === 'feather' ? (
    <Feather name={entry.glyph} {...common} />
  ) : (
    <MaterialCommunityIcons name={entry.glyph} {...common} />
  );
}
