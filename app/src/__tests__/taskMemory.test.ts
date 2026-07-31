/**
 * UZ Aero — testy PAMIĘCI ZADANIA (`infrastructure/prefs/taskMemoryStore.ts`).
 *
 * Ten magazyn nie trzyma faktów z dnia lotnego, tylko podpowiedź do formularza — i ta
 * różnica wyznacza, czego pilnują testy. Zepsuty albo obcy zapis ma dać **brak
 * podpowiedzi**, nigdy wyjątku: cena pomyłki to jedno wpisanie z ręki, a wyjątek
 * kosztowałby ekran w środku preflightu.
 *
 * Drugi powód istnienia tych testów: rozdział zakresów. Operacja i klient chodzą za
 * PILOTEM, trasa za SAMOLOTEM — pomylenie tego dałoby podpowiedzi cudzych zleceń albo
 * trasę z innej maszyny, czyli dokładnie to, czego pilot nie sprawdza, bo „przecież
 * samo się wypełniło".
 */

import { TaskMemoryStore, type KeyValueStorage } from '../infrastructure';

class MemoryKv implements KeyValueStorage {
  data = new Map<string, string>();
  getItem = async (key: string) => this.data.get(key) ?? null;
  setItem = async (key: string, value: string) => {
    this.data.set(key, value);
  };
}

describe('TaskMemoryStore', () => {
  it('operacja i klient żyją per pilot — na wspólnym telefonie się nie mieszają', async () => {
    const store = new TaskMemoryStore(new MemoryKv());
    await store.writeTask('TMK', { operation: 'skoki', client: 'SKY CAMP' });
    await store.writeTask('AKO', { operation: 'ferry', client: null });

    expect(await store.readTask('TMK')).toEqual({ operation: 'skoki', client: 'SKY CAMP' });
    expect(await store.readTask('AKO')).toEqual({ operation: 'ferry', client: null });
  });

  it('trasa żyje per samolot — An-2 ze swojego lotniska, ferry ze swoją parą ICAO', async () => {
    const store = new TaskMemoryStore(new MemoryKv());
    await store.writeRoute('SP-ANK', { departureIcao: 'EPKK', arrivalIcao: 'EPKK' });
    await store.writeRoute('SP-AXA', { departureIcao: 'EPKK', arrivalIcao: 'EPWA' });

    expect(await store.readRoute('SP-ANK')).toEqual({ departureIcao: 'EPKK', arrivalIcao: 'EPKK' });
    expect(await store.readRoute('SP-AXA')).toEqual({ departureIcao: 'EPKK', arrivalIcao: 'EPWA' });
  });

  it('pierwszy dzień = brak podpowiedzi, nie błąd', async () => {
    const store = new TaskMemoryStore(new MemoryKv());
    expect(await store.readTask('TMK')).toBeNull();
    expect(await store.readRoute('SP-ANK')).toBeNull();
  });

  it('zepsuty zapis nie wywraca ekranu — po prostu nie ma czego podpowiedzieć', async () => {
    const kv = new MemoryKv();
    kv.data.set('uzaero.task.TMK', '{to nie jest json');
    kv.data.set('uzaero.route.SP-ANK', '[]');

    const store = new TaskMemoryStore(kv);
    expect(await store.readTask('TMK')).toBeNull();
    expect(await store.readRoute('SP-ANK')).toBeNull();
  });

  it('nieznany rodzaj operacji odrzucamy w całości', async () => {
    // Wartość spoza słownika §3.1 nie miałaby czego zaznaczyć w siatce kart, a przy
    // potwierdzeniu poszłaby do rejestru — lepiej pusty formularz niż cichy śmieć.
    const kv = new MemoryKv();
    kv.data.set('uzaero.task.TMK', JSON.stringify({ operation: 'kosmos', client: null }));

    expect(await new TaskMemoryStore(kv).readTask('TMK')).toBeNull();
  });

  it('brak klienta zapisuje się jako brak, a nie jako napis „null"', async () => {
    const kv = new MemoryKv();
    const store = new TaskMemoryStore(kv);
    await store.writeTask('TMK', { operation: 'egzamin', client: null });

    expect(await store.readTask('TMK')).toEqual({ operation: 'egzamin', client: null });
  });

  it('trasa z niepełnymi polami = brak podpowiedzi (nie połowa trasy)', async () => {
    const kv = new MemoryKv();
    kv.data.set('uzaero.route.SP-ANK', JSON.stringify({ departureIcao: 'EPKK' }));

    expect(await new TaskMemoryStore(kv).readRoute('SP-ANK')).toBeNull();
  });
});
