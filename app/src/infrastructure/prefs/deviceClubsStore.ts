/**
 * Ninerdeck - adapter `DeviceClubsPort`: kluby znane URZĄDZENIU (2.1.0, §5.1, D10).
 *
 * Magazyn klucz→wartość (produkcyjnie AsyncStorage), a nie `expo-secure-store` - w liście
 * nie ma ani tokenu, ani osoby, a przede wszystkim ma ona PRZEŻYĆ wylogowanie: po to
 * istnieje. Sekrety kasuje `SecureCredentials.clear()` i ma je kasować.
 *
 * Klasa dostaje magazyn KONSTRUKTOREM, jak `ThemePrefsStore` - format zapisu sprawdzamy
 * w Node, bez urządzenia.
 *
 * Klucz jest JEDEN i bez pilota (`ninerdeck.deviceClubs`), inaczej niż przy motywie
 * i pamięci zadania: tamte są preferencjami CZŁOWIEKA na wspólnym telefonie, a ta lista
 * opisuje SAMOLOT. Przypisana do pilota znikałaby dokładnie wtedy, gdy jest potrzebna -
 * przy następnym, który dopiero wpisuje swój kod.
 */

import type { DeviceClub, DeviceClubsPort, DeviceClubsRecord, OrgRef } from '../../application/ports';
import type { KeyValueStorage } from './themePrefsStore';

export const DEVICE_CLUBS_KEY = 'ninerdeck.deviceClubs';

/** Pusty stan - świeże urządzenie, które nikogo jeszcze nie widziało. */
const EMPTY: DeviceClubsRecord = { clubs: [], activeId: null };

export class DeviceClubsStore implements DeviceClubsPort {
  constructor(private readonly kv: KeyValueStorage) {}

  async read(): Promise<DeviceClubsRecord> {
    const raw = await this.kv.getItem(DEVICE_CLUBS_KEY);
    return raw == null ? EMPTY : (decode(raw) ?? EMPTY);
  }

  async remember(club: OrgRef, at: string): Promise<void> {
    const record = await this.read();
    const entry: DeviceClub = { id: club.id, name: club.name, lastLoginAt: at };
    // Nazwa jedzie ze ŚWIEŻEJ pary tokenów, więc wpis się nią NADPISUJE: klub
    // przemianowany w panelu ma się przemianować i na tablecie.
    const clubs = [entry, ...record.clubs.filter((c) => c.id !== club.id)];
    await this.write({ clubs: sorted(clubs), activeId: club.id });
  }

  async setActive(orgId: string): Promise<void> {
    const record = await this.read();
    // Identyfikator spoza listy ignorujemy zamiast go zapisywać: `activeId`, którego
    // nie ma w `clubs`, dałby na 00F pigułkę bez nazwy - pole loginu udawałoby wtedy
    // kontekst, którego urządzenie nie zna.
    if (!record.clubs.some((c) => c.id === orgId)) return;
    await this.write({ ...record, activeId: orgId });
  }

  private write(record: DeviceClubsRecord): Promise<void> {
    return this.kv.setItem(DEVICE_CLUBS_KEY, JSON.stringify(record));
  }
}

/** Najświeższy pierwszy - 00I wypisuje listę w tej kolejności, bez własnego sortowania. */
const sorted = (clubs: DeviceClub[]): DeviceClub[] =>
  [...clubs].sort((a, b) => b.lastLoginAt.localeCompare(a.lastLoginAt));

/** Zepsuty zapis = pusty stan, nie wyjątek przy starcie (jak w `ThemePrefsStore`). */
function decode(raw: string): DeviceClubsRecord | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return null;
    const { clubs, activeId } = parsed as Partial<DeviceClubsRecord>;
    if (!Array.isArray(clubs)) return null;
    const clean = clubs.filter(
      (c): c is DeviceClub =>
        typeof c === 'object' &&
        c != null &&
        typeof c.id === 'string' &&
        typeof c.name === 'string' &&
        typeof c.lastLoginAt === 'string',
    );
    return {
      clubs: sorted(clean),
      activeId: typeof activeId === 'string' && clean.some((c) => c.id === activeId) ? activeId : null,
    };
  } catch {
    return null;
  }
}
