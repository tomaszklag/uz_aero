/**
 * UZ Aero — 04B KOKPIT · PODGLĄD READ-ONLY
 *
 * Odwzorowanie mockupu `design/04b-cockpit-readonly.html`, sekcja po sekcji:
 * [AppBar: samolot · trasa · SyncChip] → [baner „PODGLĄD — TYLKO ODCZYT" ze stopką
 * o pochodzeniu danych] → [chip stanu wg serwera] → [duty prowadzącego] → [log jego dnia]
 * → [PRZEJMIJ SAMOLOT + podpis] → [siatka akcji, cała zablokowana, z powodem pod spodem].
 *
 * Po co ten ekran istnieje: na liście samolotów (02) maszyna prowadzona przez kogoś innego
 * NIE JEST pozycją do wyboru — cały jej wiersz („Prowadzi PIC: KRZ · od 07:10", ikona oka)
 * prowadzi tutaj. Przejęcie odbiera poprzednikowi prawo zapisu (§4.4, optymistyczny claim),
 * więc od issue #12 zapada wyłącznie na TYM ekranie: tu widać stan samolotu, log cudzego
 * dnia i wiek danych, na których pilot opiera decyzję. Arkusz potwierdzenia, który pytał
 * o to nad listą — czyli nad ekranem bez żadnej z tych przesłanek — zniknął razem ze
 * swoim ostrzeżeniem; ostrzeżenie stoi teraz nad przyciskiem niżej.
 *
 * Stąd twarda zasada tego ekranu: **zero akcji zapisu**. Nie ma START ENGINE, nie ma
 * ołówków korekty w logu (`EventLog` dostaje wiersze BEZ `onCorrect`), nie ma arkuszy.
 * „PRZEJMIJ SAMOLOT" też nie pisze do rejestru: wypełnia szkic preflightu (stan UI) i wraca
 * na krok 1 — `session_claim` powstaje dopiero przy potwierdzeniu na ekranie 3.
 *
 * Skąd dane: **wyłącznie z serwera** — to cudza sesja, więc w rozumieniu `CLAUDE.md`
 * cały ekran jest kategorią (b) i każda wartość niesie stan świeżości (§4.8). Migawkę
 * przyjmujemy parametrem trasy (`snapshot`), bo lokalna baza zna tylko własny strumień
 * zdarzeń; brak migawki to pełnoprawny stan `brak`, nie awaria.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  ActionGrid,
  AppBar,
  AppText,
  Banner,
  Card,
  ClaimStrip,
  EventLog,
  Screen,
  StatusChip,
  SyncChip,
  type ActionCardSpec,
} from '../components';
// `PeekBanner` i `Caption` są nowe w Design Systemie — do `components/index.ts` dopisuje
// je właściciel barrela (patrz raport), więc na razie importujemy je wprost z plików.
import { Caption } from '../components/status/Caption';
import { PeekBanner } from '../components/status/PeekBanner';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { usePreflightDraft } from '../store/preflightDraft';
import { litres } from '../format';
import { buildLogRows } from './logic/cockpitLog';
import {
  peekBanner,
  peekFreshness,
  peekLogTitle,
  peekStatusChip,
  takeoverHint,
  takeoverWarning,
  type PeekSnapshot,
} from './logic/cockpitPeek';
import { buildPeekStrip } from './logic/claimStrip';
import { operationTag, routeLabel } from './logic/operations';
import { projectSession, type ReferenceAircraft, type ReferencePilot } from '../../domain';

export type { PeekSnapshot };

export interface CockpitReadonlyParams {
  /** Samolot, którego podglądamy — klucz do cache referencyjnego (`reference_aircraft`). */
  aircraftId: string;
  /**
   * Migawka cudzej sesji pobrana z serwera. `null`/brak = stan `brak` z §4.8: ekran
   * pokazuje, kto prowadzi samolot, i uczciwie mówi, że przebiegu dnia nie znamy.
   */
  snapshot?: PeekSnapshot | null;
}

export function CockpitReadonlyScreen({
  navigation,
  route,
}: {
  navigation: { navigate: (screen: string) => void };
  route?: { params?: CockpitReadonlyParams };
}) {
  const { theme } = useTheme();

  const queries = useSessionStore((s) => s.queries);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  /** Przejęcie wypełnia szkic preflightu — patrz nota przy przycisku niżej. */
  const takeAircraft = usePreflightDraft((s) => s.setAircraft);

  const aircraftId = route?.params?.aircraftId ?? null;
  const snapshot = route?.params?.snapshot ?? null;

  const [aircraft, setAircraft] = useState<ReferenceAircraft | null>(null);
  const [pilots, setPilots] = useState<ReferencePilot[]>([]);

  // Podgląd nie odświeża się w tle — czas odniesienia bierzemy z chwili wejścia, a dla
  // migawki z cache i tak z chwili jej pobrania (niżej). Odliczanie na żywo cudzego
  // duty time sugerowałoby, że patrzymy na coś bieżącego.
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    if (queries == null || aircraftId == null) return;
    let alive = true;
    void Promise.all([queries.aircraftById(aircraftId), queries.pilots()]).then(([a, p]) => {
      if (!alive) return;
      setAircraft(a);
      setPilots(p);
    });
    return () => {
      alive = false;
    };
  }, [queries, aircraftId]);

  // Projekcja liczy się z cudzych zdarzeń tą samą czystą funkcją domeny, co własne (§5.2) —
  // dzięki temu podgląd pokazuje dokładnie to, co widzi prowadzący, a nie drugą rachubę.
  const projection = useMemo(
    () => (snapshot != null ? projectSession(snapshot.events) : null),
    [snapshot],
  );

  const mhFormat = projection?.mhFormat ?? aircraft?.mhFormat ?? 'decimal';

  const logRows = useMemo(() => {
    if (snapshot == null || projection == null) return [];
    // Outbox opisuje TEN telefon. Cudze zdarzenia przyszły z serwera, więc znacznik
    // „czeka na wysyłkę" byłby tu informacją o cudzej kolejce, której nie znamy.
    // Oś jest PŁASKA (model 2026-08-10): cudza sesja też ma najwyżej jeden bieg,
    // więc harmonijka cykli nie ma czego zwijać.
    return buildLogRows(snapshot.events, projection, mhFormat).map((row) => ({
      ...row,
      pending: false,
    }));
  }, [snapshot, projection, mhFormat]);

  if (aircraftId == null) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.md }}>
          <AppText variant="display" style={{ textAlign: 'center' }}>
            BRAK SAMOLOTU
          </AppText>
          <AppText variant="body" tone="muted" style={{ textAlign: 'center' }}>
            Podgląd otwiera się z listy samolotów — z pozycji prowadzonej przez innego pilota.
          </AppText>
          <ActionButton
            label="LISTA SAMOLOTÓW"
            variant="secondary"
            onPress={() => navigation.navigate('PreflightAircraft')}
          />
        </View>
      </Screen>
    );
  }

  const picCode =
    pilots.find((p) => p.id === aircraft?.claimPicId)?.code ?? aircraft?.claimPicId ?? null;
  const freshness = peekFreshness(snapshot, synced, openedAt);
  const banner = peekBanner({
    freshness,
    picCode,
    claimSince: aircraft?.claimSince ?? null,
    fetchedAt: snapshot?.fetchedAt ?? null,
    lastActivityAt: projection?.lastEventAt ?? null,
    now: openedAt,
  });
  const status = peekStatusChip(projection);

  const peekStrip =
    projection != null ? buildPeekStrip(projection, picCode ?? 'prowadzący') : null;

  const capacityL = aircraft?.capacityL ?? null;
  const fobL = projection?.fuel.lastReadingL ?? null;
  const fuelSub =
    fobL == null
      ? 'Stan paliwa nieznany'
      : capacityL != null
        ? `Stan: ${Math.round(fobL)} / ${capacityL} L`
        : `Stan: ${litres(fobL)}`;

  /**
   * Siatka akcji naziemnych z mockupu — pokazana, ale w całości zablokowana.
   *
   * Ukrycie kafelków byłoby gorsze: pilot nie dowiedziałby się, czym ten samolot dziś
   * żyje (ile ma paliwa, kto siedzi w załodze). Każdy powód blokady niesie więc stan,
   * a wspólne wyjaśnienie „dlaczego wszystkie naraz" stoi pod siatką (`.actions-reason`).
   */
  const readonlyActions: ActionCardSpec[] = [
    {
      id: 'refuel',
      icon: 'refuel',
      label: 'Tankowanie',
      tone: 'amber',
      disabledReason: `${fuelSub} · tylko odczyt`,
      onPress: () => undefined,
    },
    {
      id: 'crew',
      icon: 'crew',
      label: 'Zmiana załogi',
      disabledReason: `PIC: ${picCode ?? '—'} · DUAL: ${projection?.dualId ?? '—'} · tylko odczyt`,
      onPress: () => undefined,
    },
    {
      id: 'manual',
      icon: 'manual-log',
      label: 'Lista ręczna',
      disabledReason: 'Fallback GPS · tylko odczyt',
      onPress: () => undefined,
    },
    {
      id: 'end-day',
      icon: 'end-day',
      label: 'Zakończ dzień',
      tone: 'red',
      disabledReason: 'Statystyki + synchronizacja · tylko odczyt',
      onPress: () => undefined,
    },
  ];

  const subtitle = [
    routeLabel(
      projection?.operation ?? null,
      projection?.departureIcao ?? null,
      projection?.arrivalIcao ?? null,
    ),
    projection?.operation == null ? null : operationTag(projection.operation),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen
      scroll
      padded={false}
      header={
        <AppBar
          aircraft={aircraft?.reg ?? aircraftId}
          subtitle={subtitle.length > 0 ? subtitle : null}
          // SyncChip zostaje jedynym wskaźnikiem sieci (`CLAUDE.md`); o wieku danych
          // mówi stopka banera niżej — to druga, niezależna oś.
          right={
            <SyncChip
              status={synced ? 'synced' : 'offline'}
              outboxCount={outboxCount}
              lastSyncAt={lastSyncAt}
            />
          }
        />
      }
    >
      <View style={{ padding: theme.spacing.lg, gap: 14 }}>
        {/* ── baner podglądu (`.ro-banner`) ──────────────────────────────────── */}
        <PeekBanner
          title="PODGLĄD — TYLKO ODCZYT"
          icon="peek"
          tone={banner.tone}
          text={banner.text}
          warning={banner.warning}
          meta={banner.meta}
          metaTone={banner.metaTone}
        />

        {/* ── stan samolotu wg serwera (`.ground-chip`) ──────────────────────── */}
        <StatusChip label={status.label} tone={status.tone} style={{ alignSelf: 'center' }} />

        {/* ── pasek sesji cudzego samolotu (`.claim-strip`) ───────────────────
            Stało tu „Duty KRZ 02:31". Czas pracy innego pilota nie jest informacją
            o SAMOLOCIE i nie wnosi nic do decyzji o przejęciu (§3.6a) — liczy się,
            od kiedy maszyna jest zajęta i ile już zrobiła. */}
        {peekStrip != null && (
          <ClaimStrip
            label={peekStrip.label}
            flights={peekStrip.flights}
            trailing={peekStrip.trailing}
          />
        )}

        {/* ── log jego dnia (`.day-log`) — BEZ kolumny korekty; cykle domyślnie
            zwinięte: podgląd to rzut oka na cudzy dzień, nie praca na nim ───── */}
        <Card title={peekLogTitle(aircraft?.reg ?? aircraftId, picCode, projection)} flush>
          <EventLog
            rows={logRows}
            emptyText={
              snapshot == null
                ? 'Nie mamy migawki tej sesji — log pojawi się po połączeniu z serwerem.'
                : 'Serwer nie zna jeszcze żadnego zdarzenia z tej sesji.'
            }
          />
        </Card>

        {/* ── przejęcie (`.takeover-warn` + `.takeover-btn` + `.takeover-hint`) ──
            Ostrzeżenie stoi NAD przyciskiem, nie w arkuszu po tapnięciu: pilot ma je
            przeczytać, zanim naciśnie, a nie zdejmować kolejną warstwę potwierdzeń. */}
        <Banner
          kind="warning"
          icon="takeover"
          title="Zanim przejmiesz"
          text={takeoverWarning(freshness, picCode)}
        />
        <ActionButton
          label="PRZEJMIJ SAMOLOT"
          tone="amber"
          variant="secondary"
          size="lg"
          icon="takeover"
          // Przejęcie = wypełnienie SZKICU preflightu (stan UI) i powrót na krok 1.
          // Do rejestru nic tu nie trafia — `session_claim` powstaje przy potwierdzeniu
          // na ekranie 3, więc zasada „zero akcji zapisu" na tym ekranie stoi.
          disabledReason={aircraft == null ? 'Czekamy na dane samolotu z cache' : null}
          onPress={() => {
            if (aircraft == null) return;
            takeAircraft(aircraft);
            navigation.navigate('PreflightAircraft');
          }}
        />
        <Caption text={takeoverHint(aircraft?.reg ?? null)} style={{ marginTop: -6 }} />

        {/* ── akcje naziemne: widoczne, ale zablokowane (`.action-grid`) ─────── */}
        <ActionGrid actions={readonlyActions} />
        <Caption
          text="Akcje niedostępne w podglądzie — zapisywać może tylko pilot, który prowadzi samolot"
          style={{ marginTop: -6 }}
        />
      </View>
    </Screen>
  );
}
