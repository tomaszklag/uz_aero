/**
 * Ninerdeck - panel: słownik klubu (issue #216) - nazwiska i znaki dla kalendarza
 * i kolejki decyzji.
 *
 * Jedno pytanie na sesję: słownik starzeje się wolno (nowy członek, nowa maszyna),
 * a oba ekrany, które go czytają, i tak odświeżają zajętości przy każdym wejściu.
 * Przełączenie klubu i wylogowanie czyszczą cały cache, więc klucz nie niesie klubu.
 */

import { useQuery } from '@tanstack/react-query';

import type { DirectoryDto } from '../api/dto';
import { getDirectory } from '../api/directory';
import { keys } from './keys';

export function useDirectory() {
  return useQuery<DirectoryDto>({
    queryKey: keys.directory,
    queryFn: getDirectory,
    staleTime: 5 * 60_000,
  });
}
