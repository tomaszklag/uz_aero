export interface ReleaseTitle {
  version: string;
  build: string | null;
  date: string | null;
}
export function splitTitle(title: string): ReleaseTitle;
export function releaseMeta(t: ReleaseTitle, esc?: (s: string) => string): string;
