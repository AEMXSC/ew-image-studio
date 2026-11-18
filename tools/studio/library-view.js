/**
 * Library tab: the site's images in DA, a folder at a time, as nx-cards.
 * Every image can be dragged onto the page, or inserted, replaced, edited
 * or used as a reference from its menu.
 */
import { STUDIO_FOLDER, filterLibrary } from './model.js';
import { el, iconButton, menu } from './ui.js';

function shortDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function card(ctx, item) {
  const ref = { key: item.src, name: item.name, alt: item.alt };
  const { caps } = ctx;
  if (!ctx.thumbUrl(item.src)) ctx.wantThumb(item.src);
  const media = el('img', {
    slot: 'media', src: ctx.thumbUrl(item.src) || undefined, 'data-thumb': item.src, alt: '', className: 'is-card-media',
  });
  // The picture is the drag source; the menu stays clickable.
  ctx.draggable(media, { key: item.src, src: item.src, name: item.name });
  const actions = [
    caps.insert && { id: 'insert', label: 'Insert at cursor', icon: 'imageadd' },
    caps.replace && { id: 'replace', label: 'Replace selected image', icon: 'replace' },
    { id: 'edit', label: 'Edit with Nano Banana', icon: 'brush' },
    { id: 'ref', label: 'Use as reference', icon: 'layers' },
  ].filter(Boolean);
  const run = {
    insert: () => ctx.insert(ref),
    replace: () => ctx.replaceSelected(ref),
    edit: () => ctx.editImage(ref),
    ref: () => ctx.addReference(ref),
  };
  return el('li', { 'data-thumb-box': item.src, className: ctx.thumbFailed(item.src) ? 'broken' : undefined },
    el('nx-card', { dimensions: 's', size: 's' },
      media,
      el('span', { slot: 'heading', title: item.path }, item.name),
      menu({
        label: `Actions for ${item.name}`, items: actions, onSelect: (id) => run[id](), key: `menu-${item.src}`, slot: 'actions',
      }),
      item.modified && el('span', { slot: 'metadata' }, shortDate(item.modified))));
}

function results(ctx) {
  const { library } = ctx.state;
  const items = filterLibrary(library.items, library.query);
  if (!library.loaded) return [el('p', { className: 'is-fine is-center' }, el('span', { className: 'nx-loading-spinner', role: 'status', 'aria-label': 'Loading images' }))];
  if (library.error) return [el('p', { className: 'is-note error', role: 'alert' }, `Couldn't list this folder: ${library.error}`)];
  if (!items.length) {
    return [el('p', { className: 'is-fine is-center' },
      library.query ? 'No images match.' : 'No images in this folder yet. Accepted images from Create are saved to /media/studio.')];
  }
  return [
    el('ul', { className: 'is-lib' }, items.slice(0, library.shown).map((i) => card(ctx, i))),
    items.length > library.shown && el('button', { type: 'button', className: 'nx-action-btn is-more', key: 'more', onClick: ctx.showMore }, `Show more (${items.length - library.shown})`),
  ].filter(Boolean);
}

export function libraryView(ctx) {
  const { library } = ctx.state;
  const folderInput = el('input', {
    id: 'is-folder',
    key: 'folder',
    className: 'nx-input',
    value: library.folderDraft ?? library.folder,
    spellcheck: 'false',
    onInput: (e) => { library.folderDraft = e.target.value; }, // survives re-renders until opened
  });
  const box = el('div', { className: 'is-stack' }, results(ctx));
  // Filtering redraws only the results, so the search field keeps focus.
  const search = el('nx-search', {
    key: 'search',
    variant: 'field',
    label: 'Filter by file name',
    placeholder: 'Filter by file name',
    props: { value: library.query },
    onInput: (e) => {
      library.query = e.target.value ?? '';
      ctx.resetDrags();
      box.replaceChildren(...results(ctx));
    },
  });
  const pageFolder = ctx.pageFolder();

  return el('div', { className: 'is-stack' },
    el('form', { className: 'is-field', onSubmit: (e) => { e.preventDefault(); ctx.openFolder(folderInput.value); } },
      el('label', { for: 'is-folder' }, 'Folder in this site'),
      el('div', { className: 'is-row is-nowrap' }, folderInput, el('button', { type: 'submit', className: 'nx-action-btn', key: 'open-folder' }, 'Open')),
      el('div', { className: 'is-row' },
        iconButton('folder', 'Studio images', { className: 'nx-action-btn-quiet nx-btn-sm', onClick: () => ctx.openFolder(STUDIO_FOLDER) }),
        pageFolder !== STUDIO_FOLDER && iconButton('folder', 'This page\'s folder', { className: 'nx-action-btn-quiet nx-btn-sm', onClick: () => ctx.openFolder(pageFolder) }))),
    library.items.length > 6 && search,
    ctx.caps.drag && library.items.length > 0 && el('p', { className: 'is-fine' }, 'Drag a picture onto the page. Drop it on an image to replace that one.'),
    box);
}
