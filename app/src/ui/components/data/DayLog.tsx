/**
 * UZ Aero — DayLog (mockup 04 `.cycle-head` + `.cycle-body`, wzorzec 2026-08-04)
 *
 * Log dnia z cyklami zwijanymi w harmonijkę: zamknięty cykl to jeden wiersz
 * nagłówka — CYKL n · zakres czasów · n T/O · blok · MH po cyklu — a zdarzenia
 * naziemne między cyklami (tankowanie, zmiana załogi, wpis ręczny) stoją zawsze
 * na wierzchu, bo nie należą do żadnego cyklu.
 *
 * Cykl OTWARTY (silnik pracuje — widok 04b cudzej maszyny) jest zawsze rozwinięty
 * i nie daje się zwinąć: trwającego przebiegu nie chowamy.
 *
 * `initiallyExpanded`: kokpit (04) rozwija ostatni cykl — to świeża pamięć dnia;
 * podgląd (04b) startuje z całością zwiniętą — szybki rzut oka, nie praca na logu.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { toneColors } from '../tone';
import { EventLog, type EventLogRow } from './EventLog';

/** Nagłówek cyklu w logu dnia (mockup 04 `.cycle-head`). */
export interface DayCycleSection {
  kind: 'cycle';
  /** UUID zdarzenia `engine_start` — stabilny klucz stanu zwinięcia. */
  id: string;
  no: number;
  /** „08:12–10:34"; cykl otwarty: „08:12–…". */
  range: string;
  takeoffs: number;
  /** Adnotacja wiersza STOP („blok 2:22") — null, póki cykl trwa. */
  block: string | null;
  closed: boolean;
  /** Cokolwiek w środku czeka na wysyłkę — znacznik nie znika pod zwinięciem. */
  pending: boolean;
  rows: EventLogRow[];
}

/** Wiersz poza cyklami (tankowanie, zmiana załogi…) — nigdy się nie zwija. */
export interface DayLooseSection {
  kind: 'loose';
  row: EventLogRow;
}

export type DaySection = DayCycleSection | DayLooseSection;

export interface DayLogProps {
  sections: DaySection[];
  /** 'last' — ostatni cykl rozwinięty (04) · 'none' — wszystko zwinięte (04b). */
  initiallyExpanded?: 'last' | 'none';
  emptyText?: string;
  style?: ViewStyle;
}

export function DayLog({
  sections,
  initiallyExpanded = 'last',
  emptyText = 'Brak zdarzeń.',
  style,
}: DayLogProps) {
  const { theme } = useTheme();

  const lastCycleId =
    [...sections].reverse().find((s): s is DayCycleSection => s.kind === 'cycle')?.id ?? null;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(initiallyExpanded === 'last' && lastCycleId != null ? [lastCycleId] : []),
  );

  if (sections.length === 0) {
    return (
      <View style={[{ padding: theme.spacing.md, alignItems: 'center' }, style]}>
        <AppText variant="body" tone="muted">
          {emptyText}
        </AppText>
      </View>
    );
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <View style={style}>
      {sections.map((s) =>
        s.kind === 'loose' ? (
          <EventLog key={s.row.id} rows={[s.row]} />
        ) : (
          <CycleSection
            key={s.id}
            section={s}
            open={!s.closed || expanded.has(s.id)}
            onToggle={() => toggle(s.id)}
          />
        ),
      )}
    </View>
  );
}

function CycleSection({
  section,
  open,
  onToggle,
}: {
  section: DayCycleSection;
  open: boolean;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const green = toneColors(theme, 'green');
  const sum = `${section.takeoffs} T/O · ${section.block ?? 'w toku'}`;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !section.closed }}
        accessibilityLabel={`Cykl ${section.no}, ${section.range}, ${sum}`}
        disabled={!section.closed}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.head,
          {
            borderBottomWidth: theme.borderWidth,
            borderBottomColor: theme.colors.border,
            // `.cycle-head.open` — akcent 5% alfy (jak tinty ParamGrid); akcenty
            // motywów są 6-cyfrowym hexem, więc kanał alfa można dosztukować.
            backgroundColor: open ? `${green.accent}0D` : 'transparent',
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Icon
          name="more"
          size={12}
          color={open ? green.accent : theme.colors.textMuted}
          style={open ? styles.chevOpen : null}
        />
        <AppText variant="mono" style={[styles.no, { fontFamily: theme.fontFamily.monoBold }]}>
          CYKL {section.no}
        </AppText>
        <AppText variant="mono" tone="secondary" style={styles.range}>
          {section.range}
        </AppText>
        <View style={styles.spacer} />
        <AppText variant="mono" tone="muted" style={styles.sum}>
          {sum}
        </AppText>
        {section.pending && (
          <AppText
            variant="mono"
            tone="amber"
            accessibilityLabel="Czeka na wysyłkę"
            style={styles.sum}
          >
            ↑
          </AppText>
        )}
      </Pressable>

      {open && <EventLog rows={section.rows} />}
    </>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  chevOpen: { transform: [{ rotate: '90deg' }] },
  no: { fontSize: 11, letterSpacing: 1 },
  range: { fontSize: 10, letterSpacing: 0.5 },
  spacer: { flex: 1 },
  sum: { fontSize: 9, letterSpacing: 0.5 },
});
