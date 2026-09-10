/**
 * Ninerdeck - KLUB jako kontekst pracy telefonu (wielofirmowość §7, issue #102 epik F).
 *
 * Telefon pracuje w JEDNYM aktywnym klubie, ale rejestr pilota należy do NIEGO, nie do
 * klubu - stąd asymetria, którą te testy przybijają:
 *
 *  • **flota i piloci są per klub** - przełączenie nie kasuje cache'u drugiego klubu,
 *    więc powrót do niego działa offline (§7.1);
 *  • **znak maszyny czyta się MIĘDZY klubami** - „Mój dzień" i historia pokazują operacje
 *    wszystkich klubów (§7.2), więc kafelek z drugiego klubu musi mieć czym się podpisać;
 *  • **kolejka wysyłki jest per klub** - zapis do operacji z klubu A wysyła się TOKENEM
 *    KLUBU A. Wysłany tokenem klubu B wróciłby jako wstrzymany przez serwer (epik C waży
 *    członkostwo per zdarzenie), czyli przepadłby na zawsze;
 *  • **klub operacji stawia jej PIERWSZE zdarzenie** i nikt go potem nie zmienia - inaczej
 *    korekta zrobiona po przełączeniu przepisywałaby cudzą operację do bieżącego klubu.
 *
 * Wszystko na `InMemoryAdapter`, bez natywnego SQLite - kontrakt obu adapterów jest ten sam.
 */

import { EventsRepo } from '../application/eventsRepo';
import { InMemoryAdapter } from '../infrastructure/storage/inMemoryAdapter';
import { FixedClock } from '../infrastructure/clock';
import type { AppendEventInput, ReferenceAircraft } from '../domain';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const T0 = Date.UTC(2026, 5, 22, 8, 0, 0);

function makeRepo() {
  const adapter = new InMemoryAdapter();
  const clock = new FixedClock(T0);
  let n = 0;
  const repo = new EventsRepo(adapter, { clock, generateId: () => `id-${++n}` });
  return { adapter, repo, clock };
}

/** Najprostsze zdarzenie operacji - treść nie ma tu znaczenia, liczy się przynależność. */
const claim = (sessionUuid: string, aircraftId: string): AppendEventInput => ({
  type: 'session_claim',
  sessionUuid,
  aircraftId,
  picId: 'TMK',
  payload: { mode: 'free' },
});

const landing = (sessionUuid: string, aircraftId: string): AppendEventInput => ({
  type: 'landing',
  sessionUuid,
  aircraftId,
  picId: 'TMK',
  payload: { method: 'manual' },
});

const aircraft = (id: string, reg: string): Omit<ReferenceAircraft, 'fetchedAt'> => ({
  id,
  reg,
  type: 'C182',
  year: 2019,
  capacityL: 330,
  mhFormat: 'hhmm',
  dualRequired: false,
  serviceStatus: 'active',
  claimPicId: null,
  claimSince: null,
  handover: null,
  consumption: null,
});

describe('klub aktywny - rejestr', () => {
  it('operacja dostaje klub aktywny z chwili PIERWSZEGO zapisu', async () => {
    const { repo } = makeRepo();
    await repo.setActiveOrg(ORG_A);
    await repo.appendEvent(claim('sess-a', 'ac-1'));

    expect(await repo.getSessionOrg('sess-a')).toBe(ORG_A);
    expect(await repo.getSessionOrgs()).toEqual({ 'sess-a': ORG_A });
  });

  it('korekta operacji z klubu A, dopisana w klubie B, ZOSTAJE zapisem klubu A', async () => {
    const { repo } = makeRepo();
    await repo.setActiveOrg(ORG_A);
    await repo.appendEvent(claim('sess-a', 'ac-1'));

    await repo.setActiveOrg(ORG_B);
    await repo.appendEvent(landing('sess-a', 'ac-1'));

    // Gdyby klub szedł z chwili zapisu, dopisek przeniósłby operację do klubu B - a jej
    // zdarzenia pojechałyby tokenem, którego serwer dla tej operacji nie przyjmie.
    expect(await repo.getSessionOrg('sess-a')).toBe(ORG_A);
  });

  it('kolejka wysyłki niesie WYŁĄCZNIE zapisy klubu aktywnego, licznik - wszystkie', async () => {
    const { repo } = makeRepo();
    await repo.setActiveOrg(ORG_A);
    await repo.appendEvent(claim('sess-a', 'ac-1'));
    await repo.setActiveOrg(ORG_B);
    await repo.appendEvent(claim('sess-b', 'ac-2'));
    // Korekta operacji z klubu A - legalna, bo historia pokazuje wszystkie kluby.
    await repo.appendEvent(landing('sess-a', 'ac-1'));

    const outbox = await repo.getOutbox();
    expect(outbox.map((e) => e.sessionUuid)).toEqual(['sess-b']);

    // SyncChip i blokada wylogowania pytają o CAŁY rejestr: „czego serwer jeszcze nie ma".
    expect(await repo.getOutboxCount()).toBe(3);
    // Blokada przełączenia klubu pyta o klub, z którego pilot wychodzi.
    expect(await repo.pendingInActiveOrg()).toBe(1);

    // Powrót do klubu A odblokowuje jego zaległości - i to jest cała droga wyjścia dla
    // korekty zrobionej po przełączeniu.
    await repo.setActiveOrg(ORG_A);
    expect((await repo.getOutbox()).map((e) => e.sessionUuid)).toEqual(['sess-a', 'sess-a']);
  });

  it('zapisy sprzed 2.0.0 (bez klubu) idą kolejką każdego klubu i przygarnia je pierwszy', async () => {
    const { repo } = makeRepo();
    // Telefon po aktualizacji z 1.x: klubu jeszcze nie zna (§11).
    await repo.appendEvent(claim('sess-old', 'ac-1'));
    expect(await repo.getSessionOrg('sess-old')).toBeNull();
    // Dopóki klubu nie ma, kolejka jest kolejką wszystkiego - nie ma czego zawężać.
    expect((await repo.getOutbox()).map((e) => e.sessionUuid)).toEqual(['sess-old']);

    expect(await repo.setActiveOrg(ORG_A)).toBe(1); // przygarnięta jedna operacja
    expect(await repo.getSessionOrg('sess-old')).toBe(ORG_A);
    // Drugie wywołanie nie ma już czego przygarniać - a operacji cudzego klubu nie tknie.
    expect(await repo.setActiveOrg(ORG_B)).toBe(0);
    expect(await repo.getSessionOrg('sess-old')).toBe(ORG_A);
  });

  it('klub aktywny przeżywa restart aplikacji (czytany z session_meta przy init)', async () => {
    const { adapter, repo } = makeRepo();
    await repo.setActiveOrg(ORG_A);

    const clock = new FixedClock(T0);
    const restarted = new EventsRepo(adapter, { clock, generateId: () => 'id' });
    expect(restarted.activeOrg).toBeNull(); // przed `init()` nic nie wiadomo
    await restarted.init();
    expect(restarted.activeOrg).toBe(ORG_A);
  });
});

describe('klub aktywny - cache referencyjny', () => {
  it('flota jest per klub, a przełączenie NIE kasuje cache drugiego klubu', async () => {
    const { repo } = makeRepo();
    await repo.setActiveOrg(ORG_A);
    await repo.upsertReference(ORG_A, { aircraft: [aircraft('ac-1', 'SP-AXA')] });
    await repo.setActiveOrg(ORG_B);
    await repo.upsertReference(ORG_B, { aircraft: [aircraft('ac-2', 'SP-BBB')] });

    expect((await repo.getAircraft()).map((a) => a.reg)).toEqual(['SP-BBB']);
    await repo.setActiveOrg(ORG_A);
    // Powrót działa OFFLINE, bo wiersze klubu A nigdy nie zniknęły (§7.1).
    expect((await repo.getAircraft()).map((a) => a.reg)).toEqual(['SP-AXA']);
  });

  it('znak maszyny czyta się po identyfikatorze TAKŻE z drugiego klubu (historia, §7.2)', async () => {
    const { repo } = makeRepo();
    await repo.setActiveOrg(ORG_B);
    await repo.upsertReference(ORG_B, { aircraft: [aircraft('ac-2', 'SP-BBB')] });
    await repo.setActiveOrg(ORG_A);

    expect((await repo.getAircraft()).map((a) => a.reg)).toEqual([]);
    // Kafelek operacji z klubu B musi mieć czym się podpisać, choć aktywny jest klub A.
    expect((await repo.getAircraftById('ac-2'))?.reg).toBe('SP-BBB');
  });

  it('ten sam człowiek ma w każdym klubie własny wiersz - bo własny kod pilota (§3.2)', async () => {
    const { repo } = makeRepo();
    await repo.setActiveOrg(ORG_A);
    await repo.upsertPilots([{ id: 'PWI', code: 'PWI', name: 'Piotr Wiśniewski', active: true }], ORG_A);
    await repo.upsertPilots([{ id: 'PWI', code: 'PWB', name: 'Piotr Wiśniewski', active: true }], ORG_B);

    expect((await repo.getPilots()).map((p) => p.code)).toEqual(['PWI']);
    await repo.setActiveOrg(ORG_B);
    expect((await repo.getPilots()).map((p) => p.code)).toEqual(['PWB']);
  });

  it('bez klubu flota jest PUSTA - a nie flotą ostatnio widzianą', async () => {
    const { repo } = makeRepo();
    await repo.upsertReference(ORG_A, { aircraft: [aircraft('ac-1', 'SP-AXA')] });

    // Telefon po aktualizacji z 1.x: wiersze są, klub jeszcze nieznany. Ekran 02 pokazuje
    // wtedy stan „brak samolotów" (02G) i pyta serwer przy każdym pulsie (issue #55).
    expect(await repo.getAircraft()).toEqual([]);
    expect(await repo.getPilots()).toEqual([]);
  });
});
