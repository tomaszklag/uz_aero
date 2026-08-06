/**
 * UZ Aero — 02 PREFLIGHT · krok 1/4: kto, czym i od kiedy.
 *
 * Odwzorowanie mockupu `design/02-preflight.html` — kolejność i treść sekcji są stamtąd,
 * nie z improwizacji: pasek tożsamości → samolot → drugi pilot → czas meldowania → DALEJ.
 *
 * Rodzaj operacji, trasa i klient przeniosły się do kroku 2 (`PreflightTaskScreen`,
 * decyzja 2026-07-30): ten ekran zbierał WYBORY Z LIST (w tym przejęcie samolotu —
 * najcięższą decyzję preflightu) razem z opisem zadania, a obie listy rosną z flotą
 * i liczbą pilotów. Meldunek zostaje tutaj, bo odpowiada na „od kiedy jesteś na służbie",
 * a nie na „co dziś robisz".
 *
 * Reguły, których ten ekran pilnuje:
 *  • wybór z **listy kart**, nigdy z natywnego selecta; operacje jako **siatka ikon**
 *    (`CLAUDE.md`);
 *  • tożsamość pilota jest znana z sesji — nie pytamy o kod, **pokazujemy** go paskiem;
 *  • samolot wyłączony ze służby jest widoczny, ale niedostępny — z podanym powodem;
 *  • samolotu zajętego przez innego pilota **nie da się stąd wybrać**: wiersz prowadzi
 *    do podglądu 04b, a przejęcie jest decyzją TAMTEGO ekranu (issue #12; §4.4 — claim
 *    odbiera poprzednikowi prawo zapisu, więc nie zapada przy liście);
 *  • samolot z wymogiem załogi 2-osobowej blokuje przejście dalej bez Duala;
 *  • czas meldowania w UTC, LT tylko jako wartość drugorzędna; „teraz" bierzemy z chwili
 *    WEJŚCIA na ekran, nie z uruchomienia aplikacji.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import {
  ActionButton,
  AppText,
  Banner,
  Card,
  CardPicker,
  Field,
  IdentityStrip,
  ReadingSheet,
  Screen,
  ScreenHeader,
  SyncChip,
  Tag,
  ValueBox,
  type PickerOption,
} from '../components';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { usePreflightDraft } from '../store/preflightDraft';
import { dateUtcLong, parseTimeUtcOnDay, timeLocal, timeUtc } from '../format';
import type { ReferenceAircraft, ReferencePilot } from '../../domain';

export function PreflightAircraftScreen({
  navigation,
}: {
  // Podgląd read-only (04b) potrzebuje parametru — stąd druga, opcjonalna pozycja.
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void };
}) {
  const { theme } = useTheme();
  const queries = useSessionStore((s) => s.queries);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);

  const pilotId = useCurrentPilot((s) => s.id);
  const pilotProfile = useCurrentPilot((s) => s.profile);
  const setPilotProfile = useCurrentPilot((s) => s.setProfile);

  const draft = usePreflightDraft();
  const refreshDutyStart = usePreflightDraft((s) => s.refreshDutyStart);
  const [fleet, setFleet] = useState<ReferenceAircraft[]>([]);
  const [pilots, setPilots] = useState<ReferencePilot[]>([]);
  /**
   * Arkusz czasu meldowania — `null` = zamknięty, liczba = „teraz" z chwili otwarcia.
   *
   * Snapshot, nie `Date.now()` w renderze: godzina odniesienia w arkuszu ma stać w miejscu,
   * kiedy pilot wpisuje wartość, a nie przesuwać mu się pod palcami.
   */
  const [dutyEditorNow, setDutyEditorNow] = useState<number | null>(null);

  useEffect(() => {
    if (!queries) return;
    void queries.aircraft().then(setFleet);
    void queries.pilots().then((list) => {
      setPilots(list);
      setPilotProfile(list.find((p) => p.id === pilotId) ?? null);
    });
  }, [pilotId, queries, setPilotProfile]);

  // Godzina meldunku = „teraz" z chwili wejścia na ekran (issue #12). Szkic przeżywa
  // całą sesję aplikacji, więc bez tego pilot widział godzinę uruchomienia telefonu.
  // Wpis własny zostaje nietknięty — o tym decyduje `dutyStartEdited` w szkicu.
  useEffect(() => {
    refreshDutyStart(Date.now());
  }, [refreshDutyStart]);

  const selected = draft.aircraft;
  const needsDual = selected?.dualRequired === true && draft.dualId == null;

  const aircraftOptions: PickerOption<string>[] = useMemo(
    () =>
      fleet.map((a) => {
        const grounded = a.serviceStatus === 'disabled';
        const claimed = a.claimPicId != null && a.claimPicId !== pilotId;

        return {
          value: a.id,
          label: a.reg,
          // Bez rocznika (issue #12): przy wyborze samolotu na dziś rok produkcji nie
          // rozstrzyga niczego, a wydłużał wiersz o wartość, której nikt nie czyta.
          detail: a.type,
          tags: grounded ? [{ label: 'Wyłączony', tone: 'red' as const }] : undefined,
          // Zajęty przez kogoś innego = pozycja do podglądu (04b), nie do wyboru.
          // Sama informacja „kto" bez „od kiedy" nie pozwala ocenić, czy tamten dzień
          // jeszcze trwa — stąd godzina blokady w tej samej linii.
          peek: claimed,
          note: claimed
            ? a.claimSince != null
              ? `Prowadzi PIC: ${a.claimPicId} · od ${timeUtc(a.claimSince)}`
              : `Prowadzi PIC: ${a.claimPicId}`
            : undefined,
          disabledReason: grounded ? 'Wyłączony ze służby' : undefined,
          // Powód niesie już czerwony tag — druga linia byłaby powtórzeniem.
          disabledTagged: grounded,
        };
      }),
    [fleet, pilotId],
  );

  // Pilot zalogowany nie może być jednocześnie Dualem — filtrujemy go z listy.
  // Kod pilota nosi kafelek po lewej (issue #12), więc nie powtarzamy go w detalu.
  const dualOptions: PickerOption<string>[] = useMemo(
    () =>
      pilots
        .filter((p) => p.active && p.id !== pilotId)
        .map((p) => ({ value: p.id, label: p.name, avatarCode: p.code })),
    [pilots, pilotId],
  );

  const handleAircraft = useCallback(
    (id: string) => {
      const found = fleet.find((a) => a.id === id);
      // Samolot z cudzym claimem nie wchodzi tą drogą — `CardPicker` kieruje takie
      // pozycje do podglądu (04b), a stamtąd wraca gotowy wybór.
      if (!found || (found.claimPicId != null && found.claimPicId !== pilotId)) return;
      draft.setAircraft(found);
    },
    [draft, fleet, pilotId],
  );

  return (
    <Screen
      scroll
      header={
        <ScreenHeader
          // Bez podtytułu (issue #12): „Kto, czym i od kiedy" opisywało formularz, który
          // pilot i tak ma przed oczami, a numer kroku mówi już wszystko o miejscu w flow.
          title="PREFLIGHT"
          step="1 / 4"
          right={
            <SyncChip
              status={synced ? 'synced' : 'offline'}
              outboxCount={outboxCount}
              lastSyncAt={lastSyncAt}
            />
          }
        />
      }
      // Akcja prowadząca dalej stoi przy dolnej krawędzi niezależnie od długości
      // formularza — kciuk ma stałe miejsce do trafienia (reguła z 2026-07-30).
      footer={
        <ActionButton
          label="DALEJ"
          tone="green"
          variant="solid"
          trailingIcon="next"
          disabledReason={
            selected == null
              ? 'Wybierz samolot, aby przejść dalej'
              : needsDual
                ? 'Wybierz drugiego pilota — ten samolot wymaga załogi 2-osobowej'
                : null
          }
          onPress={() => navigation.navigate('PreflightTask')}
        />
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        {/* ── kto zapisuje ten dzień ──────────────────────────────────── */}
        <IdentityStrip
          name={pilotProfile?.name ?? pilotId}
          subtitle={pilotProfile?.code ?? pilotId}
          badge="PIC"
        />

        {/* ── samolot ─────────────────────────────────────────────────── */}
        <Card title="Samolot" header="inline">
          {fleet.length === 0 ? (
            <AppText variant="body" tone="muted">
              Brak samolotów w pamięci urządzenia.
            </AppText>
          ) : (
            <CardPicker
              options={aircraftOptions}
              value={selected?.id ?? null}
              onChange={handleAircraft}
              // Cała pozycja z cudzym claimem prowadzi TUTAJ. Przejęcie odbiera
              // poprzednikowi prawo zapisu (§4.4), więc zapada dopiero na 04b — po
              // zobaczeniu, co się z samolotem dzieje, a nie tapnięciem w listę.
              onSecondary={(id) => navigation.navigate('CockpitReadonly', { aircraftId: id })}
              secondaryLabel="Podgląd — kto prowadzi ten samolot"
            />
          )}
        </Card>

        {/* ── drugi pilot ─────────────────────────────────────────────── */}
        {/* „· Dual" wypadło z tytułu (issue #12): to żargon obok napisu, który i tak
            mówi wszystko. Rola „DUAL" zostaje tam, gdzie jest identyfikatorem — w logu
            dnia, na karcie załogi i w arkuszu. */}
        <Card
          title="Drugi pilot"
          header="inline"
          headerRight={
            <Tag
              label={selected?.dualRequired ? 'wymagany · załoga 2-os.' : 'opcjonalne'}
              tone={selected?.dualRequired ? 'amber' : 'neutral'}
            />
          }
        >
          <CardPicker
            options={dualOptions}
            value={draft.dualId}
            onChange={(id) => draft.set('dualId', draft.dualId === id ? null : id)}
          />
          {needsDual && (
            <Banner
              kind="warning"
              title="Wymagana załoga dwuosobowa"
              text={`${selected?.type ?? 'Ten samolot'} wymaga drugiego pilota — wybierz go, aby przejść dalej.`}
            />
          )}
        </Card>

        {/* ── czas meldowania ─────────────────────────────────────────────
            Mockup pokazuje pole ODCZYTU: „08:00 UTC" dużym mono, obok „10:00 LT"
            i ołówek, pod spodem badge z datą. Sekcja nie ma etykiety — pole samo się
            przedstawia. Ołówek otwiera arkusz z wpisaniem godziny (wzorzec 02b/02c dla
            odczytów): meldunek bywa godziny wstecz wobec chwili wypełniania formularza,
            a wtedy wpisanie „08:00" jest jednym ruchem zamiast serii tapnięć w stepper. */}
        <Card header="inline">
          {/* Bez „(duty start)" — angielski termin w nawiasie nie tłumaczył już niczego,
              czego nie mówi polska etykieta (issue #12). */}
          <Field label="Czas meldowania">
            <ValueBox
              value={timeUtc(draft.dutyStart)}
              unit="UTC"
              meta={`${timeLocal(draft.dutyStart)} LT`}
              actionIcon="edit"
              accessibilityLabel={`Czas meldowania ${timeUtc(draft.dutyStart)} UTC — zmień`}
              onPress={() => setDutyEditorNow(Date.now())}
            />
            <View style={{ flexDirection: 'row' }}>
              <Tag label={dateUtcLong(draft.dutyStart)} size="md" />
            </View>
          </Field>
        </Card>

      </View>

      {/* ── godzina meldunku (arkusz jak 02b/02c dla odczytów) ─────────── */}
      <ReadingSheet
        visible={dutyEditorNow != null}
        title="Godzina meldowania"
        unit="UTC"
        // Ton NEUTRALNY, czyli ten sam kolor cyfr co w polu, z którego arkusz się otwiera
        // (issue #12). Niebieski był tu tonem „informacja o czasie UTC", ale w praktyce
        // wyglądał jak zmiana wartości w połowie edycji: pilot tapał białe „08:00",
        // a dostawał niebieskie. Amber w 02b/02c niesie stan (paliwo/MH); godzina
        // meldunku nie niesie żadnego.
        tone="neutral"
        // Cyfry z klawiatury numerycznej — dwukropek w „HH:MM" stawia maska arkusza.
        keyboard="time"
        initialText={timeUtc(draft.dutyStart)}
        rows={[
          {
            label: 'Teraz',
            value:
              dutyEditorNow != null
                ? `${timeUtc(dutyEditorNow)} UTC · ${timeLocal(dutyEditorNow)} LT`
                : '—',
          },
          { label: 'Dzień lotny', value: dateUtcLong(draft.dutyStart) },
        ]}
        // Data zostaje z dnia lotnego — pilot poprawia godzinę, nie datę.
        parse={(text) => parseTimeUtcOnDay(text, draft.dutyStart)}
        warningFor={(v) => {
          // Ostrzeżenie miękkie, jak w arkuszach odczytów: meldunek „w przyszłość" bywa
          // pomyłką (14:00 zamiast 04:00), ale zegarek telefonu nie jest tu wyrocznią.
          if (dutyEditorNow == null || v <= dutyEditorNow + 60_000) return null;
          return (
            `Wpisana godzina jest późniejsza niż teraz (${timeUtc(dutyEditorNow)} UTC). ` +
            'Sprawdź, czy to godzina meldunku, a nie pomyłka w zapisie.'
          );
        }}
        onConfirm={(v) => {
          draft.set('dutyStart', v);
          setDutyEditorNow(null);
        }}
        onCancel={() => setDutyEditorNow(null)}
      />

      {/* Arkusza przejęcia tu już nie ma (issue #12): pytanie „PRZEJMIJ SP-FGK?" padało
          nad listą, na której nie było widać ani stanu samolotu, ani tego, co poprzednik
          zdążył zrobić — a to jest właśnie treść ekranu 04b. Cała decyzja przeniosła się
          tam razem z ostrzeżeniem o niewysłanych danych poprzednika. */}
    </Screen>
  );
}
