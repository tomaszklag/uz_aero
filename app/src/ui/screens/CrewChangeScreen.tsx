/**
 * UZ Aero - 07 ZMIANA ZAŁOGI.
 *
 * Odwzorowanie mockupu `design/07-zmiana-zalogi.html`: aktualna załoga (z przyciskiem
 * zmiany Duala - ARKUSZ) → przekazanie samolotu innemu PIC.
 *
 * PO PRZEGLĄDZIE 2026-09-02 ekran ma dwie karty zamiast trzech sekcji: zmiana Duala
 * przestała być osobną sekcją „A" - jest przyciskiem przy aktualnej załodze, który
 * otwiera arkusz z wyborem (nowy Dual albo rezygnacja). Litera „B", plakietki zasięgu
 * zapisu („zapis lokalny · offline OK", „kończy Twoją operację"), przypisy o mechanice
 * („zdarzenie crew_change · zapis natychmiastowy…") i baner „dlaczego dwie sekcje"
 * zniknęły - opisywały budowę aplikacji, nie decyzję pilota (kategoria z issue #43/#72).
 *
 * Architektura pod spodem BEZ ZMIAN:
 *  • zmiana Duala to zdarzenie `crew_change` w TEJ SAMEJ operacji - zapis lokalny;
 *  • zmiana PIC to przejęcie PRAWA ZAPISU przez inne urządzenie (§4.4 single-writer).
 *    Ten ekran może jedynie poprowadzić do zdania samolotu (09B), gdzie powstają
 *    odczyty końcowe - przekazanie dla następnego pilota i ogniwo łańcucha MH (§4.5).
 *    Domena pilnuje tego twardą regułą (`PIC_CHANGE_NOT_ALLOWED`).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  CardPicker,
  CrewRow,
  FreshnessNote,
  Screen,
  ScreenHeader,
  SkeletonRows,
  StepList,
  SyncChip,
  type PickerOption,
} from '../components';
import { Sheet } from '../components/sheets/Sheet';
import { useTheme } from '../theme';
import { useSkeleton } from '../hooks/useSkeleton';
import { useCurrentPilot, useSessionStore } from '../store';
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
  const lastError = useSessionStore((s) => s.lastError);
  const crewChange = useSessionStore((s) => s.crewChange);
  const pilotId = useCurrentPilot((s) => s.id);

  const [pilots, setPilots] = useState<ReferencePilot[]>([]);
  const [aircraft, setAircraft] = useState<ReferenceAircraft | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * Czy lista pilotów została przeczytana (issue #33). Bez tego przez chwilę stała tu
   * lista z jedną pozycją („Bez drugiego pilota"), a kandydaci dopisywali się nad nią
   * - czyli przycisk zapisu uciekał w dół dokładnie wtedy, gdy pilot po niego sięgał.
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

  /**
   * Sekundowy tick przy pracującym silniku (uwaga z urządzenia, 2026-09-02: „czy
   * aktualizuje się czas block?"). Rachunek `blockSince` liczył się dobrze - otwarty
   * cykl domyka „teraz" - ale „teraz" pochodziło z ostatniego renderu, więc licznik
   * na ekranie STAŁ. Ten sam wzorzec, co `useTicker(engineOn)` w kokpicie; przy
   * zgaszonym silniku block i tak nie rośnie, więc tick byłby pustym przebiegiem.
   */
  const engineOn = projection.engineRunning;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!engineOn) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [engineOn]);

  const rows = useMemo(() => crewRows(projection, events, now), [projection, events, now]);

  /**
   * Identyfikator → kod i nazwisko z cache floty (uwaga z urządzenia, 2026-09-02:
   * przy Dualu „wyświetla się guid zamiast nazwy użytkownika" - w produkcji piloci
   * mają identyfikatory UUID z panelu). Surowy id zostaje wyłącznie ostatnią deską
   * ratunku dla pilota spoza cache'u - wiersz nie może zostać pusty.
   */
  const codeOf = useCallback(
    (id: string | null): string | null =>
      id == null ? null : (pilots.find((p) => p.id === id)?.code ?? id),
    [pilots],
  );
  const currentDual = pilots.find((p) => p.id === projection.dualId) ?? null;

  /**
   * Kandydaci na Duala: aktywni piloci poza PIC i poza obecnym Dualem, plus pozycja
   * „Bez drugiego pilota" - rezygnacja jest pełnoprawnym wyborem (mockup ma ją na
   * liście), chyba że samolot wymaga załogi 2-osobowej: wtedy blokada z powodem
   * przy samej pozycji.
   */
  const options: PickerOption<string>[] = useMemo(() => {
    const list: PickerOption<string>[] = pilots
      .filter((p) => p.active && p.id !== pilotId && p.id !== projection.dualId)
      // Kod pilota siedzi w kafelku po lewej (issue #12) - powtórzony po prawej byłby
      // tą samą wartością dwa razy w jednym wierszu.
      .map((p) => ({ value: p.id, label: p.name, avatarCode: p.code }));

    list.push({
      value: NO_DUAL,
      label: 'Bez drugiego pilota',
      detail: '-',
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

  const openSheet = useCallback(() => {
    // Każde otwarcie zaczyna bez wyboru - arkusz nie pamięta porzuconej edycji
    // (ta sama reguła, co w arkuszach odczytów).
    setSelected(null);
    setSheetOpen(true);
  }, []);

  const save = useCallback(async () => {
    if (busy || selected == null || blocker != null) return;
    setBusy(true);
    try {
      await crewChange({
        role: 'dual',
        pilotOutId: projection.dualId,
        pilotInId: selected === NO_DUAL ? null : selected,
      });
      setSheetOpen(false);
      navigation.goBack();
    } catch {
      // Twarde odrzucenie inwariantu jest w `lastError` - baner na ekranie.
    } finally {
      setBusy(false);
    }
  }, [blocker, busy, crewChange, navigation, projection.dualId, selected]);

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
              <SyncChip />
            </>
          }
        />
      }
    >
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        {/* ── aktualna załoga + zmiana Duala jednym przyciskiem ─────────────
            (przegląd 2026-09-02: osobna sekcja „A" powtarzała stan załogi, który
            stoi wiersz wyżej - wybór mieszka odtąd w arkuszu pod przyciskiem). */}
        <Card title="Aktualna załoga" header="inline">
          {rows.map((row) => (
            <CrewRow
              key={row.role}
              role={row.role}
              pilotId={codeOf(row.pilotId)}
              you={row.pilotId === pilotId}
              metaTop={row.since != null ? `od ${timeUtc(row.since)}` : undefined}
              metaBottom={row.since != null ? `block: ${duration(row.blockMs)}` : undefined}
            />
          ))}

          <ActionButton
            label="ZMIEŃ DRUGIEGO PILOTA"
            tone="green"
            variant="secondary"
            size="md"
            icon="crew"
            onPress={openSheet}
          />
        </Card>

        {/* ── przekazanie samolotu innemu PIC ───────────────────────────────
            Bez litery „B" i plakietki (przegląd 2026-09-02): sekcja jest jedna,
            a nagłówek nazywa czynność - reszta to była typografia architektury. */}
        <Card title="Przekazanie samolotu innemu PIC" header="inline">
          <AppText variant="body" tone="secondary" style={styles.explain}>
            <AppText variant="body" tone="primary" style={styles.explain}>
              Nie wybierasz tu nowego dowódcy.
            </AppText>
            {' Dane operacji zapisuje wyłącznie telefon aktywnego PIC, więc nowy dowódca '}
            {'przejmuje samolot '}
            <AppText variant="body" tone="primary" style={styles.explain}>
              ze swojego telefonu.
            </AppText>
          </AppText>

          <StepList
            steps={[
              {
                parts: [
                  { text: 'Zdajesz samolot odczytami końcowymi', emphasis: true },
                  {
                    text: ' - paliwomierz i licznik MH. To one są przekazaniem dla następnego dowódcy.',
                  },
                ],
              },
              {
                parts: [
                  { text: 'Nowy dowódca na swoim telefonie ' },
                  { text: 'rozpoczyna lot i przejmuje ten samolot', emphasis: true },
                  { text: ' z listy maszyn - przekazane odczyty porównuje z licznikami.' },
                ],
              },
              {
                parts: [
                  {
                    text: 'Rozliczenie tego samolotu idzie do wysyłki, a ten telefon przestaje zapisywać jego dane. ',
                  },
                  { text: 'Twój dzień trwa dalej', emphasis: true },
                  { text: ' - kolejna maszyna dopisze się do listy operacji.' },
                ],
              },
            ]}
          />

          <ActionButton
            label="PRZEKAŻ - ZDAJ SAMOLOT"
            tone="red"
            variant="secondary"
            size="md"
            icon="end-day"
            onPress={() => navigation.navigate('ReleaseAircraft')}
          />
        </Card>

        {lastError != null && (
          <Banner kind="warning" tone="red" icon="warning" title="Nie zapisano" text={lastError} />
        )}
      </View>

      {/* ── arkusz zmiany Duala (przegląd 2026-09-02) ─────────────────────────
          Nowy Dual ALBO rezygnacja - jedna lista, jeden zapis. Pusty wybór blokuje
          bez zdania (widać z listy - wąski wyjątek issue #55); pozycję „Bez drugiego
          pilota" przy wymogu załogi 2-os. blokuje jej własny powód. */}
      <Sheet
        visible={sheetOpen}
        title="Zmiana drugiego pilota"
        confirmLabel="ZAPISZ ZMIANĘ"
        confirmDisabled={selected == null}
        confirmDisabledReason={selected != null ? blocker : null}
        onConfirm={() => void save()}
        onCancel={() => setSheetOpen(false)}
      >
        <View style={{ gap: 5 }}>
          <AppText variant="micro" tone="muted">
            Wychodzący DUAL
          </AppText>
          {/* Odczyt, nie kontrolka - kto wychodzi, wynika ze stanu operacji. */}
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
          {/* Lista pilotów to dane z serwera - wiek musi być widoczny (§4.8). */}
          <FreshnessNote
            state={synced ? 'live' : 'cache'}
            syncedAt={pilots[0] != null ? timeUtc(pilots[0].fetchedAt) : null}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerTime: { fontSize: 10, letterSpacing: 1 },
  readonly: { opacity: 0.45 },
  explain: { fontSize: 11.5, lineHeight: 18 },
});
