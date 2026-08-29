/**
 * UZ Aero - 12 POPRZEDNIE DNI (mockup `design/12-historia.html`).
 *
 * Bez tego ekranu obietnica „możesz poprawić przez 24 h" nie miała drzwi (§ decyzja
 * 2026-07-23): sesja w oknie korekty stoi wyróżniona na górze i otwiera się w ekranie
 * 10, skąd „EDYTUJ DANE" prowadzi do listy ręcznej (08) i korekty 04c - od issue #40
 * to JEDYNE drzwi zapisu. Sesje po oknie są do ODCZYTU - od issue #35
 * też się otwierają, tyle że w wariancie bez elementów zapisu (`design/10b`): przedtem
 * karta była martwa i pilot nie miał jak sprawdzić, co właściwie zapisał.
 *
 * Ekran pokazuje dni WCZEŚNIEJSZE (issue #35 pkt 1). Dzisiejsze sesje mieszkają na
 * „Mój dzień" (01), na TAKICH SAMYCH kafelkach `DayCard` (issue #42) - druga lista tych
 * samych lotów kazałaby pilotowi zgadywać, która jest prawdziwa, a dwa różne kształty
 * tej samej sesji kazałyby mu zgadywać, czy „Blok" znaczy tam to samo, co tutaj.
 *
 * Wszystko liczy się z LOKALNEGO strumienia (`historyDays` grupuje zdarzenia po
 * sesjach i projektuje tym samym kodem co ekran 10) - historia działa w pełni offline;
 * jedyną „serwerową" informacją jest plakietka wysyłki, a i ona liczy się z outboxa.
 *
 * „OTWÓRZ I POPRAW" oraz „ZOBACZ SZCZEGÓŁY" ładują wskazaną sesję do store'u
 * (`loadSession`) - bezpieczne, bo z kokpitu nie ma tu drogi (kokpit jest stanem
 * modalnym), więc żadna trzymana maszyna nie zostaje w tle.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';

import type { HistoryDay } from '../../application';
import {
  AppText,
  DayCard,
  GroupLabel,
  Icon,
  Screen,
  ScreenHeader,
  SkeletonRows,
  SyncChip,
  Tag,
} from '../components';
import { useTheme } from '../theme';
import { useSessionStore } from '../store';
import { useSkeleton } from '../hooks/useSkeleton';
import { buildHistory, type DayCardSpec, type EditableDaySpec } from './logic/historyDays';

export function HistoryScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string) => void; goBack: () => void };
}) {
  const { theme } = useTheme();
  const queries = useSessionStore((s) => s.queries);
  const loadSession = useSessionStore((s) => s.loadSession);
  const synced = useSessionStore((s) => s.synced);
  const outboxCount = useSessionStore((s) => s.outboxCount);
  const lastSync = useSessionStore((s) => s.lastSync);
  const lastSyncAt = useSessionStore((s) => s.lastSyncAt);
  const streamRevision = useSessionStore((s) => s.streamRevision);
  const streamHydrated = useSessionStore((s) => s.streamHydrated);

  const [days, setDays] = useState<HistoryDay[] | null>(null);

  // Świeże dane przy każdym wejściu; `outboxCount` w zależnościach odświeża plakietki
  // wysyłki, gdy pętla synca opróżni kolejkę, kiedy ekran jest otwarty, a
  // `streamRevision` - całą listę, gdy odtworzenie z serwera dopisze dni (§4.9).
  useEffect(() => {
    if (queries == null) return;
    let alive = true;
    void queries.historyDays().then((result) => {
      if (alive) setDays(result);
    });
    return () => {
      alive = false;
    };
  }, [queries, outboxCount, streamRevision]);

  const openDay = useCallback(
    async (sessionUuid: string) => {
      await loadSession(sessionUuid);
      navigation.navigate('Stats');
    },
    [loadSession, navigation],
  );

  /**
   * Czy kolejka faktycznie jedzie. Aplikacja nie zna stanu „online" inaczej niż po
   * wyniku ostatniej próby wysyłki (§4.3): przebieg zakończony `synced`/`idle` dosięgnął
   * serwera, więc zaległe zdarzenia są w drodze. Cokolwiek innego - brak sieci, wygasły
   * token, odrzucenie - znaczy „czeka", i tak to nazywamy.
   */
  const pushing = lastSync?.kind === 'synced' || lastSync?.kind === 'idle';

  const groups = days != null ? buildHistory(days, Date.now(), pushing) : null;
  // Pustej historii wolno wierzyć dopiero po pierwszym uzgodnieniu rejestru z serwerem
  // (§4.9, issue #32): telefon zaraz po czyszczeniu pamięci pokazałby „BRAK POPRZEDNICH
  // DNI" komuś, kto ma za sobą sezon - a to jest dokładnie ten komunikat, który wygląda
  // jak utrata danych. Historia NIEPUSTA nie czeka na nic: ona nigdy nie kłamie.
  const empty =
    groups != null &&
    groups.editable.length === 0 &&
    groups.closed.length === 0 &&
    streamHydrated;

  /**
   * Ekran czeka, dopóki nie wie ANI że są dni, ANI że ich nie ma (issue #33). Historia
   * po sezonie czyta się z lokalnego strumienia zauważalnie dłużej niż jedna doba,
   * a pusty ekran bez wyjaśnienia wygląda przy tym jak zawieszona aplikacja.
   */
  const waiting =
    groups == null ||
    (groups.editable.length === 0 && groups.closed.length === 0 && !streamHydrated);
  const skeleton = useSkeleton(waiting);

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="POPRZEDNIE DNI"
          size="md"
          onBack={navigation.goBack}
          backLabel="Dzień"
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
      <View style={styles.content}>
        {/* Dwie karty w geometrii `DayCard`: data, godziny, statystyki i pas akcji -
            czyli część WSPÓLNA obu grup (wzorzec `design/LOADERY.html` reguła 2).
            Stopki plamka nie obiecuje, bo karta zamknięta bez zaległości wysyłki jej
            nie ma. Stan pusty czeka na swoją kolej: wolno go napisać dopiero, gdy
            wiadomo, że jest pusto (reguła 4). */}
        {waiting && skeleton && (
          <SkeletonRows rows={2} height={156} radius={theme.radius.btn} />
        )}

        {empty && (
          <View style={styles.empty}>
            <AppText variant="display" style={styles.emptyTitle}>
              BRAK POPRZEDNICH DNI
            </AppText>
            {/* Tekst mówi o WARTOŚCI ekranu (rozliczenia, okno korekty), nie o technice
                (issue #55 pkt 2): wzmianka „również bez zasięgu" opisywała budowę
                aplikacji - skąd ekran liczy dane, jest pilotowi obojętne. */}
            <AppText variant="body" tone="muted" style={styles.emptyText}>
              Po zmianie doby znajdziesz tu swoje wcześniejsze sesje - komplet czasów
              i lotów każdej z nich, z możliwością poprawienia danych przez 24 h od
              zdania samolotu. Dzisiejsze sesje są na ekranie „Mój dzień".
            </AppText>
          </View>
        )}

        {/* ── sesje w oknie korekty ───────────────────────────────────────── */}
        {groups != null && groups.editable.length > 0 && (
          <>
            <GroupLabel text="Możesz jeszcze poprawić" />
            {groups.editable.map((day) => (
              <DayCard
                key={day.sessionUuid}
                title={day.title}
                aircraft={day.aircraft}
                times={day.times}
                stats={day.stats}
                {...(day.manual ? { titleTag: 'RĘCZNIE' } : {})}
                editable
                ctaLabel="OTWÓRZ I POPRAW"
                ctaIcon="edit"
                onPress={() => void openDay(day.sessionUuid)}
                foot={
                  <>
                    <UploadTag day={day} />
                    <Tag label={day.deadline} tone="blue" />
                    <AppText variant="mono" tone="muted" style={styles.footNote}>
                      {day.remaining}
                    </AppText>
                  </>
                }
              />
            ))}
          </>
        )}

        {/* ── sesje po oknie: podgląd bez edycji (10b) ─────────────────────── */}
        {groups != null && groups.closed.length > 0 && (
          <>
            <GroupLabel text="Zamknięte" style={styles.closedLabel} />
            {groups.closed.map((day) => (
              <DayCard
                key={day.sessionUuid}
                title={day.title}
                aircraft={day.aircraft}
                times={day.times}
                stats={day.stats}
                {...(day.manual ? { titleTag: 'RĘCZNIE' } : {})}
                // Oko, nie ołówek: po oknie 24 h ekran 10 otwiera się bez ołówków
                // przy lotach i bez „Edytuj dane" - obiecywanie tu korekty byłoby
                // obietnicą, której reguły i tak nie dotrzymają.
                ctaLabel="ZOBACZ SZCZEGÓŁY"
                ctaIcon="peek"
                onPress={() => void openDay(day.sessionUuid)}
                // Tag „Okno minęło" USUNIĘTY (issue #35 pkt 4): mówił to samo, co
                // etykieta grupy nad kartami i przypis z kłódką pod nimi.
                foot={day.upload != null ? <UploadTag day={day} /> : undefined}
              />
            ))}

            <View style={styles.lockedNote}>
              {/* Kłódka, nie trójkąt - „zamknięte" to stan, nie ostrzeżenie (mockup 12). */}
              <Icon name="lock" size={14} color={theme.colors.textMuted} />
              <AppText variant="body" tone="secondary" style={styles.lockedText}>
                Sesje po oknie 24 h możesz oglądać, ale nie zmieniać. Jeśli znalazłeś błąd
                - zgłoś go administratorowi; poprawka zostanie dopisana jako korekta, bez
                kasowania oryginalnego zapisu.
              </AppText>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

/**
 * Plakietka wysyłki - TYLKO gdy coś czeka w kolejce (issue #35 pkt 3).
 *
 * „Wysłane" nie istnieje: to stan domyślny, a napis powtarzany przy prawie każdej
 * karcie uczy oko pomijać stopkę - ta sama reguła, dla której SyncChip online nie
 * rysuje nic (issue #12).
 */
function UploadTag({ day }: { day: DayCardSpec | EditableDaySpec }) {
  if (day.upload == null) return null;
  return (
    <Tag
      label={day.upload.label}
      tone="amber"
      icon={day.upload.state === 'sending' ? 'sync' : 'clock'}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, gap: 11 },
  closedLabel: { marginTop: 4 },
  footNote: { fontSize: 9 },
  lockedNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2 },
  lockedText: { flex: 1, fontSize: 11, lineHeight: 16.5 },
  empty: { paddingVertical: 48, gap: 12 },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center' },
});
