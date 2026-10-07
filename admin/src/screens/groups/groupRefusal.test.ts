import { describe, expect, it } from 'vitest';

import { HttpError } from '../../api/httpClient';
import { groupRefusalMessage, groupRefusalOf } from './groupRefusal';

describe('odmowa zapisu grupy', () => {
  it('kod z pola `error` odpowiedzi - nazwa zajęta (409) i osoba spoza klubu (400)', () => {
    expect(groupRefusalOf(new HttpError(409, { error: 'name_taken' }))).toBe('name_taken');
    expect(groupRefusalOf(new HttpError(400, { error: 'member_not_in_org' }))).toBe('member_not_in_org');
  });

  it('inne odpowiedzi i awaria sieci to nie odmowa grupy', () => {
    expect(groupRefusalOf(new HttpError(400, { error: 'bad_request' }))).toBeNull();
    expect(groupRefusalOf(new TypeError('Failed to fetch'))).toBeNull();
  });

  it('zdanie przy nazwie zajętej - takie, jak w makiecie', () => {
    expect(groupRefusalMessage('name_taken')).toBe('Grupa o tej nazwie już jest w klubie.');
  });
});
