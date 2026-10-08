/**
 * Ninerdeck - panel: SZUFLADA GRUPY (makieta `piloci-grupy`, P5, P5a, P5b; 4.0.0,
 * epik Z-D #248; `docs/zlecenia.md` §6.1).
 *
 * NAZWA I OBSADA - nic więcej. Trzy postaci jednej szuflady:
 *  - EDYCJA (administrator, „Konta pilotów"): pole nazwy, obsada kartami wielokrotnego
 *    wyboru z wyszukiwarką, zdanie o skutku składu, karta usunięcia na końcu;
 *  - NOWA GRUPA: to samo bez karty usunięcia, z „Utwórz grupę";
 *  - PODGLĄD (bez „Kont pilotów"): skład jako zwykła lista wierszy, bez pól, bez stopki
 *    i bez usunięcia - brak uprawnienia znaczy brak przycisku.
 *
 * ══ ZAPIS ZABLOKOWANY BEZ ZDANIA ══
 * Pusta nazwa i brak zmian widać z formularza tuż nad przyciskiem (issue #55), więc
 * przycisk gaśnie bez dopisku. Odmowę serwera mówi miejsce, którego dotyczy: nazwa zajęta
 * pod polem nazwy, osoba spoza aktywnych członków w karcie obsady.
 *
 * ══ USUNIĘCIE PYTA W MIEJSCU KLIKNIĘCIA ══
 * Bez osobnego okna, wzorzec `.confirm` z karty kodu klubu. Zdanie mówi dokładnie to, o co
 * administrator się martwi: wysłane zlecenia zostają nietknięte, bo ich adresaci są
 * zapisani imiennie (§6.1).
 */

import { useState } from 'react';

import type { DirectoryDto, GroupDto } from '../../api/dto';
import { useCreateGroup, useDeleteGroup, useUpdateGroup } from '../../queries/useGroups';
import { Button, Card, Drawer, Field, OptionButton, TextInput } from '../../ui/components';
import { SearchIcon } from '../../ui/components/icons';
import { errorMessage } from '../common/apiMessage';
import { NONE } from '../common/values';
import {
  draftOf,
  EMPTY_GROUP,
  GROUP_NAME_MAX,
  groupBlocked,
  groupPatch,
  memberOptions,
  newGroup,
  toggleMember,
  type GroupDraft,
} from './groupForm';
import { groupRefusalMessage, groupRefusalOf } from './groupRefusal';
import { groupMembers, groupSub } from './groupRows';

interface Props {
  /** Grupa z listy albo `null` = nowa. */
  group: GroupDto | null;
  directory: DirectoryDto | undefined;
  manages: boolean;
  onClose: () => void;
}

export function GroupDrawer({ group, directory, manages, onClose }: Props) {
  if (!manages && group != null) return <GroupPreview group={group} directory={directory} onClose={onClose} />;
  return <GroupForm group={group} directory={directory} onClose={onClose} />;
}

/** Podgląd bez „Kont pilotów" (P5b) - skład jako lista wierszy, bez niczego do kliknięcia. */
function GroupPreview({ group, directory, onClose }: { group: GroupDto; directory: DirectoryDto | undefined; onClose: () => void }) {
  const members = groupMembers(group.memberIds, directory);
  return (
    <Drawer title={group.name} sub={groupSub(members)} onClose={onClose}>
      <Card title="Członkowie">
        {members.length === 0 ? (
          <p className="card-note">Grupa nie ma jeszcze członków.</p>
        ) : (
          members.map((m) => (
            <div className="kv" key={m.id}>
              <span className="kv-k">{m.name}</span>
              <span className="kv-v">
                {m.active ? m.code : <small>{`${m.code ?? NONE} · członkostwo wyłączone`}</small>}
              </span>
            </div>
          ))
        )}
      </Card>
    </Drawer>
  );
}

function GroupForm({ group, directory, onClose }: { group: GroupDto | null; directory: DirectoryDto | undefined; onClose: () => void }) {
  // Szkic startuje z grupy RAZ - szuflada montuje się z kluczem grupy, więc zmiana adresu
  // daje świeży szkic, a odświeżenie listy po zapisie go nie kasuje.
  const [draft, setDraft] = useState<GroupDraft>(() => (group == null ? EMPTY_GROUP : draftOf(group)));
  const [pinned] = useState<readonly string[]>(() => group?.memberIds ?? []);
  const [id] = useState(() => crypto.randomUUID());
  const [query, setQuery] = useState('');
  const [removing, setRemoving] = useState(false);

  const create = useCreateGroup();
  const update = useUpdateGroup();
  const remove = useDeleteGroup();
  const saving = create.isPending || update.isPending || remove.isPending;
  const saveError = create.error ?? update.error;
  const refusal = groupRefusalOf(saveError);

  const options = memberOptions(directory, draft, pinned, query);
  const blocked = groupBlocked(group, draft);

  const save = (): void => {
    if (group == null) {
      create.mutate(newGroup(id, draft), { onSuccess: onClose });
      return;
    }
    const patch = groupPatch(group, draft);
    if (patch == null) return;
    update.mutate({ id: group.id, patch }, { onSuccess: onClose });
  };

  return (
    <Drawer
      title={group == null ? 'Nowa grupa' : group.name}
      sub={group == null ? undefined : groupSub(groupMembers(group.memberIds, directory))}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Anuluj
          </Button>
          <Button variant="primary" onClick={save} disabled={blocked || saving}>
            {saving ? 'Zapisywanie…' : group == null ? 'Utwórz grupę' : 'Zapisz'}
          </Button>
        </>
      }
    >
      <Card title="Grupa">
        <Field htmlFor="group-name" label="Nazwa">
          <TextInput
            id="group-name"
            value={draft.name}
            maxLength={GROUP_NAME_MAX}
            placeholder="Np. Piloci skokowi"
            invalid={refusal === 'name_taken'}
            onChange={(e) => {
              // Odmowa dotyczyła nazwy sprzed poprawki - zdanie pod polem nie może jej przeżyć.
              if (refusal === 'name_taken') {
                create.reset();
                update.reset();
              }
              setDraft({ ...draft, name: e.target.value });
            }}
          />
          {refusal === 'name_taken' ? <span className="hint danger">{groupRefusalMessage('name_taken')}</span> : null}
        </Field>
      </Card>

      <Card title="Członkowie">
        <label className="search" style={{ maxWidth: 'none' }}>
          <SearchIcon size={13} />
          <input
            value={query}
            placeholder="Szukaj członka: nazwisko albo kod"
            aria-label="Szukaj członka klubu"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="opt-list" role="group" aria-label={group == null ? 'Członkowie nowej grupy' : `Członkowie grupy ${group.name}`}>
          {options.map((o) => (
            <OptionButton
              key={o.id}
              multiple
              name={o.name}
              desc={o.desc}
              selected={o.selected}
              dim={o.dim}
              onSelect={() => setDraft({ ...draft, memberIds: toggleMember(draft.memberIds, o.id) })}
            />
          ))}
        </div>
        <p className="hint">Zlecenie wysłane do grupy trafia do jej aktywnych członków - w składzie z chwili wysłania.</p>
        {saveError == null || refusal === 'name_taken' ? null : (
          <p className="card-note danger">
            {refusal === 'member_not_in_org' ? groupRefusalMessage(refusal) : errorMessage(saveError)}
          </p>
        )}
      </Card>

      {group == null ? null : (
        <Card title="Usunięcie grupy" tone="danger">
          {removing ? (
            <div className="confirm" style={{ marginTop: 0 }}>
              <p className="confirm-q">{`Usunąć grupę: ${group.name}?`}</p>
              <p className="hint">Wysłane zlecenia zostają bez zmian. Grupa zniknie z wyboru adresatów w nowych zleceniach.</p>
              <div className="confirm-actions">
                <Button variant="ghost" size="sm" onClick={() => setRemoving(false)} disabled={saving}>
                  Nie
                </Button>
                <Button variant="danger" size="sm" onClick={() => remove.mutate(group.id, { onSuccess: onClose })} disabled={saving}>
                  Usuń grupę
                </Button>
              </div>
              {remove.error == null ? null : <p className="hint danger">{errorMessage(remove.error)}</p>}
            </div>
          ) : (
            <>
              <p className="card-note">
                Wysłane zlecenia zostają bez zmian - ich adresaci dostali je imiennie. Grupa zniknie z wyboru adresatów.
              </p>
              <Button variant="danger" onClick={() => setRemoving(true)} disabled={saving}>
                Usuń grupę
              </Button>
            </>
          )}
        </Card>
      )}
    </Drawer>
  );
}
