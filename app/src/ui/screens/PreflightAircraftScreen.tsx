/**
 * UZ Aero — 02 NOWY LOT · krok 1/3: kto i czym.
 *
 * Odwzorowanie mockupu `design/02-preflight.html` — kolejność i treść sekcji są stamtąd,
 * nie z improwizacji: pasek tożsamości → samolot → drugi pilot → DALEJ.
 *
 * Rodzaj operacji, trasa i klient przeniosły się do kroku 2 (`PreflightTaskScreen`,
 * decyzja 2026-07-30): ten ekran zbierał WYBORY Z LIST (w tym przejęcie samolotu —
 * najcięższą decyzję preflightu) razem z opisem zadania, a obie listy rosną z flotą
 * i liczbą pilotów.
 *
 * CZASU MELDOWANIA TU NIE MA (§3.6a; od issue #23 razem z całą klamrą służby).
 * Dzień pilota to lista sesji — godziny „od kiedy" się nie deklaruje. Pytanie o nią
 * w drodze do kokpitu kosztowało krok i mówiło nieprawdę — sugerowało, że bez
 * odpowiedzi nie wolno lecieć. **Przejęcie ma trwać kilka sekund** (`CLAUDE.md`),
 * a to był jedyny ekran preflightu z pytaniem o czas.
 *
 * Reguły, których ten ekran pilnuje:
 *  • wybór z **listy kart**, nigdy z natywnego selecta; operacje jako **siatka ikon**
 *    (`CLAUDE.md`);
 *  • tożsamość pilota jest znana z sesji — nie pytamy o kod, **pokazujemy** go paskiem;
 *  • samolot wyłączony ze służby jest widoczny, ale niedostępny — z podanym powodem;
 *  • samolotu zajętego przez innego pilota **nie da się stąd wybrać**: wiersz prowadzi
 *    do podglądu 04b, a przejęcie jest decyzją TAMTEGO ekranu (issue #12; §4.4 — claim
 *    odbiera poprzednikowi prawo zapisu, więc nie zapada przy liście);
 *  • samolot z wymogiem załogi 2-osobowej blokuje przejście dalej bez Duala.
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
  const [fleet, setFleet] = useState<ReferenceAircraft[]>([]);
  const [pilots, setPilots] = useState<ReferencePilot[]>([]);

  useEffect(() => {
    if (!queries) return;
    void queries.aircraft().then(setFleet);
    void queries.pilots().then((list) => {
      setPilots(list);
      setPilotProfile(list.find((p) => p.id === pilotId) ?? null);
    });
  }, [pilotId, queries, setPilotProfile]);

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
          title="NOWY LOT"
          step="1 / 3"
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
      </View>

      {/* Arkusza przejęcia tu już nie ma (issue #12): pytanie „PRZEJMIJ SP-FGK?" padało
          nad listą, na której nie było widać ani stanu samolotu, ani tego, co poprzednik
          zdążył zrobić — a to jest właśnie treść ekranu 04b. Cała decyzja przeniosła się
          tam razem z ostrzeżeniem o niewysłanych danych poprzednika. */}
    </Screen>
  );
}
