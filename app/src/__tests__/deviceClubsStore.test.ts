/**
 * Ninerdeck - `DeviceClubsStore`: kluby znane URZĄDZENIU (2.1.0, §5.1, D10).
 *
 * Format zapisu i jego odporność sprawdzamy w Node, bez AsyncStorage - klasa dostaje
 * magazyn konstruktorem, dokładnie jak `ThemePrefsStore`.
 */

import { DEVICE_CLUBS_KEY, DeviceClubsStore, type KeyValueStorage } from '../infrastructure';
import type { OrgRef } from '../application/ports';

const ALFA: OrgRef = { id: 'org-a', slug: 'alfa', name: 'Aeroklub Alfa' };
const BETA: OrgRef = { id: 'org-b', slug: 'beta', name: 'Aeroklub Beta' };

class MemoryKv implements KeyValueStorage {
  items = new Map<string, string>();
  async getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

describe('DeviceClubsStore', () => {
  it('świeże urządzenie nie zna nikogo - i to jest normalny stan, nie brak danych', async () => {
    expect(await new DeviceClubsStore(new MemoryKv()).read()).toEqual({ clubs: [], activeId: null });
  });

  it('zapamiętany klub staje się BIEŻĄCYM - w nim rozwiąże się następny kod pilota', async () => {
    const store = new DeviceClubsStore(new MemoryKv());
    await store.remember(ALFA, '2026-09-18T07:00:00.000Z');

    expect(await store.read()).toEqual({
      clubs: [{ id: ALFA.id, name: ALFA.name, lastLoginAt: '2026-09-18T07:00:00.000Z' }],
      activeId: ALFA.id,
    });
  });

  it('drugie logowanie tego samego klubu odświeża stempel, nie dokłada wiersza', async () => {
    const store = new DeviceClubsStore(new MemoryKv());
    await store.remember(ALFA, '2026-09-17T07:00:00.000Z');
    await store.remember(ALFA, '2026-09-18T07:00:00.000Z');

    const record = await store.read();
    expect(record.clubs).toHaveLength(1);
    expect(record.clubs[0]?.lastLoginAt).toBe('2026-09-18T07:00:00.000Z');
  });

  it('nazwa idzie ze ŚWIEŻEJ pary tokenów - klub przemianowany w panelu zmienia się i tu', async () => {
    const store = new DeviceClubsStore(new MemoryKv());
    await store.remember(ALFA, '2026-09-17T07:00:00.000Z');
    await store.remember({ ...ALFA, name: 'Aeroklub Alfa Nowy' }, '2026-09-18T07:00:00.000Z');

    expect((await store.read()).clubs[0]?.name).toBe('Aeroklub Alfa Nowy');
  });

  it('lista idzie od najświeższego - 00I wypisuje ją bez własnego sortowania', async () => {
    const store = new DeviceClubsStore(new MemoryKv());
    await store.remember(BETA, '2026-09-18T07:00:00.000Z');
    await store.remember(ALFA, '2026-09-17T07:00:00.000Z');

    expect((await store.read()).clubs.map((c) => c.id)).toEqual([BETA.id, ALFA.id]);
  });

  it('wybór z 00I przestawia kontekst, nie ruszając listy', async () => {
    const store = new DeviceClubsStore(new MemoryKv());
    await store.remember(ALFA, '2026-09-17T07:00:00.000Z');
    await store.remember(BETA, '2026-09-18T07:00:00.000Z');

    await store.setActive(ALFA.id);

    const record = await store.read();
    expect(record.activeId).toBe(ALFA.id);
    expect(record.clubs).toHaveLength(2);
  });

  it('klub spoza listy jest ignorowany - pigułka na 00F nie ma prawa stać bez nazwy', async () => {
    const store = new DeviceClubsStore(new MemoryKv());
    await store.remember(ALFA, '2026-09-18T07:00:00.000Z');

    await store.setActive('org-nieznany');

    expect((await store.read()).activeId).toBe(ALFA.id);
  });

  it('lista PRZEŻYWA wylogowanie, bo nie mieszka w magazynie poświadczeń', async () => {
    // Dowód jest w tym, że klucz jest ZWYKŁY i jeden - `SecureCredentials.clear()`
    // nie ma do niego dostępu, bo czyści `expo-secure-store`.
    const kv = new MemoryKv();
    await new DeviceClubsStore(kv).remember(ALFA, '2026-09-18T07:00:00.000Z');

    expect([...kv.items.keys()]).toEqual([DEVICE_CLUBS_KEY]);
    // Ten sam magazyn, nowy egzemplarz klasy - jak po restarcie aplikacji.
    expect((await new DeviceClubsStore(kv).read()).activeId).toBe(ALFA.id);
  });

  it('zepsuty zapis daje pusty stan, nie wyjątek przy starcie', async () => {
    const kv = new MemoryKv();
    await kv.setItem(DEVICE_CLUBS_KEY, '{to nie jest json');
    expect(await new DeviceClubsStore(kv).read()).toEqual({ clubs: [], activeId: null });

    await kv.setItem(DEVICE_CLUBS_KEY, JSON.stringify({ clubs: 'nie tablica' }));
    expect(await new DeviceClubsStore(kv).read()).toEqual({ clubs: [], activeId: null });
  });

  it('bieżący klub wskazujący na nieistniejący wpis wraca jako brak', async () => {
    const kv = new MemoryKv();
    await kv.setItem(
      DEVICE_CLUBS_KEY,
      JSON.stringify({
        clubs: [{ id: ALFA.id, name: ALFA.name, lastLoginAt: '2026-09-18T07:00:00.000Z' }],
        activeId: 'org-skasowany',
      }),
    );

    expect((await new DeviceClubsStore(kv).read()).activeId).toBeNull();
  });
});
