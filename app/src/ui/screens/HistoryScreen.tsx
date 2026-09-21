/**
 * Ninerdeck - 24 HISTORIA: wszystkie operacje pilota (rezerwacje 3.0.0, epik R-E).
 *
 * ══ DZIEŃ JEST NAGŁÓWKIEM, OPERACJE SĄ ZWARTYMI WIERSZAMI ══
 * Do 3.0.0 każda operacja była pełnym kafelkiem z własną datą i własnym pasem akcji -
 * dzień z dwiema operacjami powtarzał przez to datę (na zrzucie z urządzenia
 * „11 SIERPNIA 2026" stało dwa razy pod rząd), a przycisk „OTWÓRZ I POPRAW" dokładał
 * 44 px do każdej pozycji, choć cała karta prowadziła w to samo miejsce. Odtąd data pada
 * RAZ, a na ekran wchodzi około trzy razy więcej pozycji - co ma znaczenie, odkąd lista
 * obejmuje także dziś.
 *
 * ══ TA ZAKŁADKA OBEJMUJE DZIŚ ══
 * I to jest odejście od issue #35 („dzisiejszych operacji tam nie ma, bo mieszkają
 * na 01"), wymuszone Pulpitem: ekran startowy pokazuje SAME SUMY, a kafelek operacji był
 * jedynymi drzwiami do korekty w oknie 24 h (issue #23, #43). Drzwi przeniosły się tutaj.
 *
 * Zębatki NIE MA (issue #82): ustawienia mają jedno wejście i jest nim Pulpit. Przycisk
 * zgłoszenia błędu przyjeżdża w ramie `ScreenHeader` (issue #87).
 *
 * Reguły treści i uzasadnienia: `logic/historyDays.ts` oraz `docs/rezerwacje.md` §9.3.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { HistoryDay } from '../../application';
import {
  AppText,
  Card,
  Icon,
  Screen,
  ScreenHeader,
  SkeletonRows,
  SyncChip,
  Tag,
} from '../components';
import { useTheme, type Theme } from '../theme';
import { useCurrentPilot, useSessionStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { useOperationClub } from '../hooks/useOperationClub';
import { useSkeleton } from '../hooks/useSkeleton';
import { useAircraftRegistrations } from '../hooks/useAircraftRegistrations';
import { useOperationSignatures } from '../hooks/useOperationSignatures';
import {
  buildHistoryLog,
  type HistoryDayVm,
  type HistoryOpVm,
} from './logic/historyDays';

/** Wysokość zwartego wiersza operacji - plamka ładowania trzyma dokładnie tyle. */
const ROW_HEIGHT = 58;

export function HistoryScreen({
  navigation,
}: {
  navigation: { navigate: (screen: string, params?: object) => void };
}) {
  const { theme } = useTheme();
  const s = styles(theme);

  const queries = useSessionStore((st) => st.queries);
  const loadSession = useSessionStore((st) => st.loadSession);
  const outboxCount = useSessionStore((st) => st.outboxCount);
  const lastSync = useSessionStore((st) => st.lastSync);
  const streamRevision = useSessionStore((st) => st.streamRevision);
  const streamHydrated = useSessionStore((st) => st.streamHydrated);
  const clubOf = useOperationClub();

  const pilotCode = useAuthStore((st) => st.pilot?.code);
  const pilotId = useCurrentPilot((st) => st.id);

  const [days, setDays] = useState<HistoryDay[] | null>(null);

  /**
   * ARCHIWUM ZWIJA SIĘ PRZY KAŻDYM WEJŚCIU i to jest decyzja, nie oszczędność stanu:
   * pytanie „co mogę poprawić" wraca za każdym razem, a „co latałem w maju" pada raz na
   * jakiś czas. Stan rozwinięcia jest więc CHWILOWY - zwykły `useState`, nie ustawienie.
   */
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Świeże dane przy każdym wejściu; `outboxCount` odświeża plakietki wysyłki, gdy pętla
  // synca opróżni kolejkę przy otwartym ekranie, a `streamRevision` - całą listę, gdy
  // odtworzenie z serwera dopisze dni (§4.9).
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

  const open = useCallback(
    async (sessionUuid: string) => {
      await loadSession(sessionUuid);
      navigation.navigate('Stats');
    },
    [loadSession, navigation],
  );

  /**
   * Czy kolejka faktycznie jedzie. Aplikacja nie zna stanu „online" inaczej niż po wyniku
   * ostatniej próby wysyłki (§4.3): przebieg zakończony `synced`/`idle` dosięgnął serwera.
   */
  const pushing = lastSync?.kind === 'synced' || lastSync?.kind === 'idle';

  const regOf = useAircraftRegistrations();
  const signatureOf = useOperationSignatures();
  const vm =
    days != null ? buildHistoryLog(days, Date.now(), pushing, regOf, signatureOf, clubOf) : null;

  // Pustej historii wolno wierzyć dopiero po pierwszym uzgodnieniu rejestru z serwerem
  // (§4.9, issue #32): telefon zaraz po czyszczeniu pamięci pokazałby „BRAK OPERACJI"
  // komuś, kto ma za sobą sezon - a to jest komunikat wyglądający jak utrata danych.
  const empty = vm != null && vm.open.length === 0 && vm.archive.length === 0 && streamHydrated;
  const waiting = vm == null || (vm.open.length === 0 && vm.archive.length === 0 && !streamHydrated);
  const skeleton = useSkeleton(waiting);

  return (
    <Screen
      scroll
      padded={false}
      header={
        <ScreenHeader
          title="HISTORIA"
          size="md"
          // Znacznik strefy stoi TUTAJ, bo cała lista jest w UTC - wiersz z godzinami
          // nie powtarza go przy każdej operacji.
          subtitle={`${pilotCode ?? pilotId} · CZASY UTC`}
          right={<SyncChip />}
        />
      }
    >
      <View style={s.content}>
        {waiting && skeleton && <HistorySkeleton />}

        {empty && <EmptyHistory />}

        {vm?.open.map((day) => (
          <DayGroup key={day.day} day={day} onOpen={open} />
        ))}

        {/* Wejście w archiwum - ton podpisu i przerywana ramka: to jest droga do RESZTY,
            a nie akcja ekranu (tą jest poprawienie świeżego lotu). Zielony przycisk w tym
            miejscu przeciągałby uwagę na archiwum. */}
        {vm != null && vm.archiveCount > 0 && !archiveOpen && (
          <Pressable
            style={s.expand}
            accessibilityRole="button"
            accessibilityLabel={`Starsze operacje, ${vm.archiveCount}`}
            onPress={() => setArchiveOpen(true)}
          >
            <Icon name="clock" size={14} color={theme.colors.textMuted} />
            <AppText variant="micro" tone="muted" style={s.expandLabel}>
              Starsze operacje
            </AppText>
            <AppText variant="micro" tone="muted">
              {vm.archiveCount}
            </AppText>
          </Pressable>
        )}

        {archiveOpen && vm != null && (
          <>
            {/* Nagłówek sekcji mówi, CZYM te dni się różnią od tych wyżej - a różnią się
                jedną rzeczą: okno korekty w nich minęło. */}
            <AppText variant="micro" tone="muted" style={s.archiveHead}>
              Tylko do odczytu
            </AppText>
            {vm.archive.map((day) => (
              <DayGroup key={day.day} day={day} onOpen={open} />
            ))}
          </>
        )}

        {/* Instrukcja, nie przypis o budowie aplikacji (issue #72): mówi, CO ZROBIĆ
            z lotem, którego okno już minęło. */}
        {vm != null && !empty && (
          <AppText variant="body" tone="muted" style={s.footNote}>
            Po oknie korekty zmiany wprowadza administrator - zgłoś mu, co poprawić.
          </AppText>
        )}
      </View>
    </Screen>
  );
}

/** Grupa jednej doby: data w nagłówku, operacje pod nią, suma przy kilku wierszach. */
function DayGroup({
  day,
  onOpen,
}: {
  day: HistoryDayVm;
  onOpen: (sessionUuid: string) => void | Promise<void>;
}) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <View style={s.group}>
      <View style={s.groupHead}>
        <AppText variant="micro" tone="muted">
          {day.label}
        </AppText>
      </View>

      {day.ops.map((op) => (
        <OpRow key={op.sessionUuid} op={op} onOpen={onOpen} />
      ))}

      {day.total != null && (
        <View style={s.sumRow}>
          <AppText variant="micro" tone="muted" style={s.sumLabel}>
            Razem
          </AppText>
          <View style={s.nums}>
            {day.total.map((value, i) => (
              <AppText key={i} variant="mono" tone="muted" style={[s.num, s.sumNum]}>
                {value}
              </AppText>
            ))}
          </View>
          {/* Pusta kolumna ikony - suma nie prowadzi nigdzie, ale liczby mają stać
              dokładnie pod liczbami wierszy. */}
          <View style={s.go} />
        </View>
      )}
    </View>
  );
}

/**
 * Zwarty wiersz operacji.
 *
 * Ikona po prawej NIESIE RÓŻNICĘ, którą przedtem niósł pas akcji: ołówek = operacja
 * w oknie korekty, oko = podgląd po oknie (10B). Jest cicha i w stałej kolumnie - to
 * informacja o tym, co się stanie po tapnięciu, a nie drugi cel dotknięcia; celem jest
 * CAŁY wiersz.
 */
function OpRow({
  op,
  onOpen,
}: {
  op: HistoryOpVm;
  onOpen: (sessionUuid: string) => void | Promise<void>;
}) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Pressable
      style={s.op}
      accessibilityRole="button"
      accessibilityLabel={`${op.signature ?? op.aircraft}, ${op.editable ? 'otwórz i popraw' : 'podgląd'}`}
      onPress={() => void onOpen(op.sessionUuid)}
    >
      <View style={s.opMain}>
        <AppText variant="mono" style={s.opHours}>
          {op.times ?? '- -'}
        </AppText>
        {/* Sygnatura zostaje (issue #68): w zwartym wierszu jest jedynym miejscem,
            w którym widać ZNAK maszyny, bo zaczyna się od niego. Własna linia, bo
            identyfikatora nie wolno uciąć wielokropkiem. */}
        <AppText variant="mono" tone="secondary" style={s.opSig}>
          {op.signature ?? op.aircraft}
        </AppText>

        {/* Plakietki WYŁĄCZNIE przy stanie odchylonym (reguła SyncChipa, issue #12):
            zaległość wysyłki, gasnące okno z terminem, wpis ręczny, koniec z panelu.
            „Wysłane" i „można poprawić" nie istnieją - to stany domyślne. */}
        {(op.upload != null ||
          op.deadline != null ||
          op.manual ||
          op.adminClosed ||
          op.club != null) && (
          <View style={s.opTags}>
            {op.upload != null && (
              <Tag label={op.upload.label} tone={op.upload.state === 'sending' ? 'green' : 'blue'} />
            )}
            {op.deadline != null && <Tag label={op.deadline} tone="amber" />}
            {op.manual && <Tag label="Ręcznie" />}
            {/* Klub operacji - WYŁĄCZNIE przy więcej niż jednym członkostwie (regułę
                trzyma `useOperationClub`, nie ten ekran). Plakietka przeniosła się tu
                z kafelka „Mojego dnia" (wariant 01e) razem z listą operacji:
                `rezerwacje.md` §9.1a. Makieta 24 jej nie rysuje - nie ma wariantu
                dwóch klubów - ale bez niej pilot dwóch klubów straciłby ją całkiem. */}
            {op.club != null && <Tag label={op.club} />}
            {op.adminClosed && <Tag label="Zakończył administrator" tone="amber" icon="warning" />}
          </View>
        )}
      </View>

      <View style={s.nums}>
        {op.nums.map((value, i) => (
          <AppText key={i} variant="mono" tone="secondary" style={s.num}>
            {value}
          </AppText>
        ))}
      </View>

      <View style={s.go}>
        <Icon
          name={op.editable ? 'edit' : 'peek'}
          size={14}
          color={op.editable ? theme.colors.blue : theme.colors.borderStrong}
        />
      </View>
    </Pressable>
  );
}

/** Historia bez ani jednej operacji - mówi o WARTOŚCI ekranu, nie o tym, skąd liczy dane. */
function EmptyHistory() {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Card flush>
      <View style={s.empty}>
        <Icon name="aircraft" size={30} color={theme.colors.borderStrong} />
        <AppText variant="display" tone="secondary" style={s.emptyTitle}>
          BRAK OPERACJI
        </AppText>
        <AppText variant="body" tone="muted" style={s.emptyDesc}>
          Po pierwszym locie stanie tu jego komplet: czasy, loty i okno korekty 24 h.
        </AppText>
      </View>
    </Card>
  );
}

/**
 * Stan ŁADOWANIA (issue #33): trzy plamki w geometrii zwartego wiersza.
 *
 * Trzy, nie jedna: lista jest tu z definicji dłuższa niż jedna pozycja, a plamka
 * pojedyncza obiecywałaby ekran, który po chwili skacze o dwa wiersze.
 */
function HistorySkeleton() {
  const { theme } = useTheme();

  return (
    <View accessible accessibilityLabel="Ładowanie" style={{ gap: 6 }}>
      <SkeletonRows rows={3} height={ROW_HEIGHT} radius={theme.radius.btn} gap={6} />
    </View>
  );
}

const styles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 14, gap: 12 },

    group: { gap: 6 },
    groupHead: { paddingHorizontal: 13, paddingBottom: 2 },

    op: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      paddingVertical: 9,
      paddingLeft: 12,
      paddingRight: 10,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    opMain: { flex: 1, gap: 3, minWidth: 0 },
    opHours: { fontSize: 12.5, fontWeight: '700', letterSpacing: 1, color: theme.colors.textPrimary },
    opSig: { fontSize: 9.5, letterSpacing: 0.3 },
    opTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingTop: 1 },

    nums: { flexDirection: 'row' },
    num: { fontSize: 12, fontWeight: '700', textAlign: 'right', width: 46 },
    sumNum: { fontSize: 11 },
    go: { width: 18, alignItems: 'center', justifyContent: 'center' },

    sumRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 13, paddingRight: 11, paddingTop: 2 },
    sumLabel: { flex: 1 },

    expand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 42,
      paddingHorizontal: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.colors.borderStrong,
    },
    expandLabel: { flex: 1 },

    archiveHead: { paddingHorizontal: 13, paddingTop: 4 },
    footNote: { fontSize: 11, lineHeight: 16, paddingHorizontal: 13, paddingTop: 2 },

    empty: { alignItems: 'center', gap: 8, paddingVertical: 26, paddingHorizontal: 20 },
    emptyTitle: { fontSize: 19, lineHeight: 22, letterSpacing: 1.5, textAlign: 'center' },
    emptyDesc: { fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 260 },
  });
