/**
 * UZ Aero — panel: DZIENNIK AUDYTU (`design/admin/A09-audyt.html`).
 *
 * Dziennik zapisuje się od pierwszego przekroju panelu i **nikt go dotąd nie
 * przeczytał** — ten ekran jest jego pierwszym czytelnikiem. Scenariusz, dla którego
 * powstaje, jest konkretny: administrator patrzy na dzień lotny, którego liczby nie
 * zgadzają się z tym, co pamięta pilot, i musi odpowiedzieć na pytanie „kto to ruszał,
 * kiedy i dlaczego". Dlatego wejście z kontekstem (`?typ=event&obiekt=…` z karty dnia
 * i z ekranu korekty) jest wymaganiem, a nie ozdobą — a filtry mieszkają w URL-u,
 * żeby taki link dało się wkleić.
 *
 * Ekran jest `.tsx` BEZ arytmetyki i bez decyzji o treści: każdy napis, plakietka
 * i podpis pochodzą z czystych modułów obok (`auditActions`, `auditFilters`,
 * `auditRows`, `auditDetails`, `auditPages`, `auditTiles`), które mają testy w Node.
 *
 * ══ CZEGO TEN EKRAN ŚWIADOMIE NIE POKAZUJE ══
 *  1. **Logowań do panelu** (`auth.login`, `auth.login_failed` z mockupu) — takich
 *     wpisów NIE MA i nie da się ich udawać: wiersz `admin_audit` powstaje wyłącznie
 *     przez `AuditedWrite`, w tej samej transakcji co SKUTEK, a logowanie skutku nie
 *     ma; nieudane nie ma nawet aktora (`actor_pilot_id NOT NULL`). Ekran mówi to
 *     wprost w karcie „Czego tu nie ma".
 *  2. **Wyszukiwania pełnotekstowego** po nazwisku, rejestracji i adresie IP —
 *     trasa filtruje po DOKŁADNYCH identyfikatorach. Pole wyszukiwania zawęża po
 *     identyfikatorze obiektu i mówi o tym w podpowiedzi.
 *  3. **Chipów aktorów z licznikami** („T. Małkiewicz · 10") — wymagałyby agregatu
 *     `GROUP BY actor`, którego serwer nie wystawia. Zamiast zgadywać: konto zawęża
 *     się kliknięciem w kolumnie „Kto", a chip pokazuje bieżące zawężenie.
 * Wszystkie trzy są opisane na ekranie, nie przemilczane.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useSessionState } from '../../auth/sessionContext';
import { can, denialReason } from '../../auth/can';
import { useAudit, useAuditCount } from '../../queries/useAudit';
import {
  Banner,
  Button,
  Card,
  CellLink,
  Columns,
  DataTable,
  DetailList,
  EmptyState,
  FilterBar,
  FilterChip,
  KeyValue,
  LinkButton,
  NoAccess,
  PageHead,
  Pill,
  SearchInput,
  Tile,
  TileGrid,
  type Column,
} from '../../ui/components';
import { ClockIcon, LockIcon } from '../../ui/components/icons';
import { AUDIT_ACTION_META, AUDIT_ACTIONS, AUDIT_GROUPS } from './auditActions';
import { EMPTY_DETAILS_NOTE } from './auditDetails';
import {
  auditHref,
  auditListQuery,
  filterFromParams,
  isNarrowed,
  paramsFromFilter,
  type AuditFilter,
} from './auditFilters';
import { auditEmpty, auditPages, pagesSummary } from './auditPages';
import { auditRows, type AuditRow } from './auditRows';
import { auditTiles, tileQueries } from './auditTiles';

export function AuditScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useSessionState();

  const allowed = can(session?.capabilities, 'audit.read');
  const filter = filterFromParams(searchParams);

  const entries = useAudit(auditListQuery(filter), allowed);
  // Kafle pytają serwer TYM SAMYM zawężeniem, tylko z podmienionym jednym wymiarem.
  // Policzenie ich z pobranych stron dałoby liczbę, której serwer nigdy nie wysłał.
  const tiles = tileQueries(filter, Date.now());
  const todayCount = useAuditCount(tiles.today, allowed);
  const correctionsCount = useAuditCount(tiles.corrections, allowed);

  // Wpis w wyszukiwarce żyje lokalnie do naciśnięcia Entera: filtrem jest URL, ale
  // przeładowywanie dziennika po każdej literze UUID-a byłoby serią żądań, z których
  // żadne nie ma sensu — trasa dopasowuje identyfikator DOKŁADNIE, nie prefiksem.
  const [targetDraft, setTargetDraft] = useState(filter.targetId ?? '');
  useEffect(() => {
    setTargetDraft(filter.targetId ?? '');
  }, [filter.targetId]);

  if (!allowed) {
    return (
      <NoAccess
        icon={<LockIcon size={22} />}
        title="DZIENNIK AUDYTU"
        reason={denialReason('audit.read')}
        note={
          <>
            Dziennik akcji administratorów czyta wyłącznie administrator — szef wyszkolenia
            rozstrzyga rozbieżności, ale nie nadzoruje cudzych śladów. Ta pozycja nawigacji
            zostaje <b>widoczna</b> właśnie po to, żebyś nie musiał zgadywać, czy funkcji nie
            ma w produkcie, czy nie ma jej Twoje konto.
          </>
        }
      />
    );
  }

  const apply = (next: AuditFilter): void => setSearchParams(paramsFromFilter(next));

  const pages = auditPages(entries.data);
  const rows = auditRows(pages.items);
  const empty = auditEmpty(isNarrowed(filter));

  return (
    <>
      <PageHead
        title="DZIENNIK AUDYTU"
        sub={
          <>
            Każda akcja administratora i szefa wyszkolenia: kto, kiedy (UTC), co i na czym.
            Wpis powstaje <b>tą samą transakcją, co skutek</b> — operacja, której nie udało się
            zaudytować, po prostu nie zachodzi. Rejestr lotniczy jest append-only, więc panel,
            który go dotyka, musi być rozliczalny tak samo.
          </>
        }
        actions={
          <LinkButton
            to=""
            variant="ghost"
            disabled
            reason="serwer nie wystawia trasy eksportu dziennika"
          >
            Eksport CSV
          </LinkButton>
        }
      />

      <Banner tone="danger">
        <b>Wiersze audytu są niezmienne i nieusuwalne.</b> Nie ma tu edycji, kasowania,
        „archiwizuj" ani „wyczyść starsze niż". W całym <code>server/src</code> nie występuje
        ani jedno <code>UPDATE admin_audit</code> ani <code>DELETE FROM admin_audit</code> —
        i pilnuje tego test architektury, a docelowo <code>GRANT INSERT, SELECT</code> dla roli
        aplikacyjnej. Administrator nie może usunąć własnego śladu i to jest cel, nie skutek
        uboczny.
      </Banner>

      <Banner tone="warn">
        <b>Audyt nigdy nie zapisuje wartości hasła.</b> Przy resecie zostaje wyłącznie fakt
        „ustawiono hasło", kto to zrobił, komu i kiedy. Ani hasło, ani jego hash, ani token,
        ani PIN nie mają prawa trafić do kolumny <code>details</code>.
      </Banner>

      <TileGrid>
        {/* Warunkiem „—" jest OBECNOŚĆ danych, nie faza ładowania. `isPending` jest
            `false` także wtedy, gdy pobranie się NIE UDAŁO — a `auditPages` bez
            odpowiedzi oddaje wtedy `total: null`, czyli „nie wiemy". Postawienie tu
            zera kazałoby ekranowi twierdzić, tuż obok banera o błędzie, że w całej
            historii systemu nie było ani jednej akcji administratora. */}
        {auditTiles(
          pages.total,
          todayCount.data,
          correctionsCount.data,
          isNarrowed(filter),
        ).map((tile) => (
          <Tile key={tile.label} label={tile.label} value={tile.value} tone={tile.tone} note={tile.note} />
        ))}
      </TileGrid>

      <FilterBar>
        <SearchInput
          value={targetDraft}
          ariaLabel="Filtruj po identyfikatorze obiektu"
          placeholder={'Identyfikator obiektu: uuid zdarzenia, numer flagi, kod pilota — Enter filtruje'}
          onChange={setTargetDraft}
          onSubmit={() =>
            apply({
              ...filter,
              targetId: targetDraft.trim() === '' ? null : targetDraft.trim(),
            })
          }
        />
        {filter.targetType == null ? null : (
          <FilterChip
            label={`typ: ${filter.targetType} · zdejmij`}
            active
            title="Rodzaj obiektu, na którym wykonano akcję (flag, event, pilot, aircraft…)."
            onClick={() => apply({ ...filter, targetType: null })}
          />
        )}
        {filter.actor == null ? null : (
          <FilterChip
            label={`konto: ${filter.actor} · zdejmij`}
            active
            title="Identyfikator konta, które wykonało akcję. Dopasowanie dokładne."
            onClick={() => apply({ ...filter, actor: null })}
          />
        )}
        {filter.from == null && filter.to == null ? null : (
          <FilterChip
            label={`${filter.from ?? '…'} → ${filter.to ?? '…'} · zdejmij`}
            active
            title="Zakres dat UTC z adresu — panel nie ma jeszcze kalendarza (patrz baner pod tabelą)."
            onClick={() => apply({ ...filter, from: null, to: null })}
          />
        )}
        <span className="list-spacer">
          <Pill tone="blue" dot>
            Wszystkie czasy UTC
          </Pill>
          <Pill tone="dim">{entries.isPending ? 'wczytywanie' : pagesSummary(pages)}</Pill>
        </span>
      </FilterBar>

      <FilterBar>
        <FilterChip
          label="Wszystkie akcje"
          active={filter.scope == null}
          onClick={() => apply({ ...filter, scope: null })}
        />
        {AUDIT_GROUPS.map((group) => (
          <FilterChip
            key={group.id}
            label={group.label}
            active={filter.scope?.kind === 'group' && filter.scope.id === group.id}
            title={`Kody: ${group.actions.join(', ')}`}
            onClick={() => apply({ ...filter, scope: { kind: 'group', id: group.id } })}
          />
        ))}
        {filter.scope?.kind === 'action' ? (
          <FilterChip
            label={`${filter.scope.code} · zdejmij`}
            active
            tone="amber"
            title="Zawężenie do jednej akcji — z kliknięcia w plakietkę w tabeli."
            onClick={() => apply({ ...filter, scope: null })}
          />
        ) : null}
      </FilterBar>

      {entries.isPending ? null : entries.isError ? (
        <Banner tone="danger" live>
          <b>Nie udało się pobrać dziennika.</b> Panel działa wyłącznie online — to jedyne
          miejsce w systemie, w którym brak sieci wolno pokazać jako blokadę.{' '}
          <Button variant="ghost" size="sm" onClick={() => void entries.refetch()}>
            Ponów
          </Button>
        </Banner>
      ) : rows.length === 0 ? (
        <div className="table-wrap">
          <EmptyState icon={<ClockIcon size={22} />} title={empty.title} note={empty.note} />
        </div>
      ) : (
        <>
          <DataTable
            caption="Dziennik audytu — porządek serwera od najnowszego, czasy UTC"
            columns={columns(filter, apply)}
            rows={rows}
            rowKey={(row) => row.id}
          />

          <div className="list-foot">
            <span className="hint">
              {pagesSummary(pages)}{' '}
              {pages.hasMore ? (
                <>
                  Kolejne wpisy dokłada <b>kursor keyset</b>, nie <code>OFFSET</code> —
                  dziennik rośnie w trakcie przeglądania (drugi administrator właśnie coś
                  zmienia), a offset na rosnącej tabeli gubi wiersze i dubluje inne.
                </>
              ) : (
                <>To wszystko, co spełnia bieżące zawężenie.</>
              )}
            </span>
            {pages.hasMore ? (
              <Button
                variant="ghost"
                disabled={entries.isFetchingNextPage}
                onClick={() => void entries.fetchNextPage()}
              >
                {entries.isFetchingNextPage ? 'Wczytywanie…' : 'Pokaż kolejne wpisy'}
              </Button>
            ) : null}
          </div>
        </>
      )}

      <Banner tone="status">
        <b>Czego ten dziennik nie umie wyszukać.</b> Trasa filtruje po <b>dokładnych</b>{' '}
        identyfikatorach: konto, typ i identyfikator obiektu, grupa akcji, zakres dat.
        Nie ma wyszukiwania po nazwisku, rejestracji ani adresie IP i nie ma kalendarza —
        zakres ustawia się z adresu (<code>?od=2026-07-25&amp;do=2026-07-31</code>).
        Sortować da się wyłącznie po czasie, bo kursor keyset jedzie po{' '}
        <code>(created_at, id)</code>; nagłówek, który po kliknięciu nic nie robi, byłby
        gorszy od nagłówka bez strzałki.
      </Banner>

      <Columns>
        <Card
          title="Słownik akcji"
          actions={<Pill tone="dim">kolumna action</Pill>}
        >
          <div className="table-wrap plain">
            <table>
              <caption className="visually-hidden">
                Katalog akcji panelu i to, co każda zapisuje do dziennika
              </caption>
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Akcja</th>
                  <th>Co dokładnie zapisujemy</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {AUDIT_ACTIONS.map((code) => {
                  const meta = AUDIT_ACTION_META[code];
                  return (
                    <tr key={code}>
                      <td>
                        <Pill tone={meta.tone}>{code}</Pill>
                      </td>
                      <td className="dim">{meta.label}</td>
                      <td className="dim">{meta.records}</td>
                      <td>
                        <div className="row-actions">
                          <LinkButton
                            to={auditHref({ ...filter, scope: { kind: 'action', code } })}
                            variant="ghost"
                            size="sm"
                          >
                            Pokaż
                          </LinkButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <span className="hint">
            Katalog jest <b>pełny od początku</b>, choć część akcji nie ma jeszcze ekranu,
            który by je wywoływał — odpowiada na pytanie o ZAKRES panelu, nie o stan wdrożenia
            (<code className="code-ref">server/src/domain/adminActions.ts</code>). Kody są surowe;
            nazwy po polsku i plakietki są własnością panelu, bo serwer nie zna języka interfejsu.
          </span>
        </Card>

        <div className="cols-stack">
          <Card
            title="Tabela admin_audit"
            actions={<Pill tone="green">migracja 9</Pill>}
          >
            <KeyValue label="id" value="BIGSERIAL" unit="PRIMARY KEY" />
            <KeyValue label="created_at" value="TIMESTAMPTZ" unit="NOT NULL · DEFAULT now()" />
            <KeyValue label="actor_pilot_id" value="TEXT" unit="NOT NULL" />
            <KeyValue label="actor_role" value="TEXT" unit="NOT NULL · rola z chwili akcji" />
            <KeyValue label="action" value="TEXT" unit="NOT NULL · bez CHECK-a" />
            <KeyValue label="target_type" value="TEXT" unit="NULL-owalne" />
            <KeyValue label="target_id" value="TEXT" unit="NULL-owalne" />
            <KeyValue label="details" value="JSONB" unit="NOT NULL · DEFAULT '{}'" />
            <KeyValue label="ip" value="TEXT" unit="NULL-owalne" />
            <span className="hint">
              <b>Bez <code>CHECK</code>-a na <code>action</code> i <code>actor_role</code>:</b>{' '}
              wiersz jest zapisem historycznym, więc przemianowanie akcji albo wycofanie roli
              nie może unieważnić tego, co zdarzyło się rok temu. Dlatego ten ekran pokazuje
              nieznany kod <b>dosłownie</b>, zamiast się nim wywrócić. Bez unikalności: dwa
              identyczne wpisy z tej samej sekundy to dwie realne akcje. Bez retencji: dziennik
              nie ma daty ważności.
            </span>
          </Card>

          <Card title="Czego tu nie ma i nie będzie">
            <KeyValue label="Hasła, hashe, PIN-y" value="nigdy" tone="red" />
            <KeyValue label="Tokeny i refresh tokeny" value="nigdy" tone="red" />
            <KeyValue label="Kasowanie i edycja wpisu" value="nigdy" tone="red" />
            <KeyValue label="Logowania do panelu" value="nie powstają" tone="amber" />
            <KeyValue label="Ślad pozycji GPS pilota" value="nie dotyczy" />
            <span className="hint">
              <b>Logowań w tym dzienniku nie ma i to jest granica konstrukcji, nie brak.</b>{' '}
              Wiersz powstaje wyłącznie przez <code>AuditedWrite</code>, w tej samej transakcji
              co skutek — a udane logowanie żadnego skutku w danych nie ma, nieudane nie ma zaś
              nawet aktora (<code>actor_pilot_id NOT NULL</code>). Gdyby te wpisy miały powstawać,
              musiałby to być <b>osobny dziennik bezpieczeństwa</b>, z własną tabelą i własnym
              cyklem życia — i taka jest decyzja do podjęcia, a nie poprawka do tego ekranu.
            </span>
            <span className="hint">
              Audyt opisuje akcje <b>panelu</b>, nie ruch samolotów — to, co robił pilot, jest
              w rejestrze zdarzeń i tam też zostaje na zawsze. Dwa różne dzienniki, dwie różne
              odpowiedzialności; żadnego z nich nie da się posprzątać.
            </span>
          </Card>
        </div>
      </Columns>
    </>
  );
}

/**
 * Kolumny dziennika — dokładnie te z `A09-audyt.html`.
 *
 * Sortowanie dostaje WYŁĄCZNIE kolumna czasu, bo tylko po niej serwer umie stronicować
 * kursorem. Wiersz nie jest klikalny: wpis audytu nie ma ekranu szczegółu, a cała jego
 * treść stoi w kolumnie „Szczegóły" — udawany klik prowadziłby donikąd.
 */
function columns(filter: AuditFilter, apply: (next: AuditFilter) => void): Column<AuditRow>[] {
  return [
    {
      key: 'when',
      header: 'Czas · UTC',
      align: 'num',
      sort: {
        direction: filter.sort,
        onToggle: () => apply({ ...filter, sort: filter.sort === 'desc' ? 'asc' : 'desc' }),
      },
      render: (row) => (
        <>
          {row.when.text}
          <span className="cell-sub">{row.when.sub}</span>
        </>
      ),
    },
    {
      key: 'actor',
      header: 'Kto',
      cellClass: 'cell-strong',
      render: (row) => (
        <>
          {/* Konto zawęża się LINKIEM W TREŚCI, a nie chipem z licznikiem: serwer nie
              wystawia agregatu „ile akcji ma to konto", a plakietka z liczbą policzoną
              z widocznej strony kłamałaby przy każdym obcięciu kursorem. */}
          <CellLink
            to={auditHref({ ...filter, actor: row.actor.pilotId })}
            title={`Pokaż wyłącznie akcje konta ${row.actor.pilotId}`}
          >
            {row.actor.name}
          </CellLink>
          <span className="cell-sub">{row.actor.sub}</span>
        </>
      ),
    },
    {
      key: 'action',
      header: 'Akcja',
      render: (row) => (
        <>
          <Pill tone={row.action.tone}>{row.action.code}</Pill>
          <span className="cell-sub">{row.action.label}</span>
        </>
      ),
    },
    {
      key: 'target',
      header: 'Obiekt',
      cellClass: 'mono',
      render: (row) =>
        row.target.link == null ? (
          <>
            {row.target.text}
            <span className="cell-sub">{row.target.sub}</span>
          </>
        ) : (
          <>
            <CellLink
              to={auditHref({
                ...filter,
                targetType: row.target.link.targetType,
                targetId: row.target.link.targetId,
              })}
              title={`Pokaż wszystko, co robiono na obiekcie ${row.target.link.targetId}`}
            >
              {row.target.text}
            </CellLink>
            <span className="cell-sub">{row.target.sub}</span>
          </>
        ),
    },
    {
      key: 'details',
      header: 'Szczegóły',
      render: (row) => <DetailList items={row.details} empty={EMPTY_DETAILS_NOTE} />,
    },
    {
      key: 'ip',
      header: 'Adres IP',
      align: 'num',
      cellClass: 'dim',
      render: (row) => (
        <>
          {row.ip.text}
          {row.ip.offline ? (
            <span className="cell-sub">akcja spoza żądania HTTP</span>
          ) : null}
        </>
      ),
    },
  ];
}
