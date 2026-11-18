/**
 * The side panel: state, flows and rendering. The two tabs live in
 * create-view.js and library-view.js; they read state and call the flows
 * passed to them, nothing else.
 */
import {
  MAX_REFERENCES, STUDIO_FOLDER, VARIANTS, buildPrompt, fileName, imageHtml, normalizeFolder,
  pagePrompt, pageFolder, pickImageModel, readPage,
} from './model.js';
import { createGeminiAdapter } from './gemini.js';
import { base64ToBlob, modelInput, toJpeg, urlPool } from './images.js';
import { el, external, menu } from './ui.js';
import { createView } from './create-view.js';
import { libraryView } from './library-view.js';

const KEY_HELP = 'https://aistudio.google.com/app/apikey';
const THUMB_CONCURRENCY = 6;
const PAGE_SIZE = 24;
const REPLACE_ERRORS = {
  unsupported: 'This version of Workspace can\'t replace images from a panel. Drag the image onto the one you want to replace instead.',
  READ_ONLY: 'You can\'t edit this page.',
  NO_TARGET: 'Click the image on the page that you want to replace, then try again.',
  CROSS_TARGET: 'Click just the image you want to replace, then try again.',
  WRONG_SELECTION: 'Click the image on the page that you want to replace, then try again.',
  INVALID_HTML: 'The editor couldn\'t put the image there.',
  STALE_LIVE: 'The page changed while replacing. Try again.',
  timeout: 'Workspace didn\'t answer. Check the page before you try again.',
};

export function mountPanel(root, {
  page, actions = {}, capabilities = {}, storage, da, modelFactory = createGeminiAdapter,
  embedded = true, demo = false, persistent = true, live = document.getElementById('is-live'),
}) {
  const state = {
    view: 'loading', // loading | connect | main | error
    tab: 'create',
    models: [],
    model: '',
    mode: 'generate', // generate | edit
    source: null, // { key, name } of the image being edited
    refs: [], // [{ key, name }]
    refsOpen: false,
    prompt: '',
    promptTouched: false,
    aspect: '16:9',
    style: '',
    useStyle: true,
    variants: [], // [{ id, status, prompt, alt, src, error }]
    page: { title: '', text: '', images: [] },
    library: { folder: storage.folder(page.org, page.site) ?? STUDIO_FOLDER, items: [], loaded: false, query: '', shown: PAGE_SIZE },
    busy: '',
    message: null, // { level, text }
    error: '',
  };
  let model = null;
  let nextId = 1;
  let unsubscribe = null;
  let lastPage = '';
  let dragging = false;
  let renderQueued = false;
  let dragTimer = null;
  let renderRetry = null;
  let disposers = [];
  const blobs = new Map(); // key → Blob (page/library images, variants, uploads)
  const pool = urlPool();
  const thumbQueue = [];
  const failedThumbs = new Set();
  let thumbsLoading = 0;
  const caps = {
    drag: capabilities.dragDrop === 1 && typeof actions.makeDraggable === 'function',
    replace: capabilities.sendHTMLReplace === 1,
    insert: typeof actions.sendHTML === 'function',
    live: capabilities.liveDocument === 1 && typeof actions.subscribeLiveDocument === 'function',
  };

  const set = (patch) => { Object.assign(state, patch); render(); };
  const flash = (level, text) => {
    set({ message: { level, text } });
    if (live) live.textContent = text;
    // Errors stay until the next action, so nobody has to read them in six seconds.
    if (level !== 'error') setTimeout(() => { if (state.message?.text === text) set({ message: null }); }, 6000);
  };
  const fail = (e) => {
    if (e.code === 'unauthorized') { signOut(e.message); return; }
    flash('error', e.message || 'Something went wrong.');
  };

  /** Runs one user action at a time, with a busy state and readable errors. */
  async function guard(label, fn) {
    if (state.busy) return;
    set({ busy: label, message: null });
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      set({ busy: '' });
    }
  }

  // ---------- connecting ----------

  async function start() {
    const key = storage.key();
    if (!key) { set({ view: 'connect' }); return; }
    await openWith(key);
  }

  async function openWith(key) {
    model = modelFactory({ key });
    let failure = '';
    await guard('Connecting', async () => {
      const models = await model.models().catch((e) => { failure = e.message; throw e; });
      if (!models.length) throw new Error('This key can\'t use any Gemini image model. Check the key\'s project in Google AI Studio.');
      storage.setKey(key);
      const saved = storage.model();
      set({
        models,
        model: models.some((m) => m.id === saved) ? saved : pickImageModel(models),
        view: 'main',
        error: '',
      });
      loadPage();
      da.style().then((style) => set({ style }));
    });
    // A stored key but Google unreachable: say so and offer a retry instead of "Loading…".
    if (state.view === 'loading') set({ view: 'error', error: failure || 'Couldn\'t reach Google.' });
  }

  function signOut(message) {
    storage.setKey(null);
    model = null;
    set({ view: 'connect', error: message, models: [] });
  }

  // ---------- the page ----------

  function usePage(html) {
    const summary = readPage(html);
    const sig = JSON.stringify(summary);
    if (sig === lastPage) return;
    lastPage = sig;
    set({
      page: summary,
      prompt: state.promptTouched || state.mode === 'edit' ? state.prompt : pagePrompt(summary, state.aspect),
    });
    summary.images.forEach((i) => queueThumb(i.src));
  }

  function loadPage() {
    if (caps.live) {
      unsubscribe?.();
      unsubscribe = actions.subscribeLiveDocument(({ html }) => usePage(html));
      return;
    }
    da.pageHtml(page.path).then(usePage).catch(() => {});
  }

  // ---------- thumbnails (image bytes, loaded a few at a time) ----------

  function queueThumb(src) {
    if (blobs.has(src) || failedThumbs.has(src) || thumbQueue.includes(src)) return;
    thumbQueue.push(src);
    pumpThumbs();
  }

  function onThumbDone() {
    thumbsLoading -= 1;
    pumpThumbs();
  }

  function loadThumb(src) {
    thumbsLoading += 1;
    da.image(src)
      .then((blob) => {
        blobs.set(src, blob);
        // Update in place: a full render would cancel a drag in progress.
        root.querySelectorAll('img[data-thumb]').forEach((img) => {
          if (img.dataset.thumb === src) img.src = pool.url(src, blob);
        });
      })
      .catch(() => {
        failedThumbs.add(src);
        root.querySelectorAll('[data-thumb-box]').forEach((box) => {
          if (box.dataset.thumbBox === src) box.classList.add('broken');
        });
      })
      .finally(onThumbDone);
  }

  function pumpThumbs() {
    while (thumbsLoading < THUMB_CONCURRENCY && thumbQueue.length) loadThumb(thumbQueue.shift());
  }

  const thumbUrl = (key) => (blobs.has(key) ? pool.url(key, blobs.get(key)) : '');

  // ---------- create ----------

  function setMode(mode) {
    const patch = { mode };
    if (mode === 'generate' && !state.promptTouched) patch.prompt = pagePrompt(state.page, state.aspect);
    if (mode === 'edit' && !state.promptTouched) patch.prompt = '';
    set(patch);
  }

  function setAspect(aspect) {
    set({ aspect, prompt: state.promptTouched || state.mode === 'edit' ? state.prompt : pagePrompt(state.page, aspect) });
  }

  function editImage(item) {
    if (!blobs.has(item.key)) { flash('warn', 'That image is still loading. Try again in a moment.'); return; }
    set({ tab: 'create', mode: 'edit', source: { key: item.key, name: item.name }, prompt: '', promptTouched: false });
    root.querySelector('[data-key="prompt"]')?.focus();
  }

  function addReference(item) {
    if (!blobs.has(item.key)) { flash('warn', 'That image is still loading. Try again in a moment.'); return; }
    if (state.refs.some((r) => r.key === item.key) || state.source?.key === item.key) return;
    if (state.refs.length >= MAX_REFERENCES) { flash('warn', `Up to ${MAX_REFERENCES} reference images.`); return; }
    set({ tab: 'create', refs: [...state.refs, { key: item.key, name: item.name }] });
  }

  function removeReference(key) {
    set({ refs: state.refs.filter((r) => r.key !== key) });
  }

  /** Images picked from the author's computer, as the image to edit or as references. */
  function addFiles(files, as) {
    [...files].filter((f) => f.type.startsWith('image/')).forEach((f) => {
      const key = `f:${nextId}`;
      nextId += 1;
      blobs.set(key, f);
      if (as === 'source') editImage({ key, name: f.name });
      else addReference({ key, name: f.name });
    });
  }

  function generate() {
    const kind = state.mode;
    if (kind === 'edit' && !state.source) { flash('warn', 'Pick the image to edit first.'); return; }
    if (!state.prompt.trim()) { flash('warn', kind === 'edit' ? 'Say what to change.' : 'Describe the image first.'); return; }
    const inputs = [...(kind === 'edit' ? [state.source] : []), ...state.refs];
    const prompt = buildPrompt({
      kind, prompt: state.prompt, references: state.refs.length, style: state.useStyle ? state.style : '',
    });
    guard('Generating', async () => {
      const images = await Promise.all(inputs.map((i) => modelInput(blobs.get(i.key))));
      dropVariants((v) => v.status !== 'saved' && v.status !== 'saving'); // a save in progress keeps its card
      const batch = Array.from({ length: VARIANTS }, () => {
        const id = nextId;
        nextId += 1;
        return { id, status: 'pending', prompt: state.prompt.trim() };
      });
      set({ variants: [...batch, ...state.variants] });
      const results = await Promise.allSettled(batch.map(async (v) => {
        const out = await model.generate({ model: state.model, prompt, images, aspect: state.aspect });
        blobs.set(`v:${v.id}`, await toJpeg(base64ToBlob(out.data, out.mime)));
        updateVariant(v.id, { status: 'ready' });
      }));
      const failed = new Set(batch.filter((_, i) => results[i].status === 'rejected').map((v) => v.id));
      const failures = results.filter((r) => r.status === 'rejected');
      dropVariants((v) => failed.has(v.id));
      render();
      if (failures.length === VARIANTS) throw failures[0].reason;
      if (failures.length) flash('warn', `${VARIANTS - failures.length} of ${VARIANTS} images came back. ${failures[0].reason.message}`);
      else flash('success', `${VARIANTS} images ready. Accept the ones to keep.`);
    });
  }

  function updateVariant(id, patch) {
    set({ variants: state.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  }

  function dropVariants(test) {
    state.variants.filter(test).forEach((v) => { pool.drop(`v:${v.id}`); blobs.delete(`v:${v.id}`); });
    state.variants = state.variants.filter((v) => !test(v));
  }

  function discard(id) {
    dropVariants((v) => v.id === id);
    render();
  }

  /** Saves a variant to the site with alt text; only accepted images leave the browser. */
  async function accept(id) {
    const v = state.variants.find((x) => x.id === id);
    if (!v || v.status !== 'ready') return;
    updateVariant(id, { status: 'saving' });
    try {
      const blob = blobs.get(`v:${id}`);
      const [alt, src] = await Promise.all([
        model.describe(await modelInput(blob)),
        da.save(`${STUDIO_FOLDER}/${fileName(v.prompt, blob.type, new Date(), v.id)}`, blob),
      ]);
      blobs.set(src, blob);
      updateVariant(id, { status: 'saved', alt, src, name: src.split('/').pop() });
      if (normalizeFolder(state.library.folder) === STUDIO_FOLDER) {
        const item = { path: `${STUDIO_FOLDER}/${src.split('/').pop()}`, name: src.split('/').pop(), modified: Date.now(), src, alt };
        state.library = { ...state.library, items: [item, ...state.library.items] };
      }
      if (!alt) flash('warn', 'Saved, but without alt text: Google didn\'t write it. Add alt text on the page.');
      else flash('success', caps.drag ? 'Saved to the site. Drag it onto the page.' : 'Saved to the site.');
    } catch (e) {
      updateVariant(id, { status: 'ready' });
      fail(e);
    }
  }

  function refine(id) {
    // Copy the image to its own key: the next Generate drops unaccepted variants and their blobs.
    const key = `f:${nextId}`;
    nextId += 1;
    blobs.set(key, blobs.get(`v:${id}`));
    editImage({ key, name: 'Generated image' });
  }

  // ---------- library ----------

  async function openFolder(folder = state.library.folder) {
    const clean = normalizeFolder(folder);
    storage.setFolder(page.org, page.site, clean);
    set({
      library: {
        ...state.library, folder: clean, folderDraft: null, query: '', loaded: false, error: '', shown: PAGE_SIZE,
      },
    });
    try {
      const items = await da.list(clean);
      if (state.library.folder !== clean) return; // another folder was opened meanwhile
      set({ library: { ...state.library, items, loaded: true } });
      items.slice(0, PAGE_SIZE).forEach((i) => queueThumb(i.src));
    } catch (e) {
      if (state.library.folder !== clean) return;
      set({ library: { ...state.library, items: [], loaded: true, error: e.message } });
      fail(e);
    }
  }

  function showMore() {
    const shown = state.library.shown + PAGE_SIZE;
    set({ library: { ...state.library, shown } });
    state.library.items.slice(0, shown).forEach((i) => queueThumb(i.src));
  }

  // ---------- putting images on the page ----------

  /** Alt text for an image going into the page: known, or written now. */
  async function altFor(item) {
    if (item.alt) return item.alt;
    const blob = blobs.get(item.key ?? item.src);
    return blob ? model.describe(await modelInput(blob)) : '';
  }

  function insert(item) {
    guard('Inserting', async () => {
      const alt = await altFor(item);
      actions.sendHTML(imageHtml({ src: item.src, alt }));
      flash('success', 'Image inserted at the cursor.');
    });
  }

  function replaceSelected(item) {
    guard('Replacing', async () => {
      const alt = await altFor(item);
      const html = imageHtml({ src: item.src, alt }).replace(/^<p>|<\/p>$/g, '');
      const result = await actions.sendHTML(html, { replace: true });
      if (!result?.ok) {
        throw new Error(REPLACE_ERRORS[result?.error] ?? result?.message ?? 'The image couldn\'t be replaced.');
      }
      flash('success', 'Image replaced, with alt text.');
    });
  }

  /** Lets a card be dragged onto the canvas, carrying the image file itself. */
  function draggable(node, item) {
    if (!caps.drag) return;
    const settle = () => {
      clearTimeout(dragTimer);
      dragging = false;
      if (renderQueued) render();
    };
    node.addEventListener('pointerdown', () => {
      dragging = true;
      // A plain click ends here; a real drag hands the pointer to Workspace and ends in onResult.
      window.addEventListener('pointerup', settle, { once: true });
      clearTimeout(dragTimer);
      dragTimer = setTimeout(settle, 125000); // Workspace gives up on a drag after two minutes
    });
    actions.makeDraggable({
      element: node,
      getData: () => {
        const blob = blobs.get(item.key ?? item.src);
        if (!blob) throw new Error('not loaded');
        return { files: [new File([blob], item.name || 'image.jpg', { type: blob.type || 'image/jpeg' })] };
      },
      onResult: ({ ok, error }) => {
        settle();
        if (ok) flash('success', 'Image added to the page.');
        else if (error !== 'cancelled') flash('error', error === 'invalid-drag-data' ? 'That image is still loading.' : `The image couldn't be dropped there (${error}).`);
      },
    }).then((dispose) => disposers.push(dispose)).catch(() => {});
  }

  // ---------- rendering ----------

  const ctx = {
    state,
    caps,
    set,
    thumbUrl,
    draggable,
    wantThumb: queueThumb,
    thumbFailed: (key) => failedThumbs.has(key),
    // Library filtering redraws its cards without a full render: drop their old drag registrations.
    resetDrags: () => { disposers.forEach((d) => d()); disposers = []; },
    setMode,
    setAspect,
    editImage,
    addReference,
    removeReference,
    addFiles,
    generate,
    accept,
    discard,
    refine,
    insert,
    replaceSelected,
    openFolder,
    showMore,
    setModel: (id) => { storage.setModel(id); set({ model: id }); },
    pageFolder: () => pageFolder(page.path),
  };

  function header() {
    const current = state.models.find((m) => m.id === state.model);
    return el('header', { className: 'is-head' },
      el('div', { className: 'is-brand' },
        el('span', { className: 'is-logo', 'aria-hidden': 'true' }),
        el('div', {},
          el('h1', { className: 'is-title' }, 'Image Studio'),
          el('span', { className: 'is-sub' }, current ? current.label : 'Google Nano Banana'))),
      state.view === 'main' && !demo && menu({
        label: 'More',
        key: 'menu',
        items: [
          { id: 'keys', label: 'Manage keys in Google AI Studio', icon: 'openin' },
          { divider: true },
          { id: 'disconnect', label: 'Disconnect Google', icon: 'close' },
        ],
        onSelect: (id) => {
          if (id === 'keys') window.open(KEY_HELP, '_blank', 'noopener,noreferrer');
          if (id === 'disconnect') signOut('');
        },
      }));
  }

  function connectView() {
    const input = el('input', {
      id: 'is-key', key: 'key', className: 'nx-input', type: 'password', autocomplete: 'off', placeholder: 'Paste your API key', required: true,
    });
    return el('section', { className: 'is-card is-connect' },
      el('h2', {}, 'Connect Google Gemini'),
      el('p', {}, 'Image Studio makes and edits images with Google\'s Nano Banana models, using your own Gemini API key.'),
      state.error && el('p', { className: 'is-note error', role: 'alert' }, state.error),
      el('form', { onSubmit: (e) => { e.preventDefault(); if (input.value.trim()) openWith(input.value.trim()); } },
        el('label', { for: 'is-key' }, 'Gemini API key'),
        input,
        el('button', { type: 'submit', className: 'nx-btn-accent', disabled: Boolean(state.busy) }, state.busy ? 'Connecting…' : 'Connect')),
      !persistent && el('p', { className: 'is-note warn' }, 'This browser blocks storage for the panel, so you\'ll need to paste the key again next time.'),
      el('p', { className: 'is-fine' },
        'The key stays in this browser and is sent only to Google. ',
        external(KEY_HELP, 'Get a key in Google AI Studio')));
  }

  function tabs() {
    const list = [['create', 'Create'], ['library', 'Library']];
    const select = (id) => {
      set({ tab: id });
      if (id === 'library' && !state.library.loaded) openFolder();
    };
    const onKeyDown = (e) => {
      const i = list.findIndex(([id]) => id === state.tab);
      const next = {
        ArrowRight: (i + 1) % list.length,
        ArrowLeft: (i - 1 + list.length) % list.length,
        Home: 0,
        End: list.length - 1,
      }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(list[next][0]);
      root.querySelector(`#is-tab-${list[next][0]}`)?.focus(); // focus follows the selection
    };
    return el('div', { className: 'is-tabs' },
      el('div', { role: 'tablist', 'aria-label': 'Panel views', onKeyDown },
        list.map(([id, label]) => el('button', {
          type: 'button',
          role: 'tab',
          id: `is-tab-${id}`,
          key: `tab-${id}`,
          'aria-controls': 'is-tabpanel',
          'aria-selected': String(state.tab === id),
          tabindex: state.tab === id ? '0' : '-1',
          onClick: () => select(id),
        }, label))));
  }

  function mainView() {
    return el('div', {},
      tabs(),
      el('div', { role: 'tabpanel', id: 'is-tabpanel', 'aria-labelledby': `is-tab-${state.tab}` },
        state.tab === 'create' ? createView(ctx) : libraryView(ctx)));
  }

  /** True while a shared picker or menu has its popover open: rebuilding would destroy it mid-choice. */
  function popoverOpen() {
    return [...root.querySelectorAll('nx-picker, nx-menu')]
      .some((p) => p.open || p.shadowRoot?.querySelector('[aria-expanded="true"]'));
  }

  /** Errors that stop the panel (outside Workspace, Google unreachable), with a way forward. */
  function errorView() {
    const key = storage.key();
    return el('section', { className: 'is-card' },
      el('p', { className: 'is-note error', role: 'alert' }, state.error),
      key && el('div', { className: 'is-row' },
        el('button', {
          type: 'button', className: 'nx-btn-accent', key: 'retry', onClick: () => { set({ view: 'loading' }); openWith(key); },
        }, 'Try again'),
        el('button', { type: 'button', className: 'nx-action-btn', key: 'other-key', onClick: () => signOut('') }, 'Use another key')));
  }

  function render() {
    if (dragging) { renderQueued = true; return; } // rebuilding would cancel the drag
    if (popoverOpen()) {
      clearTimeout(renderRetry);
      renderRetry = setTimeout(render, 300); // the newest state is drawn once it closes
      return;
    }
    renderQueued = false;
    disposers.forEach((d) => d());
    disposers = [];
    // Everything is rebuilt, so carry focus (and the caret) over by key.
    const active = document.activeElement;
    const focusKey = root.contains(active) ? active.dataset.key : '';
    const caret = focusKey && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;

    const body = {
      loading: () => el('p', { className: 'is-fine is-center' }, 'Loading…'),
      connect: connectView,
      main: mainView,
    }[state.view]?.() ?? errorView();
    root.replaceChildren(...[
      header(),
      demo && el('p', { className: 'is-note info' }, 'Demo mode: sample images, nothing is sent to Google or saved.'),
      !embedded && !demo && el('p', { className: 'is-note info' }, `Standalone mode: ${page.org}/${page.site}${page.path}. Putting images on the page needs Experience Workspace.`),
      state.message && el('p', { className: `is-note ${state.message.level}` }, state.message.text),
      // Generating shows its spinner in the button; other waits get the S2 progress bar.
      state.busy && state.busy !== 'Generating' && state.view === 'main' && el('div', { className: 'is-progress', role: 'progressbar', 'aria-label': state.busy }),
      body,
    ].filter((n) => n instanceof Node));

    const target = focusKey && root.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
    if (target) {
      target.focus();
      if (caret && target.setSelectionRange) target.setSelectionRange(...caret);
    }
  }

  render();
  if (!page.org || !page.site) {
    set({ view: 'error', error: 'Open a page in Experience Workspace to use Image Studio.' });
  } else {
    start();
  }
}
