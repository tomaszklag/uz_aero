/**
 * Ninerdeck - treść podglądu pilota (26A) i samolotu (26B) przy decyzji (issue #206).
 *
 * JEDEN komponent dla obu ekranów, bo makiety rysują ten sam układ: podtytuł, karty
 * „etykieta → wartość" pod mikro-etykietami sekcji, tabela ostatnich lotów, lista
 * najbliższych terminów. Różnią się WYŁĄCZNIE treścią, którą składa
 * `screens/logic/previewRows.ts` - gdyby każdy ekran rysował się sam, pierwsza poprawka
 * jednego rozjechałaby oba, a ta sama decyzja czytałaby się inaczej o pilocie niż
 * o maszynie.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { PreviewVm } from '../../screens/logic/previewRows';
import { useTheme, type Theme } from '../../theme';
import { AppText } from '../foundation/AppText';
import { Icon } from '../foundation/Icon';
import { Card } from '../layout/Card';
import { GroupLabel } from '../layout/GroupLabel';
import { DataTable } from './DataTable';
import { KeyValueRow } from './KeyValueRow';

const KIEDY_W = 62;
const BLOK_W = 52;

export function PreviewBody({ vm }: { vm: PreviewVm }) {
  return (
    <>
      <GroupLabel text={vm.sub} />

      {vm.groups.map((group) => (
        <React.Fragment key={group.label}>
          <GroupLabel text={group.label} />
          <Card>
            {group.rows.map((row) => (
              <KeyValueRow
                key={row.label}
                label={row.label}
                value={row.value}
                sub={row.sub}
                valueTone={row.tone === 'amber' ? 'amber' : 'secondary'}
              />
            ))}
          </Card>
        </React.Fragment>
      ))}

      <GroupLabel text={vm.recent.label} />
      <Card flush>
        <DataTable
          columns={[
            { label: vm.recent.columns[0] ?? 'Kiedy', width: KIEDY_W },
            { label: vm.recent.columns[1] ?? '' },
            { label: vm.recent.columns[2] ?? 'Zadanie' },
            { label: vm.recent.columns[3] ?? 'Blok', width: BLOK_W },
          ]}
          rows={vm.recent.rows.map((row) => ({
            id: row.id,
            cells: row.cells.map((text) => ({ text })),
          }))}
          emptyText={vm.recent.empty}
        />
      </Card>

      <GroupLabel text={vm.upcoming.label} />
      <Card>
        {vm.upcoming.rows.length === 0 ? (
          <AppText variant="body" tone="muted">
            Poza tą sprawą nic nie stoi w kalendarzu.
          </AppText>
        ) : (
          vm.upcoming.rows.map((row) => (
            <KeyValueRow
              key={`${row.label} ${row.value}`}
              label={row.label}
              value={row.value}
              sub={row.sub}
              valueTone={row.tone === 'amber' ? 'amber' : 'secondary'}
            />
          ))
        )}
      </Card>
    </>
  );
}

/**
 * Stan „nie wiadomo TERAZ" - offline, odmowa albo sprawa, której już nie ma. Bez
 * pustych zer: zero lotów pokazane pilotowi z trzema operacjami wyglądałoby jak fakt.
 */
export function PreviewMissing({ what }: { what: string }) {
  const { theme } = useTheme();
  const s = styles(theme);

  return (
    <Card flush>
      <View style={s.missing}>
        <Icon name="offline" size={30} color={theme.colors.amber} />
        <AppText variant="display" style={s.missingTitle}>
          BRAK PODGLĄDU
        </AppText>
        <AppText variant="body" style={s.missingText}>
          Podgląd {what} składa serwer. Wróć na ten ekran z zasięgiem.
        </AppText>
      </View>
    </Card>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    missing: { alignItems: 'center', gap: 10, padding: 22 },
    missingTitle: { fontSize: 22, letterSpacing: 2, color: t.colors.amber, textAlign: 'center' },
    missingText: { fontSize: 13, lineHeight: 19, color: t.colors.textSecondary, textAlign: 'center' },
  });
