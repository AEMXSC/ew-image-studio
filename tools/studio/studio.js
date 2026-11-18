/**
 * Entry point. Waits for the Experience Workspace SDK; if the panel is opened
 * on its own (local testing), falls back to standalone mode after 3 s and
 * reads org/site/path from the query string.
 */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { setConfig } from 'https://da.live/nx2/scripts/nx.js';
import { mountPanel } from './panel.js';
import { createDa } from './da.js';
import { browserStorage, memoryStore, panelStore } from './storage.js';
import { CODE_BASE } from './ui.js';

const SDK_TIMEOUT = 3000;
// Workspace's shared Spectrum 2 components, as adobe-rnd/ew-extensions loads them.
const COMPONENTS = ['segmented-btn/segmented', 'switch/switch', 'picker/picker', 'search/search', 'card/card', 'menu/menu']
  .map((c) => `https://da.live/nx2/blocks/shared/${c}.js`);

async function init() {
  const root = document.getElementById('studio-app');
  // The components read their icons from codeBase/img/icons when they load, so set it first.
  await setConfig({ codeBase: CODE_BASE });
  await Promise.all(COMPONENTS.map((c) => import(c)));
  const timeout = new Promise((resolve) => { setTimeout(() => resolve(null), SDK_TIMEOUT); });
  const sdk = await Promise.race([DA_SDK, timeout]).catch(() => null);

  const params = new URLSearchParams(window.location.search);
  const context = sdk?.context ?? {
    org: params.get('org') ?? '',
    site: params.get('site') ?? '',
    path: params.get('path') ?? '/',
  };
  let page = { org: context.org, site: context.site || context.repo, path: context.path || '/' };
  let actions = sdk?.actions ?? {};
  let capabilities = sdk?.capabilities ?? {};
  // Outside Workspace there is no signed-in fetch: DA reads then fail and the panel says so.
  const daFetch = actions.daFetch ?? ((url, opts) => window.fetch(url, opts));
  let da = createDa({ org: page.org, site: page.site, daFetch });
  let options = {};

  // ?demo=1 uses sample images: no key, nothing is sent to Google or saved to DA.
  if (params.get('demo') === '1') {
    const { createDemoModel, createDemoDa } = await import('./demo-adapter.js');
    if (!page.org) page = { org: 'demo', site: 'frescopa', path: '/campaigns/autumn-house-blend' };
    da = createDemoDa();
    // Dragging still works (the image is a real file); inserting by address would point at demo files.
    actions = actions.makeDraggable ? { makeDraggable: actions.makeDraggable } : {};
    capabilities = { dragDrop: capabilities.dragDrop };
    const storage = browserStorage(memoryStore());
    storage.setKey('demo');
    options = { modelFactory: createDemoModel, storage, demo: true };
  }

  const { store, persistent } = panelStore();
  mountPanel(root, {
    page, actions, capabilities, da, storage: browserStorage(store), persistent, embedded: Boolean(sdk), ...options,
  });
}

init().catch((e) => {
  document.getElementById('studio-app').textContent = `Image Studio could not start: ${e.message}`;
});
