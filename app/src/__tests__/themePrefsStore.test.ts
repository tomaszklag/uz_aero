/**
 * UZ Aero - testy magazynu motywu PER PILOT (`infrastructure/prefs/themePrefsStore.ts`,
 * decyzja 2026-07-29: motyw jest preferencją pilota, nie telefonu).
 *
 * Klasa dostaje magazyn klucz→wartość konstruktorem (produkcyjnie AsyncStorage),
 * więc format zapisu i migrację starego klucza per telefon sprawdzamy w Node -
 * to jedyne miejsce, które zna kształt rekordu na dysku.
 */

import { LEGACY_THEME_KEY, ThemePrefsStore, type KeyValueStorage } from '../infrastructure';
import type { ThemePrefRecord } from '../application/ports';

class MemoryKv implements KeyValueStorage {
  data = new Map<string, string>();
  getItem = async (key: string) => this.data.get(key) ?? null;
  setItem = async (key: string, value: string) => {
    this.data.set(key, value);
  };
}

describe('ThemePrefsStore', () => {
  it('rekordy żyją per pilot - przelogowanie na wspólnym telefonie zmienia motyw', async () => {
    const store = new ThemePrefsStore(new MemoryKv());
    await store.write('TMK', { theme: 'paper', updatedAt: 1000, dirty: true });
    await store.write('AKO', { theme: 'amber', updatedAt: 2000, dirty: false });

    expect(await store.read('TMK')).toEqual({ theme: 'paper', updatedAt: 1000, dirty: true });
    expect(await store.read('AKO')).toEqual({ theme: 'amber', updatedAt: 2000, dirty: false });
  });

  it('pilot bez rekordu i bez starego klucza = null (ThemeProvider zostaje przy Night)', async () => {
    expect(await new ThemePrefsStore(new MemoryKv()).read('TMK')).toBeNull();
  });

  it('migracja: stary klucz per telefon staje się punktem startowym pilota (updatedAt=0, bez dirty)', async () => {
    const kv = new MemoryKv();
    kv.data.set(LEGACY_THEME_KEY, 'paper'); // zapis sprzed decyzji: goła nazwa, nie JSON
    const store = new ThemePrefsStore(kv);

    const adopted: ThemePrefRecord = { theme: 'paper', updatedAt: 0, dirty: false };
    expect(await store.read('TMK')).toEqual(adopted);
    // Adopcja jest utrwalona pod kluczem pilota…
    expect(kv.data.get(`${LEGACY_THEME_KEY}.TMK`)).toBe(JSON.stringify(adopted));
    // …a stary klucz zostaje: następny pilot tego telefonu dziedziczy ten sam punkt startowy.
    expect(await store.read('AKO')).toEqual(adopted);

    // `updatedAt=0` + `dirty=false` to świadomy wybór: odziedziczony motyw przegrywa
    // z KAŻDĄ prawdziwą decyzją (serwer/pilot) i sam nie pcha się do profilu.
    expect(adopted.updatedAt).toBe(0);
    expect(adopted.dirty).toBe(false);
  });

  it('własny rekord pilota ma pierwszeństwo przed starym kluczem', async () => {
    const kv = new MemoryKv();
    kv.data.set(LEGACY_THEME_KEY, 'paper');
    const store = new ThemePrefsStore(kv);
    await store.write('TMK', { theme: 'solar', updatedAt: 500, dirty: false });

    expect(await store.read('TMK')).toEqual({ theme: 'solar', updatedAt: 500, dirty: false });
  });

  it('zepsuty zapis (nie-JSON, zły kształt) = brak rekordu, nie wyjątek przy starcie', async () => {
    const kv = new MemoryKv();
    const store = new ThemePrefsStore(kv);

    kv.data.set(`${LEGACY_THEME_KEY}.TMK`, 'night'); // goły tekst pod NOWYM kluczem - nie nasz format
    expect(await store.read('TMK')).toBeNull();

    kv.data.set(`${LEGACY_THEME_KEY}.TMK`, JSON.stringify({ theme: 'night' })); // bez metadanych LWW
    expect(await store.read('TMK')).toBeNull();
  });
});
