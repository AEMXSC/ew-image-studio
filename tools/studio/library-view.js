/**
 * Library tab: the site's images in DA, a folder at a time, as nx-cards.
 * Every image can be dragged onto the page, or inserted, replaced, edited
 * or used as a reference from its menu.
 */
import { STUDIO_FOLDER, filterLibrary, folderTrail } from './model.js';
import {
  el, iconButton, menu, picker,
} from './ui.js';

function shortDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function card(ctx, item) {
  const ref = {
    key: item.src, src: item.src, name: item.name, alt: item.alt, decorative: item.decorative,
  };
  const { caps } = ctx;
  if (!ctx.thumbUrl(item.src)) ctx.wantThumb(item.src);
  const media = el('img', {
    slot: 'media', src: ctx.thumbUrl(item.src) || undefined, 'data-thumb': item.src, alt: '', className: 'is-card-media',
  });
  // The picture is the drag source; the menu stays clickable.
  ctx.draggable(media, ref);
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
      el('span', { slot: 'metadata', className: 'is-meta' },
        item.modified ? shortDate(item.modified) : '',
        ctx.addHandle(ref))));
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

/** Where you are (each folder up to the site root is a link) and a menu of the subfolders. */
function folderNav(ctx) {
  const { library } = ctx.state;
  const trail = folderTrail(library.folder);
  const folders = library.folders ?? [];
  return el('div', { className: 'is-field' },
    el('span', { className: 'is-label', id: 'is-folder-label' }, 'Folder in this site'),
    el('nav', { className: 'is-trail', 'aria-labelledby': 'is-folder-label' },
      el('ol', {}, trail.map((f, i) => el('li', {},
        i === trail.length - 1
          ? el('span', { 'aria-current': 'location' }, f.name)
          : el('button', {
            type: 'button', className: 'nx-action-btn-quiet nx-btn-sm', key: `trail-${f.path}`, onClick: () => ctx.openFolder(f.path),
          }, f.name))))),
    folders.length > 0 && picker({
      label: 'Open a subfolder',
      key: 'subfolder',
      value: '',
      items: [{ value: '', label: `Subfolders (${folders.length})` }, ...folders.map((f) => ({ value: f.path, label: f.name }))],
      onChange: (path) => { if (path) ctx.openFolder(path); },
    }));
}

export function libraryView(ctx) {
  const { library } = ctx.state;
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
    folderNav(ctx),
    el('div', { className: 'is-row' },
      iconButton('folder', 'Studio images', { className: 'nx-action-btn-quiet nx-btn-sm', onClick: () => ctx.openFolder(STUDIO_FOLDER) }),
      pageFolder !== STUDIO_FOLDER && iconButton('folder', 'This page\'s folder', { className: 'nx-action-btn-quiet nx-btn-sm', onClick: () => ctx.openFolder(pageFolder) })),
    library.items.length > 6 && search,
    ctx.caps.drag && library.items.length > 0 && el('p', { className: 'is-fine', 'aria-hidden': 'true' }, 'Drag a picture onto an image on the page to replace it, or drag Add between content to add it.'),
    box);
}
