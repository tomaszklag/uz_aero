/**
 * UZ Aero — panel: PILOCI I KONTA (`design/admin/A06-piloci.html`).
 *
 * ══ DLACZEGO TEN EKRAN POWSTAJE ══
 * 2026-08-01 administrator nie mógł wejść do systemu, bo w całym produkcie nie było
 * ŻADNEJ ścieżki zmiany hasła: seed z założenia nie nadpisuje `password_hash`, CLI nie
 * ma, panelu kont nie było. Jedynym wyjściem był ręczny `UPDATE` z hashem policzonym
 * poza aplikacją — operacja bez śladu i bez świadka. Ten ekran to zamyka.
 *
 * Drugi scenariusz jest równie konkretny: pilot odchodzi z klubu, administrator klika
 * „Deaktywuj" i **musi mieć pewność, że dostęp naprawdę zniknął** — nie „zniknie
 * w ciągu ośmiu godzin". Dlatego serwer czyta rolę i status konta przy KAŻDYM żądaniu
 * panelu, a deaktywacja zrywa wszystkie sesje pilota w tej samej transakcji.
 *
 * Szuflada konta (`A06a`) otwiera się NAD listą pod adresem `#/piloci/<id>` — lista
 * zostaje pod spodem, bo decyzja o roli zapada w porównaniu z resztą kont.
 *
 * Ekran jest `.tsx` BEZ arytmetyki i bez decyzji o treści: plakietki, napisy, liczniki
 * i dostępność akcji pochodzą z czystych modułów obok (`pilociFilters`, `pilociRows`,
 * `pilociTiles`, `kontoActions`), które mają testy w Node.
 *
 * ══ CZEGO TEN EKRAN ŚWIADOMIE NIE POKAZUJE ══
 * **Kolumny „Ostatnie logowanie"** z mockupu. Tabela `pilots` nie ma takiej kolumny
 * i nikt jej nie zapisuje; policzenie jej z `refresh_tokens` dałoby „ostatnią rotację
 * sesji telefonu", czyli inną wielkość pod tą samą etykietą. Zamiast zgadywać, ekran
 * pokazuje datę ZMIANY wiersza konta i mówi o różnicy wprost.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import type { Capability } from '../../api/dto';
import { can, denialReason } from '../../auth/can';
import { useSessionState } from '../../auth/sessionContext';
import { usePilots } from '../../queries/usePilots';
import {
  Banner,
  Button,
  Card,
  Columns,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  KeyValue,
  LinkButton,
  PageHead,
  Pill,
  SearchInput,
  Tile,
  TileGrid,
  type Column,
} from '../../ui/components';
import { PeopleIcon } from '../../ui/components/icons';
import { KontoDrawer } from './KontoDrawer';
import { activeAction, canManage, resetAction } from './kontoActions';
import { pilotChips } from './pilociChips';
import {
  DEFAULT_PILOCI_FILTER,
  NEW_ACCOUNT_SEGMENT,
  accountsAuditHref,
  filterFromParams,
  isNarrowed,
  kontoHref,
  noweKontoHref,
  paramsFromFilter,
  pilotListQuery,
  type PilociFilter,
} from './pilociFilters';
import { pilociEmpty, pilotRows, type PilotRow } from './pilociRows';
import { monthLabel, pilotTiles, roleSplit, roleSplitCaption } from './pilociTiles';

export function PilociScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useSessionState();

  const filter = filterFromParams(searchParams);
  const pilots = usePilots(pilotListQuery(filter));

  // Wpis w wyszukiwarce żyje lokalnie do naciśnięcia Entera: filtrem jest URL, ale
  // przeładowywanie listy po każdej literze nazwiska byłoby serią żądań, z których
  // żadne nie jest tym, o które pyta człowiek.
  const [searchDraft, setSearchDraft] = useState(filter.search ?? '');
  useEffect(() => {
    setSearchDraft(filter.search ?? '');
  }, [filter.search]);

  const apply = (next: PilociFilter): void => setSearchParams(paramsFromFilter(next));

  const counts = pilots.data?.counts ?? null;
  // Kafle biorą `counts` (cały klub), chipy — `scopes` (zawężone WYSZUKIWANIEM). To są
  // dwa różne pytania i dwie różne liczby na jednym ekranie; chip z liczbą jest
  // obietnicą „tyle zobaczysz po kliknięciu", a kafel opisem klubu (`pilociChips.ts`).
  const scopes = pilots.data?.scopes ?? null;
  const items = pilots.data?.items ?? [];
  const rows = pilotRows(items);
  const empty = pilociEmpty(isNarrowed(filter));
  const daysWindow = monthLabel(pilots.data?.daysFrom, pilots.data?.daysTo);

  const capabilities = session?.capabilities;
  const manage = canManage(capabilities);
  const selfId = session?.pilot.id ?? null;

  /** Zamknięcie szuflady zdejmuje z adresu konto, ale ZOSTAWIA zawężenie listy. */
  const closeDrawer = (): void => {
    void navigate({ pathname: '/piloci', search: new URLSearchParams(paramsFromFilter(filter)).toString() });
  };

  const openedNew = id === NEW_ACCOUNT_SEGMENT;
  const opened = id == null || openedNew ? null : (items.find((item) => item.id === id) ?? null);

  return (
    <>
      <PageHead
        title="PILOCI I KONTA"
        sub={
          <>
            Konta zakłada tu administrator — aplikacja nie ma samodzielnej rejestracji. Kod
            pilota, rola i status decydują o tym, co pilot widzi na telefonie i kto w ogóle
            wejdzie do panelu.
          </>
        }
        actions={
          <>
            <LinkButton
              to={accountsAuditHref()}
              variant="ghost"
              disabled={!can(capabilities, 'audit.read')}
              reason={denialReason('audit.read')}
            >
              Historia zmian
            </LinkButton>
            <LinkButton
              to={noweKontoHref(filter)}
              variant="primary"
              disabled={!manage}
              reason={denialReason('accounts.manage')}
            >
              Nowe konto
            </LinkButton>
          </>
        }
      />

      <Banner tone="status">
        <b>Sekcja administratora.</b> Zakładanie kont, reset hasła i deaktywacja są dostępne
        wyłącznie dla roli <code>administrator</code>. Szef wyszkolenia widzi tę listę, ale bez
        przycisków — potrzebuje jej do statystyk i flag, nie do zarządzania dostępem. Przyciski
        zostają <b>widoczne i zablokowane z powodem</b>, bo ukrycie zmuszałoby do zgadywania,
        czy funkcji nie ma w produkcie, czy nie ma jej Twoje konto.
      </Banner>

      <TileGrid>
        {pilotTiles(counts, daysWindow).map((tile) => (
          <Tile
            key={tile.label}
            label={tile.label}
            value={tile.value}
            note={tile.note}
            {...(tile.unit == null ? {} : { unit: tile.unit })}
            {...(tile.tone == null ? {} : { tone: tile.tone })}
          />
        ))}
      </TileGrid>

      <FilterBar>
        <SearchInput
          value={searchDraft}
          ariaLabel="Szukaj konta"
          placeholder={'Szukaj: nazwisko, kod pilota, e-mail — Enter filtruje'}
          onChange={setSearchDraft}
          onSubmit={() =>
            apply({ ...filter, search: searchDraft.trim() === '' ? null : searchDraft.trim() })
          }
        />
        {pilotChips(scopes).map((chip) => (
          <FilterChip
            key={chip.scope}
            label={chip.label}
            {...(chip.count == null ? {} : { count: chip.count })}
            active={filter.scope === chip.scope}
            onClick={() => apply({ ...filter, scope: chip.scope })}
          />
        ))}
        <span className="list-spacer">
          <Pill tone="blue" dot>
            Wszystkie czasy UTC
          </Pill>
        </span>
      </FilterBar>

      {pilots.isPending ? null : pilots.isError ? (
        <Banner tone="danger" live>
          <b>Nie udało się pobrać listy kont.</b> Panel działa wyłącznie online — to jedyne
          miejsce w systemie, w którym brak sieci wolno pokazać jako blokadę.{' '}
          <Button variant="ghost" size="sm" onClick={() => void pilots.refetch()}>
            Ponów
          </Button>
        </Banner>
      ) : rows.length === 0 ? (
        <div className="table-wrap">
          <EmptyState icon={<PeopleIcon size={22} />} title={empty.title} note={empty.note} />
        </div>
      ) : (
        <DataTable
          caption="Konta pilotów — nieaktywne na końcu, czasy UTC"
          columns={columns(filter, apply, capabilities, selfId, daysWindow)}
          rows={rows}
          rowKey={(row) => row.id}
          rowClass={(row) => (row.id === id ? 'opened' : row.dim ? 'dim' : undefined)}
          onRowClick={(row) => {
            void navigate(kontoHref(filter, row.id));
          }}
        />
      )}

      <Banner tone="warn">
        <b>Kolumny „Ostatnie logowanie" tu nie ma i to nie jest przeoczenie.</b> Tabela{' '}
        <code>pilots</code> nie ma takiej kolumny, a serwer jej nie zapisuje — wyliczenie jej
        z <code>refresh_tokens</code> dałoby „ostatnią rotację sesji telefonu", czyli inną
        wielkość pod tą samą etykietą. Kolumna <b>Zmieniono</b> mówi, kiedy ruszono wiersz
        konta; <b>co</b> wtedy zmieniono, wie dziennik audytu.
      </Banner>

      <Columns>
        <Card title="Co edycja konta zmienia, a czego nie">
          <span className="hint">
            <b>Deaktywacja ≠ usunięcie.</b> Konto nieaktywne nie zaloguje się w aplikacji ani
            w panelu, a jego <b>aktywne sesje są zrywane natychmiast</b> — ale{' '}
            <b>jego zdarzenia zostają w rejestrze</b> (append-only) i dalej liczą się
            w statystykach oraz w wyeksportowanych kartach dnia.
          </span>
          <span className="hint">
            <b>Kod pilota jest etykietą, nie kluczem.</b> Zdarzenia wiążą się z{' '}
            <code>id</code> konta, więc zmiana kodu nie przepisuje historii — ale w kartach
            wyeksportowanych wcześniej zostaje stary kod. Zmieniaj świadomie.
          </span>
          <span className="hint">
            <b>Rola dotyczy tylko panelu.</b> Administrator i szef wyszkolenia latają na tych
            samych zasadach co pilot; rola nie daje żadnych uprawnień w aplikacji na telefonie.
          </span>
          <span className="hint">
            <b>Odebranie dostępu działa natychmiast.</b> Panel czyta rolę i status konta przy
            KAŻDYM żądaniu, a nie z 8-godzinnego tokenu sesji — inaczej przycisk „Deaktywuj"
            obiecywałby coś, co dzieje się dopiero pod wieczór.
          </span>
        </Card>

        <div className="cols-stack">
          <Card
            title="Rola w panelu"
            actions={<Pill tone="dim">{roleSplitCaption(counts)}</Pill>}
          >
            {roleSplit(counts).map((row) => (
              <KeyValue
                key={row.label}
                label={row.label}
                value={row.value}
                {...(row.tone == null ? {} : { tone: row.tone })}
              />
            ))}
            <span className="hint">
              Szef wyszkolenia widzi pulpit, dni lotne, flagi, zdarzenia i statystyki. Nie
              zmienia kont ani progów detekcji, i nie czyta dziennika audytu.
            </span>
          </Card>

          <Card title="Hasło startowe — jak to działa">
            <KeyValue label="Kto generuje" value="serwer" unit="panel nigdy go nie wysyła" />
            <KeyValue label="Ile razy widoczne" value="raz" tone="amber" unit="w szufladzie" />
            <KeyValue label="W bazie" value="hash" unit="scrypt, nigdy wartość" />
            <KeyValue label="W audycie" value="sam fakt" unit="kto, komu, kiedy" />
            <span className="hint">
              Nie ma trasy „pokaż hasło ponownie" — jedynym wyjściem jest kolejny reset, który
              generuje nowe hasło i zrywa wszystkie sesje pilota.
            </span>
          </Card>
        </div>
      </Columns>

      {id == null ? null : (
        <KontoDrawer
          /**
           * KLUCZ = identyfikator konta z adresu. Bez niego przejście `/piloci/A` →
           * `/piloci/B` zostawiało zamontowaną szufladę A: React widział ten sam
           * komponent w tym samym miejscu drzewa, więc szkic formularza i — co gorsza —
           * WYGENEROWANE HASŁO przeżywały zmianę konta i wyświetlały się pod cudzym
           * nagłówkiem. Klucz wymusza montaż od nowa, czyli stan zawsze należący
           * do konta, które jest w adresie.
           */
          key={id}
          pilot={opened}
          creating={openedNew}
          /** `akcja=haslo` z wiersza „Reset hasła" (mockup A06a: tożsamość zablokowana). */
          passwordMode={searchParams.get('akcja') === 'haslo'}
          capabilities={capabilities}
          selfId={selfId}
          loading={pilots.isPending}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}

/**
 * Kolumny listy kont — z mockupu `A06`, z jedną świadomą zamianą: „Ostatnie logowanie"
 * na „Zmieniono" (uzasadnienie w nagłówku pliku i w banerze pod tabelą).
 *
 * Sortowanie dostaje WYŁĄCZNIE kolumna nazwiska, bo tylko po niej serwer umie sortować.
 * Nagłówek, który po kliknięciu nic nie robi, jest gorszy od nagłówka bez strzałki.
 */
function columns(
  filter: PilociFilter,
  apply: (next: PilociFilter) => void,
  capabilities: readonly Capability[] | undefined,
  selfId: string | null,
  daysWindow: string,
): Column<PilotRow>[] {
  return [
    { key: 'code', header: 'Kod', cellClass: 'mono cell-strong', render: (row) => row.code },
    {
      key: 'name',
      header: 'Imię i nazwisko',
      cellClass: 'cell-strong',
      sort: {
        direction: filter.sort,
        onToggle: () => apply({ ...filter, sort: filter.sort === 'asc' ? 'desc' : 'asc' }),
      },
      render: (row) => row.name,
    },
    { key: 'email', header: 'E-mail', cellClass: 'mono dim', render: (row) => row.email },
    {
      key: 'role',
      header: 'Rola',
      render: (row) => <Pill tone={row.role.tone}>{row.role.text}</Pill>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Pill tone={row.status.tone} dot={row.status.dot}>
          {row.status.text}
        </Pill>
      ),
    },
    {
      key: 'changed',
      header: 'Zmieniono · UTC',
      align: 'num',
      cellClass: 'dim',
      render: (row) => row.changed,
    },
    {
      key: 'days',
      header: (
        <>
          Dni lotne
          <br />
          {daysWindow}
        </>
      ),
      align: 'num',
      render: (row) => row.flyingDays,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => {
        const reset = resetAction(row.dto, capabilities);
        const active = activeAction(row.dto, capabilities, selfId);
        return (
          <div className="row-actions">
            <LinkButton to={kontoHref(filter, row.id)} variant="ghost" size="sm">
              Szczegóły
            </LinkButton>
            <LinkButton
              to={kontoHref(filter, row.id, 'haslo')}
              variant="ghost"
              size="sm"
              disabled={!reset.enabled}
              {...(reset.reason == null ? {} : { reason: reset.reason })}
            >
              Reset hasła
            </LinkButton>
            {/* Deaktywacja i aktywacja są w SZUFLADZIE, nie w wierszu: to jedyne
                operacje tego ekranu, które odbierają albo przywracają dostęp, a wiersz
                tabeli nie ma miejsca na wyjaśnienie skutków (zerwane sesje, PIN od nowa).
                Link prowadzi tam, gdzie stoi opis i potwierdzenie. */}
            <LinkButton
              to={kontoHref(filter, row.id)}
              variant={row.dim ? 'ok' : 'danger'}
              size="sm"
              disabled={!active.enabled}
              {...(active.reason == null ? {} : { reason: active.reason })}
            >
              {row.dim ? 'Aktywuj' : 'Deaktywuj'}
            </LinkButton>
          </div>
        );
      },
    },
  ];
}
