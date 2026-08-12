/**
 * UZ Aero — 07 ZMIANA ZAŁOGI.
 *
 * Odwzorowanie mockupu `design/07-zmiana-zalogi.html`: aktualna załoga → sekcja A
 * (zmiana Duala) → sekcja B (przekazanie samolotu) → baner „dlaczego dwie sekcje".
 *
 * Podział na A i B jest ARCHITEKTURĄ, nie układem graficznym:
 *
 *  • A — zmiana Duala to zdarzenie `crew_change` w TEJ SAMEJ sesji. Dzień trwa dalej,
 *    ten telefon pisze dalej. Zapis lokalny, offline OK.
 *  • B — zmiana PIC to przejęcie PRAWA ZAPISU przez inne urządzenie (§4.4 single-writer).
 *    Nie da się jej wykonać za kogoś: ten ekran może jedynie poprowadzić do zamknięcia
 *    dnia (09), gdzie powstają odczyty końcowe — przekazanie dla następnego pilota
 *    i domknięcie łańcucha MH (§4.5). Skrót „zmień PIC tutaj" gubiłby te odczyty.
 *
 * Domena pilnuje tego podziału twardą regułą (`PIC_CHANGE_NOT_ALLOWED`) — sekcja B nie
 * jest więc umowną konwencją UI, tylko jedyną legalną drogą.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Caption,
  Card,
  CardPicker,
  CrewRow,
  FreshnessNote,
  Screen,
  ScreenHeader,
  SkeletonRows,
  StepList,
  SyncChip,
  Tag,
  type PickerOption,
} from '../components';
import { useTheme } from '../theme';
import { useSkeleton } from '../hooks/useSkeleton';
import { useCurrentPilot, useEduBanner, useSessionStore } from '../store';
import { duration, timeUtc } from '../format';
import { NO_DUAL, crewRows, dualChangeBlocker } from './logic/crewChange';
import type { ReferenceAircraft, ReferencePilot } from '../../domain';

export function CrewChangeScreen({
  navigation,
}: {
  navigation: { navigate: (s: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const projection = useSessionStore((s) => s.projection);
  const events = useSessionStore((s) => s.events);
  const queries = useSessionStore((s) => s.queries);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const lastError = useSessionStore((s) => s.lastError);
  const crewChange = useSessionStore((s) => s.crewChange);
  const pilotId = useCurrentPilot((s) => s.id);

  const [pilots, setPilots] = useState<ReferencePilot[]>([]);
  const [aircraft, setAircraft] = useState<ReferenceAircraft | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [whyDismissed, setWhyDismissed] = useEduBanner('crew-two-sections');
  /**
   * Czy lista pilotów została przeczytana (issue #33). Bez tego przez chwilę stała tu
   * lista z jedną pozycją („Bez drugiego pilota"), a kandydaci dopisywali się nad nią
   * — czyli przycisk zapisu uciekał w dół dokładnie wtedy, gdy pilot po niego sięgał.
   */
  const [loaded, setLoaded] = useState(false);
  const skeleton = useSkeleton(!loaded);

  useEffect(() => {
    if (!queries) return;
    let alive = true;
    void queries.pilots().then((list) => {
      if (!alive) return;
      setPilots(list);
      setLoaded(true);
    });
    if (projection.aircraftId != null) {
      void queries.aircraftById(projection.aircraftId).then((found) => {
        if (alive) setAircraft(found);
      });
    }
    return () => {
      alive = false;
    };
  }, [queries, projection.aircraftId]);

  const now = Date.now();
  const rows = useMemo(() => crewRows(projection, events, now), [projection, events, now]);
  const currentDual = pilots.find((p) => p.id === projection.dualId) ?? null;

  /**
   * Kandydaci na Duala: aktywni piloci poza PIC i poza obecnym Dualem, plus pozycja
   * „Bez drugiego pilota" — rezygnacja jest pełnoprawnym wyborem (mockup ma ją na
   * liście), chyba że samolot wymaga załogi 2-osobowej: wtedy blokada z powodem.
   */
  const options: PickerOption<string>[] = useMemo(() => {
    const list: PickerOption<string>[] = pilots
      .filter((p) => p.active && p.id !== pilotId && p.id !== projection.dualId)
      // Kod pilota siedzi w kafelku po lewej (issue #12) — powtórzony po prawej byłby
      // tą samą wartością dwa razy w jednym wierszu.
      .map((p) => ({ value: p.id, label: p.name, avatarCode: p.code }));

    list.push({
      value: NO_DUAL,
      label: 'Bez drugiego pilota',
      detail: '—',
      disabledReason:
        aircraft?.dualRequired === true
          ? `${aircraft.type} wymaga załogi 2-osobowej`
          : undefined,
    });
    return list;
  }, [pilots, pilotId, projection.dualId, aircraft]);

  const blocker = dualChangeBlocker(
    selected,
    projection.dualId,
    aircraft?.dualRequired ?? false,
    aircraft?.type ?? 'Ten samolot',
  );

  const save = useCallback(async () => {
    if (selected == null || blocker != null) return;
    setBusy(true);
    try {
      await crewChange({
        role: 'dual',
        pilotOutId: projection.dualId,
        pilotInId: selected === NO_DUAL ? null : selected,
      });
      navigation.goBack();
    } catch {
      // Twarde odrzucenie inwariantu jest w `lastError` — baner niżej.
    } finally {
      setBusy(false);
    }
  }, [blocker, crewChange, navigation, projection.dualId, selected]);

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="ZMIANA ZAŁOGI"
          size="md"
          onBack={navigation.goBack}
          backLabel="Kokpit"
          right={
            <>
              <AppText variant="mono" tone="muted" style={styles.headerTime}>
                {`${timeUtc(now)} UTC`}
              </AppText>
              <SyncChip
                status={synced ? 'synced' : 'offline'}
                outboxCount={outboxCount}
                lastSyncAt={lastSyncAt}
              />
            </>
          }
        />
      }
    >
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        {/* ── aktualna załoga ──────────────────────────────────────────── */}
        <Card title="Aktualna załoga" header="inline">
          {rows.map((row) => (
            <CrewRow
              key={row.role}
              role={row.role}
              pilotId={row.pilotId}
              you={row.pilotId === pilotId}
              metaTop={row.since != null ? `od ${timeUtc(row.since)}` : undefined}
              metaBottom={row.since != null ? `block: ${duration(row.blockMs)}` : undefined}
            />
          ))}
        </Card>

        {/* ── A: zmiana Duala — zdarzenie w tej samej sesji ────────────── */}
        <Card
          title="A · Zmiana drugiego pilota (Dual)"
          header="inline"
          headerRight={<Tag label="zapis lokalny · offline OK" tone="green" />}
        >
          <View style={{ gap: 5 }}>
            {/* `.field-label` — mikro-etykieta z tokenu (dryf światła 2 → 1.5 celowy). */}
            <AppText variant="micro" tone="muted">
              Wychodzący DUAL
            </AppText>
            {/* Odczyt, nie kontrolka — kto wychodzi, wynika ze stanu sesji. */}
            <View style={styles.readonly}>
              <AppText variant="mono" tone="secondary">
                {currentDual != null
                  ? `${currentDual.code} · ${currentDual.name}`
                  : 'brak drugiego pilota'}
              </AppText>
            </View>
          </View>

          <View style={{ gap: 7 }}>
            <AppText variant="micro" tone="muted">
              Nowy DUAL
            </AppText>
            {!loaded ? (
              skeleton ? (
                <SkeletonRows rows={3} height={56} radius={theme.radius.md} gap={6} />
              ) : null
            ) : (
              <CardPicker options={options} value={selected} onChange={setSelected} />
            )}
            {/* Lista pilotów to dane z serwera — wiek musi być widoczny (§4.8). */}
            <FreshnessNote
              state={synced ? 'live' : 'cache'}
              syncedAt={pilots[0] != null ? timeUtc(pilots[0].fetchedAt) : null}
            />
          </View>

          <ActionButton
            label="ZAPISZ ZMIANĘ DUAL"
            tone="green"
            variant="solid"
            size="md"
            icon="crew"
            busy={busy}
            disabledReason={blocker}
            onPress={save}
          />
          <Caption text="Zdarzenie crew_change · zapis natychmiastowy, wysyłka automatyczna gdy wróci sieć" />
        </Card>

        {/* ── B: przekazanie samolotu — kończy sesję ───────────────────── */}
        <Card
          title="B · Przekazanie samolotu innemu PIC"
          header="inline"
          headerRight={<Tag label="kończy Twoją sesję" tone="amber" />}
        >
          <AppText variant="body" tone="secondary" style={styles.explain}>
            <AppText variant="body" tone="primary" style={styles.explain}>
              Nie wybierasz tu nowego dowódcy.
            </AppText>
            {' Dane sesji zapisuje wyłącznie telefon aktywnego PIC (zasada jednego piszącego '}
            {'urządzenia), więc nowy dowódca przejmuje samolot '}
            <AppText variant="body" tone="primary" style={styles.explain}>
              ze swojego telefonu.
            </AppText>
          </AppText>

          <StepList
            steps={[
              {
                parts: [
                  { text: 'Zamykasz dzień odczytami końcowymi', emphasis: true },
                  {
                    text: ' — paliwomierz i licznik MH. To one są przekazaniem dla kolegi; bez nich zaczyna „od zera".',
                  },
                ],
              },
              {
                parts: [
                  { text: 'Nowy PIC na swoim telefonie: ' },
                  { text: 'Preflight → karta samolotu → Przejmij', emphasis: true },
                  { text: ' i porównuje z tym, co widzi na licznikach.' },
                ],
              },
              {
                parts: [
                  {
                    text: 'Twój dzień idzie do statystyk i wysyłki; ten telefon przestaje zapisywać dane tego samolotu.',
                  },
                ],
              },
            ]}
          />

          <ActionButton
            label="PRZEKAŻ — ZDAJ SAMOLOT"
            tone="red"
            variant="secondary"
            size="md"
            icon="end-day"
            onPress={() => navigation.navigate('ReleaseAircraft')}
          />
          <Caption text="Prowadzi do zdania samolotu (odczyty końcowe) · działa offline — dane dojdą po powrocie zasięgu" />
        </Card>

        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}

        {/* ── dlaczego dwie sekcje (baner pouczający, trwały per pilot) ── */}
        <Banner
          kind="edu"
          tone="blue"
          icon="info"
          title="Dlaczego dwie osobne sekcje?"
          text={
            'Zmiana Dual to zwykłe zdarzenie w Twojej sesji — zapisujesz je sam, także bez zasięgu. ' +
            'Zmiana PIC to przekazanie prawa zapisu innemu urządzeniu, więc nie da się jej wykonać ' +
            'za kogoś. Każdy pilot ma osobny licznik czasu blokowego. Przy samolotach z wymogiem ' +
            'załogi 2-osobowej (np. An-2) Dual nie może pozostać pusty.'
          }
          collapsedLabel="Dlaczego dwie sekcje?"
          dismissed={whyDismissed}
          onDismiss={setWhyDismissed}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerTime: { fontSize: 10, letterSpacing: 1 },
  readonly: { opacity: 0.45 },
  explain: { fontSize: 11.5, lineHeight: 18 },
});
