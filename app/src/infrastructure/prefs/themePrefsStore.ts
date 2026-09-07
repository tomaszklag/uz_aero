/**
 * UZ Aero - adapter `ThemePrefsPort`: rekord motywu PER PILOT w magazynie klucz→wartość
 * (produkcyjnie AsyncStorage; decyzja 2026-07-29: motyw jest preferencją pilota).
 *
 * Klasa dostaje magazyn KONSTRUKTOREM (strukturalny podzbiór AsyncStorage), więc sama
 * nie importuje modułu RN - format zapisu i migrację starego klucza testujemy w Node,
 * dokładnie jak `schema.ts` na `node:sqlite`. Wołający podaje AsyncStorage wprost:
 *   `new ThemePrefsStore(AsyncStorage)`.
 *
 * Klucz `uzaero.theme.<pilotId>` - ta sama konwencja co banery edu
 * (`uzaero.edu.<pilotId>.<bannerId>`): na wspólnym telefonie pracuje kilku pilotów
 * i preferencja jednego nie może przemalowywać ekranu drugiemu.
 *
 * MIGRACJA ŁAGODNA: przed tą decyzją motyw żył per TELEFON pod kluczem `uzaero.theme`
 * (goła nazwa motywu, nie JSON). Pierwszy odczyt pilota bez własnego klucza przejmuje
 * go jako punkt startowy z `updatedAt = 0` i `dirty = false`: nie fabrykujemy stempla
 * DECYZJI (nikt jej wtedy nie podejmował per profil), więc każdy PRAWDZIWY wybór -
 * z serwera albo lokalny - wygra z odziedziczonym. Starego klucza nie kasujemy:
 * kolejni piloci tego telefonu mają odziedziczyć ten sam punkt startowy.
 */

import type { ThemePrefRecord, ThemePrefsPort } from '../../application/ports';

/** Strukturalny podzbiór AsyncStorage - dokładnie to, czego używamy. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** Klucz sprzed decyzji 2026-07-29 (motyw per telefon) - czytany tylko do migracji. */
export const LEGACY_THEME_KEY = 'uzaero.theme';

const key = (pilotId: string): string => `${LEGACY_THEME_KEY}.${pilotId}`;

export class ThemePrefsStore implements ThemePrefsPort {
  constructor(private readonly kv: KeyValueStorage) {}

  async read(pilotId: string): Promise<ThemePrefRecord | null> {
    const raw = await this.kv.getItem(key(pilotId));
    if (raw != null) return decode(raw);

    const legacy = await this.kv.getItem(LEGACY_THEME_KEY);
    if (legacy == null || legacy.length === 0) return null;

    // Adopcję zapisujemy od razu - stan pilota ma być taki sam przy każdym odczycie,
    // a nie zależeć od tego, czy stary klucz jeszcze istnieje.
    const adopted: ThemePrefRecord = { theme: legacy, updatedAt: 0, dirty: false };
    await this.write(pilotId, adopted);
    return adopted;
  }

  async write(pilotId: string, record: ThemePrefRecord): Promise<void> {
    await this.kv.setItem(key(pilotId), JSON.stringify(record));
  }
}

/** Zepsuty zapis (ręczna edycja, stara wersja) = brak rekordu, nie wyjątek przy starcie. */
function decode(raw: string): ThemePrefRecord | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed != null &&
      typeof (parsed as ThemePrefRecord).theme === 'string' &&
      typeof (parsed as ThemePrefRecord).updatedAt === 'number' &&
      typeof (parsed as ThemePrefRecord).dirty === 'boolean'
    ) {
      const { theme, updatedAt, dirty } = parsed as ThemePrefRecord;
      return { theme, updatedAt, dirty };
    }
    return null;
  } catch {
    return null;
  }
}
