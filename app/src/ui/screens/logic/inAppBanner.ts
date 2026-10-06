/**
 * Ninerdeck - BANER W APLIKACJI (4.0.0, `docs/kanal-klubu.md` K5, §3.3; makieta 25E;
 * epik KK-C #246).
 *
 * Przy otwartej aplikacji powiadomienie nie dzwoni systemem - staje własny baner u góry
 * ekranu, znika sam po kilku sekundach i nie gra. Dwa źródła, jeden wygląd:
 *  - RAMKA `notification` kanału (klub aktywny, łącze stoi): baner mówi ZDANIEM WIERSZA
 *    SKRZYNKI - tą samą funkcją (`inboxRows`), więc słowo w słowo - bez plakietki sprawy
 *    i z „teraz" zamiast wieku. Baner tylko zapowiada wiersz, który stoi w skrzynce;
 *  - PUSH odebrany na wierzchu: wiadomość z INNEGO KLUBU (łącze należy do klubu aktywnego
 *    i danych innego nie niesie, K4) albo chwila bez łącza. Push niesie tytuł
 *    i identyfikatory, nie treść skrzynki - więc baner mówi TYTUŁEM PUSHA, ze znakiem
 *    maszyny z pamięci floty, gdy tytuł go nie niesie. Wiadomość z innego klubu dostaje
 *    nazwę klubu nad tytułem i zdanie o przełączeniu: rzeczy z tamtego klubu telefon
 *    tokenem tego nie otworzy (odpowiedziałaby 404), a przełączenie klubu jest decyzją
 *    pilota i wymaga sieci (13A). Godzin push nie niesie, więc podpisu z terminem nie ma.
 *
 * Kiedy baner NIE staje:
 *  - w kokpicie - dopóki pilot trzyma samolot, łącza nie ma, a push przychodzi po cichu
 *    na listę systemową i do skrzynki (K6, pkt 44 zleceń);
 *  - przy aplikacji w tle - wtedy dzwoni system, z kanału Androida;
 *  - na ekranie RZECZY, której dotyczy - karta tej rezerwacji, decyzja o niej, karta tej
 *    maszyny, otwarta skrzynka: ten ekran po prostu się odświeża (pkt 43 zleceń), a baner
 *    o rzeczy, na którą pilot patrzy, byłby powtórzeniem. Ten sam rachunek gasi baner,
 *    który już stoi, gdy pilot wejdzie na ekran jego rzeczy (`bannerFits`);
 *  - wiadomość z innego klubu nie ma „ekranu, którego dotyczy" - jej rzeczy na tym
 *    telefonie nie widać, a dzwonek liczy tylko klub aktywny. Staje więc zawsze, także
 *    nad otwartą skrzynką;
 *  - wiadomość CICHA (ramka i push z flagą `quiet`) nie stawia banera nigdy: adresat
 *    siedzi w załodze operacji w toku (cisza w kokpicie, decyzje 2026-10-06). Telefon
 *    dowódcy wie to sam (kokpit), ale telefon drugiego pilota nie - jego łącze stoi,
 *    więc o ciszy mówi serwer.
 *
 * Cel tapnięcia liczy `pushTarget` - JEDNA mapa rodzaj → ekran dla banera i pusha.
 */

import type { RemoteNotification } from '../../../application';
import type { ScreenRoute } from '../../navigation/activeRoute';

import { inboxRows, type InboxRowVm, type InboxTone } from './inbox';
import { pushTarget, type PushTarget } from './pushTarget';

/** Ile baner stoi, zanim zniknie sam. */
export const BANNER_MS = 5_000;

/** Wiek wiadomości na banerze - zawsze świeża, więc bez rachunku. */
export const NOW_LABEL = 'teraz';

/** Zdanie banera z innego klubu - to samo, które skrzynka mówi przy instrukcji przełączenia. */
export const FOREIGN_CLUB_HINT = 'Przełącz klub w Ustawieniach, żeby je otworzyć.';

/** Tytuł pusha bez tytułu (serwer zawsze go wysyła - to tylko zabezpieczenie). */
const FALLBACK_TITLE = 'Wiadomość z klubu';

export type BannerSource =
  /** Ramka `notification` kanału - pozycja skrzynki w kształcie REST i flaga ciszy. */
  | { kind: 'frame'; item: RemoteNotification; quiet: boolean }
  /** Push odebrany przy otwartej aplikacji - tytuł, treść i identyfikatory z serwera. */
  | {
      kind: 'push';
      id: string;
      title: string | null;
      body: string | null;
      data: Readonly<Record<string, unknown>>;
    };

export interface BannerContext {
  /** Klub aktywny telefonu; `null` = nie wiadomo (wtedy nie odróżniamy innego klubu). */
  activeOrgId: string | null;
  /** Aplikacja na wierzchu. */
  foreground: boolean;
  /** Pilot trzyma samolot - kokpit. */
  holdsAircraft: boolean;
  /** Ekran na czubku stosu. */
  route: ScreenRoute | null;
  now: number;
  regOf: (aircraftId: string) => string | null;
  nameOf: (pilotId: string) => string | null;
  mhFormatOf?: (aircraftId: string) => 'hhmm' | 'decimal' | null;
  /** Nazwa klubu z członkostw osoby; `null` = klub nieznany telefonowi. */
  clubNameOf: (orgId: string) => string | null;
}

export interface BannerVm {
  /** Klucz banera - nowy zastępuje poprzedni i liczy czas od nowa. */
  id: string;
  /** Nazwa klubu nad tytułem - wyłącznie przy wiadomości z innego klubu. */
  club: string | null;
  row: InboxRowVm;
  target: PushTarget;
}

const NO_TODO: ReadonlySet<string> = new Set();

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** Baner albo `null`, gdy nie ma prawa stanąć. */
export function inAppBanner(source: BannerSource, ctx: BannerContext): BannerVm | null {
  if (!ctx.foreground || quietSource(source)) return null;
  const banner = source.kind === 'frame' ? frameBanner(source.item, ctx) : pushBanner(source, ctx);
  return banner != null && bannerFits(banner, ctx.route, ctx.holdsAircraft) ? banner : null;
}

/**
 * Czy baner, który JUŻ stoi, ma prawo stać dalej: wejście na ekran jego rzeczy albo do
 * kokpitu gasi go na dobre - wrócić nie ma po co, bo ekran rzeczy pokazał to samo.
 */
export function bannerFits(banner: BannerVm, route: ScreenRoute | null, holdsAircraft: boolean): boolean {
  if (holdsAircraft) return false;
  const thing = targetThing(banner.target);
  if (thing == null || route == null) return true;
  // Każda wiadomość klubu aktywnego stoi w skrzynce - otwarta skrzynka pokazuje ją sama.
  if (route.name === 'Notifications') return false;
  return thing !== routeThing(route);
}

function frameBanner(item: RemoteNotification, ctx: BannerContext): BannerVm | null {
  const row = inboxRows({
    items: [item],
    todoIds: NO_TODO,
    now: ctx.now,
    regOf: ctx.regOf,
    nameOf: ctx.nameOf,
    mhFormatOf: ctx.mhFormatOf,
  })[0];
  if (row == null) return null;
  return {
    id: item.id,
    club: null,
    // Plakietki sprawy baner nie ma (stoi w skrzynce), a wiadomość jest świeża z definicji.
    row: { ...row, todo: false, isNew: true, when: NOW_LABEL },
    // Ramka przychodzi wyłącznie dla klubu aktywnego, więc o klub nie pytamy.
    target: pushTarget({ ...item.payload, kind: item.kind }, null),
  };
}

function pushBanner(source: Extract<BannerSource, { kind: 'push' }>, ctx: BannerContext): BannerVm {
  const { data } = source;
  const orgId = str(data.orgId);
  const foreign = orgId != null && ctx.activeOrgId != null && orgId !== ctx.activeOrgId;
  const aircraftId = str(data.aircraftId);
  const reg = aircraftId == null ? null : ctx.regOf(aircraftId);
  const base = source.title ?? FALLBACK_TITLE;

  return {
    id: source.id,
    club: foreign && orgId != null ? ctx.clubNameOf(orgId) : null,
    row: {
      id: source.id,
      tone: toneOf(str(data.kind) ?? '', data, ctx),
      // Znak maszyny dopisuje telefon z pamięci floty - tytuły o maszynie niosą go same.
      title: reg != null && !base.includes(reg) ? `${base} · ${reg}` : base,
      sub: null,
      reason: foreign ? FOREIGN_CLUB_HINT : source.body,
      lead: null,
      late: null,
      when: NOW_LABEL,
      isNew: true,
      todo: false,
      bookingId: null,
      aircraftId: null,
      opens: null,
    },
    target: pushTarget(data, ctx.activeOrgId),
  };
}

/**
 * Ton ikony pusha - TEN SAM, co wiersz skrzynki tego rodzaju: wiersz składa się z rodzaju
 * i identyfikatorów pusha, a ton bierze się z niego. Druga mapa rodzaj → ton rozjechałaby
 * się z pierwszą przy pierwszym nowym rodzaju wiadomości.
 */
function toneOf(kind: string, data: Readonly<Record<string, unknown>>, ctx: BannerContext): InboxTone {
  const probe: RemoteNotification = {
    id: 'push',
    kind,
    payload: { ...data },
    createdAt: new Date(ctx.now).toISOString(),
    readAt: null,
    day: null,
  };
  return inboxRows({ items: [probe], todoIds: NO_TODO, now: ctx.now, regOf: ctx.regOf, nameOf: ctx.nameOf })[0]?.tone ?? 'info';
}

/** Cisza w kokpicie: wyłącznie flaga równa `true` - cisza jest wyjątkiem, nie domysłem. */
function quietSource(source: BannerSource): boolean {
  return source.kind === 'frame' ? source.quiet : source.data.quiet === true;
}

/** Rzecz, którą otwiera tapnięcie - `null` = rzeczy z tego telefonu nie widać (inny klub). */
function targetThing(target: PushTarget): string | null {
  switch (target.screen) {
    case 'Decision':
    case 'BookingDetails':
      return `booking:${target.params.bookingId}`;
    case 'Aircraft':
      return `aircraft:${target.params.aircraftId}`;
    case 'Notifications':
      return target.params?.foreignClub === true ? null : 'inbox';
  }
}

/** Rzecz, którą pokazuje ekran na czubku stosu (skrzynkę rozstrzyga `bannerFits` wcześniej). */
function routeThing(route: ScreenRoute): string | null {
  const params = route.params ?? {};
  if ((route.name === 'Decision' || route.name === 'BookingDetails') && typeof params.bookingId === 'string') {
    return `booking:${params.bookingId}`;
  }
  if (route.name === 'Aircraft' && typeof params.aircraftId === 'string') return `aircraft:${params.aircraftId}`;
  return null;
}
