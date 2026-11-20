/**
 * Document Authoring (DA) access, with the author's Workspace sign-in
 * (daFetch). Lists and saves images in the site, reads the page, and reads
 * the site config's brand style. daFetch signs every request it makes, so
 * images are only fetched through it when they are this org's DA files.
 */
import {
  contentUrl, isPublicMedia, libraryFolders, libraryItems, normalizeFolder, sourceUrl, styleFromConfig,
} from './model.js';

const ADMIN = 'https://admin.da.live';

export class DaError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // forbidden | notfound | failed
  }
}

function check(resp, what) {
  if (resp.ok) return resp;
  if (resp.status === 401 || resp.status === 403) {
    throw new DaError('forbidden', `You don't have permission to ${what} on this site.`);
  }
  if (resp.status === 404) throw new DaError('notfound', `Not found while trying to ${what}.`);
  throw new DaError('failed', `DA couldn't ${what} (${resp.status}).`);
}

export function createDa({ org, site, daFetch, fetch = (...a) => window.fetch(...a) }) {
  return {
    org,
    site,

    /** A folder of the site: its images, newest first, and its subfolders. A missing folder is just empty. */
    async list(folder) {
      const resp = await daFetch(`${ADMIN}/list/${org}/${site}${normalizeFolder(folder)}`);
      if (resp.status === 404) return { items: [], folders: [] };
      const list = await check(resp, 'list images').json();
      return { items: libraryItems(list, org, site), folders: libraryFolders(list, org, site) };
    },

    /** Saves an image to the site; resolves with the address the page will use. */
    async save(path, blob) {
      const form = new FormData();
      form.append('data', blob);
      const resp = await daFetch(`${ADMIN}/source/${org}/${site}${path}`, { method: 'POST', body: form });
      check(resp, 'save images');
      return contentUrl(org, site, path);
    },

    /** An image's bytes, for thumbnails and as model input. Only DA and public EDS media. */
    async image(src) {
      const signed = sourceUrl(src, org);
      let resp;
      if (signed) resp = await daFetch(signed);
      else if (isPublicMedia(src)) resp = await fetch(src);
      else throw new DaError('failed', 'This image isn\'t stored in DA, so Image Studio can\'t open it.');
      return check(resp, 'load the image').blob();
    },

    /** The page's HTML as saved in DA, when the live document isn't available. */
    async pageHtml(path) {
      const resp = await daFetch(`${ADMIN}/source/${org}/${site}${normalizeFolder(path)}.html`);
      if (!resp.ok) return '';
      return resp.text();
    },

    /** Brand style from the site config; '' when there is none or it can't be read. */
    async style() {
      try {
        const resp = await daFetch(`${ADMIN}/config/${org}/${site}/`);
        return resp.ok ? styleFromConfig(await resp.json()) : '';
      } catch {
        return '';
      }
    },
  };
}
