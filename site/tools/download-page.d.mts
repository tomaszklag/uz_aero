export interface DownloadBuild {
  url: string;
  version: string;
  number: string;
  date: Date;
}
export const RELEASE_REPO: string;
export const RELEASE_URL: string;
export function polishDate(date: Date): string;
export function downloadMeta(build: DownloadBuild): string;
export function rewriteDownloadPage(html: string, build: DownloadBuild): { html: string; meta: string; changed: boolean };
