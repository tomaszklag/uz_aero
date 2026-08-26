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
 *
 * Dwie decyzje z issue #55 (2026-08-26):
 *  • **pusta flota = warning na cały ekran, nie formularz** (`design/02g`): sekcja
 *    „Samolot" z jedną szarą linijką czytała się jak drobna usterka, a o ścianie pilot
 *    dowiadywał się dopiero z zablokowanego DALEJ. Zamiast formularza stoi bursztynowa
 *    karta z powodem i drogą wyjścia; DALEJ nie ma wcale (wyszarzony przycisk
 *    obiecywałby akcję, której reguły nie dopuszczą — ta sama zasada co 10B).
 *    Ekran co kilka sekund ponawia odczyt lokalnej bazy, więc gdy pętla synca (60 s)
 *    dowiezie `GET /reference`, formularz wraca bez udziału pilota;
 *  • **„wstecz" przy niepustym formularzu pyta o rezygnację** (`design/02h`,
 *    `AbandonPreflightSheet`): ta sama mechanika co blokada kokpitu (04d) —
 *    `usePreventRemove` łapie przycisk sprzętowy i gest. Potwierdzenie CZYŚCI szkic,
 *    więc następne wejście zaczyna od nowa; wcześniej porzucony formularz wracał
 *    z wyborami sprzed godziny. Pusty formularz wychodzi bez pytania — arkusz nad
 *    niczym pytałby o zgodę na nic. Zapisana akcja nawigacji jedzie dopiero z efektu,
 *    PO re-renderze, w którym bramka opadła — dispatch w tym samym tiku trafiałby
 *    w listener pamiętający jeszcze bramkę podniesioną.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { usePreventRemove, type NavigationAction } from '@react-navigation/native';

import {
  AbandonPreflightSheet,
  ActionButton,
  AppText,
  Banner,
  Card,
  CardPicker,
  Icon,
  IdentityStrip,
  Screen,
  ScreenHeader,
  SkeletonRows,
  SyncChip,
  Tag,
  type PickerOption,
} from '../components';
import { useTheme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { useSkeleton } from '../hooks/useSkeleton';
import { usePreflightDraft } from '../store/preflightDraft';
import { timeUtc } from '../format';
import type { ReferenceAircraft, ReferencePilot } from '../../domain';

/**
 * Co ile ekran ponawia odczyt pustego cache floty (stan `design/02g`). To odczyt
 * z SQLite, nie sieć — sieć odpytuje pętla synca własnym rytmem (60 s z bramą wieku);
 * my tylko sprawdzamy, czy już dowiozła.
 */
const EMPTY_FLEET_RECHECK_MS = 5000;

export function PreflightAircraftScreen({
  navigation,
}: {
  // Podgląd read-only (04b) potrzebuje parametru — stąd druga, opcjonalna pozycja.
  // `dispatch` wykonuje akcję nawigacji zatrzymaną przez bramkę rezygnacji.
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    dispatch: (action: NavigationAction) => void;
  };
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
  /**
   * Czy cache referencyjny został już PRZECZYTANY. Bez tej flagi pusta tablica znaczyła
   * dwie różne rzeczy — „jeszcze nie wiem" i „nie ma ani jednego samolotu" — i ekran
   * pokazywał stan braku floty w trakcie normalnego odczytu, czyli komunikat o awarii
   * przy poprawnym starcie (issue #33).
   */
  const [loaded, setLoaded] = useState(false);
  const skeleton = useSkeleton(!loaded);

  useEffect(() => {
    if (!queries) return;
    let alive = true;
    void Promise.all([queries.aircraft(), queries.pilots()]).then(([aircraft, list]) => {
      if (!alive) return;
      setFleet(aircraft);
      setPilots(list);
      setPilotProfile(list.find((p) => p.id === pilotId) ?? null);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [pilotId, queries, setPilotProfile]);

  /** Stan `design/02g`: cache przeczytany i pusty — warning zamiast formularza. */
  const noFleet = loaded && fleet.length === 0;

  // Warning ma zniknąć SAM, gdy sync dowiezie flotę — pilot patrzący na ekran z radą
  // „sprawdź internet" nie może być zmuszony do wyjścia i powrotu, żeby sprawdzić,
  // czy rada zadziałała. Ponawiamy więc odczyt lokalnej bazy, dopóki jest pusto.
  useEffect(() => {
    if (!noFleet || queries == null) return;
    let alive = true;
    const timer = setInterval(() => {
      void Promise.all([queries.aircraft(), queries.pilots()]).then(([aircraft, list]) => {
        if (!alive || aircraft.length === 0) return;
        setFleet(aircraft);
        setPilots(list);
        setPilotProfile(list.find((p) => p.id === pilotId) ?? null);
      });
    }, EMPTY_FLEET_RECHECK_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [noFleet, pilotId, queries, setPilotProfile]);

  // ── bramka „wstecz": rezygnacja z nowego lotu (issue #55, `design/02h`) ────────
  /** Akcja nawigacji zatrzymana przez bramkę — arkusz jest otwarty, póki tu coś jest. */
  const [leaveAction, setLeaveAction] = useState<NavigationAction | null>(null);
  /** Pilot potwierdził rezygnację — bramka ma opaść i wypuścić zatrzymaną akcję. */
  const [leaving, setLeaving] = useState(false);

  /*
   * Bramka pyta o WYBORY (`draft.dirty()`), nie o sam fakt bycia na ekranie: pusty
   * formularz wychodzi bez pytania. Warunek gaśnie też po ukończeniu flow — krok 3
   * czyści szkic PRZED wejściem do kokpitu, więc zdjęcie tego ekranu ze stosu przy
   * powrocie na 01 (po zdaniu samolotu) przechodzi bez arkusza.
   */
  usePreventRemove(draft.dirty() && !leaving, ({ data }) => setLeaveAction(data.action));

  // Zatrzymana akcja jedzie dopiero PO re-renderze z opuszczoną bramką (patrz docblock).
  useEffect(() => {
    if (leaving && leaveAction != null) navigation.dispatch(leaveAction);
  }, [leaving, leaveAction, navigation]);

  const stayInForm = useCallback(() => setLeaveAction(null), []);
  const confirmAbandon = useCallback(() => {
    setLeaving(true);
    // Czyszczenie szkicu = „następne wejście zaczyna od nowa" (issue #55) i zarazem
    // opuszczenie bramki: po nim `dirty()` jest fałszywe.
    draft.reset();
  }, [draft]);

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
      // Warning braku floty stoi na środku ekranu (mockup 02g: `margin:auto`) — treść
      // musi się rozciągnąć do pełnej wysokości, żeby środek istniał.
      contentContainerStyle={noFleet ? styles.grow : undefined}
      // Akcja prowadząca dalej stoi przy dolnej krawędzi niezależnie od długości
      // formularza — kciuk ma stałe miejsce do trafienia (reguła z 2026-07-30).
      // Przy pustej flocie DALEJ nie ma WCALE: wyszarzony przycisk obiecywałby akcję,
      // której reguły nie dopuszczą (issue #55; ta sama zasada co brak „EDYTUJ DANE"
      // na 10B).
      footer={
        noFleet ? undefined : (
          <ActionButton
            label="DALEJ"
            tone="green"
            variant="solid"
            trailingIcon="next"
            disabledReason={selected == null ? 'Wybierz samolot, aby przejść dalej' : null}
            // Brak Duala jest zablokowany BEZ osobnego tekstu: powód widać już
            // w bannerze „Wymagana załoga dwuosobowa" nad sekcją wyboru — drugi napis
            // powtarzałby to samo zdanie (§6 pkt 3, uwaga z urządzenia 2026-08-16:
            // `disabledReason` zostaje dla blokad, których z ekranu nie widać,
            // `disabled` dla tych widocznych).
            disabled={needsDual}
            onPress={() => navigation.navigate('PreflightTask')}
          />
        )
      }
    >
      {noFleet ? (
        /* ── warning na cały ekran: flota nie dojechała (`design/02g`) ───────── */
        <View style={styles.emptyWrap}>
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: theme.colors.amberMuted,
                borderColor: theme.colors.amberBorder,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor: theme.colors.amberMuted,
                  borderColor: theme.colors.amberBorder,
                  borderWidth: theme.borderWidth,
                },
              ]}
            >
              <Icon name="warning" size={30} color={theme.colors.amber} />
            </View>
            <AppText variant="display" style={[styles.emptyTitle, { color: theme.colors.amber }]}>
              BRAK SAMOLOTÓW
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.emptyText}>
              W pamięci telefonu nie ma jeszcze floty —{' '}
              <AppText
                variant="body"
                style={[styles.emptyText, {
                  color: theme.colors.textPrimary,
                  fontFamily: theme.fontFamily.bodySemiBold,
                }]}
              >
                bez wybranego samolotu nie da się rozpocząć lotu
              </AppText>
              .
            </AppText>
            <AppText variant="body" tone="secondary" style={styles.emptyText}>
              Lista pobiera się z serwera automatycznie, gdy jest internet — sprawdź
              połączenie. Jeśli to nie pomaga, poproś administratora o dodanie samolotów
              do floty.
            </AppText>
          </View>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {/* ── kto zapisuje ten dzień ──────────────────────────────────── */}
          <IdentityStrip
            name={pilotProfile?.name ?? pilotId}
            subtitle={pilotProfile?.code ?? pilotId}
            badge="PIC"
          />

          {/* ── samolot ─────────────────────────────────────────────────── */}
          <Card title="Samolot" header="inline">
            {/* Trzy pozycje w geometrii `CardPicker` (minHeight 56, odstęp 6) — flota
                klubu jest tego rzędu, a plamki nie mają prawa udawać, że wiedzą ile
                dokładnie (wzorzec `design/LOADERY.html`). Stanu „brak samolotów" tu
                już nie ma — pusta flota przełącza CAŁY ekran w warning (`noFleet`). */}
            {!loaded ? (
              skeleton ? (
                <SkeletonRows rows={3} height={56} radius={theme.radius.md} gap={6} />
              ) : null
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
            {!loaded ? (
              skeleton ? (
                <SkeletonRows rows={2} height={56} radius={theme.radius.md} gap={6} />
              ) : null
            ) : (
              <CardPicker
                options={dualOptions}
                value={draft.dualId}
                onChange={(id) => draft.set('dualId', draft.dualId === id ? null : id)}
              />
            )}
            {needsDual && (
              <Banner
                kind="warning"
                title="Wymagana załoga dwuosobowa"
                text={`${selected?.type ?? 'Ten samolot'} wymaga drugiego pilota — wybierz go, aby przejść dalej.`}
              />
            )}
          </Card>
        </View>
      )}

      {/* Arkusza przejęcia tu już nie ma (issue #12): pytanie „PRZEJMIJ SP-FGK?" padało
          nad listą, na której nie było widać ani stanu samolotu, ani tego, co poprzednik
          zdążył zrobić — a to jest właśnie treść ekranu 04b. Cała decyzja przeniosła się
          tam razem z ostrzeżeniem o niewysłanych danych poprzednika. */}

      <AbandonPreflightSheet
        visible={leaveAction != null && !leaving}
        aircraftLabel={selected != null ? `${selected.reg} · ${selected.type}` : null}
        dualName={
          draft.dualId != null
            ? (pilots.find((p) => p.id === draft.dualId)?.name ?? draft.dualId)
            : null
        }
        onStay={stayInForm}
        onAbandon={confirmAbandon}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flexGrow: 1 },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  // Geometria karty 1:1 z `design/02g` (`.empty-warning` / `.ew-*`).
  emptyCard: {
    borderRadius: 18,
    paddingVertical: 38,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 14,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 30, lineHeight: 32, letterSpacing: 3 },
  emptyText: { fontSize: 12.5, lineHeight: 20, textAlign: 'center', maxWidth: 288 },
});
