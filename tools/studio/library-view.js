/**
 * Library tab: the site's images in DA, a folder at a time. Every image can
 * be dragged onto the page, inserted, edited or used as a reference.
 */
import { STUDIO_FOLDER, filterLibrary } from './model.js';
import { el } from './ui.js';
import { placeActions } from './create-view.js';

function card(ctx, item) {
  const ref = { key: item.src, name: item.name, alt: item.alt };
  if (!ctx.thumbUrl(item.src)) ctx.wantThumb(item.src);
  // Only the picture is draggable: the drag helper captures the pointer, which would swallow button clicks.
  const picture = el('span', { className: `is-thumb${ctx.thumbFailed(item.src) ? ' broken' : ''}`, 'data-thumb-box': item.src },
    el('img', { src: ctx.thumbUrl(item.src) || undefined, 'data-thumb': item.src, alt: '', loading: 'lazy' }));
  ctx.draggable(picture, { key: item.src, src: item.src, name: item.name });
  return el('li', { className: 'is-lib-item' },
    picture,
    el('p', { className: 'is-lib-name', title: item.path }, item.name),
    placeActions(ctx, { key: item.src, src: item.src, name: item.name, alt: item.alt }),
    el('div', { className: 'is-row' },
      el('button', { type: 'button', className: 'nx-action-btn nx-btn-sm', onClick: () => ctx.editImage(ref) }, 'Edit'),
      el('button', { type: 'button', className: 'nx-action-btn nx-btn-sm', onClick: () => ctx.addReference(ref) }, 'Use as reference')));
}

export function libraryView(ctx) {
  const { library } = ctx.state;
  const items = filterLibrary(library.items, library.query);
  const folderInput = el('input', {
    id: 'is-folder', key: 'folder', className: 'nx-input', value: library.folder, spellcheck: 'false',
  });
  const search = el('input', {
    id: 'is-search',
    key: 'search',
    className: 'nx-input',
    type: 'search',
    placeholder: 'Filter by file name',
    value: library.query,
    onInput: (e) => ctx.set({ library: { ...library, query: e.target.value } }),
  });
  const pageFolder = ctx.pageFolder();

  return el('div', { className: 'is-stack' },
    el('form', { className: 'is-field', onSubmit: (e) => { e.preventDefault(); ctx.openFolder(folderInput.value); } },
      el('label', { for: 'is-folder' }, 'Folder in this site'),
      el('div', { className: 'is-row is-nowrap' }, folderInput, el('button', { type: 'submit', className: 'nx-action-btn' }, 'Open')),
      el('div', { className: 'is-row' },
        el('button', { type: 'button', className: 'is-link', onClick: () => ctx.openFolder(STUDIO_FOLDER) }, 'Studio images'),
        pageFolder !== STUDIO_FOLDER && el('button', { type: 'button', className: 'is-link', onClick: () => ctx.openFolder(pageFolder) }, 'This page\'s folder'))),
    library.items.length > 6 && el('div', { className: 'is-field' }, el('label', { for: 'is-search', className: 'is-sr' }, 'Filter by file name'), search),
    ctx.caps.drag && library.items.length > 0 && el('p', { className: 'is-fine' }, 'Drag an image onto the page. Drop it on an image to replace that one.'),
    !library.loaded && el('p', { className: 'is-fine is-center' }, 'Loading images…'),
    library.loaded && !items.length && el('p', { className: 'is-fine is-center' },
      library.query ? 'No images match.' : 'No images in this folder yet. Accepted images from Create are saved to /media/studio.'),
    items.length > 0 && el('ul', { className: 'is-lib' }, items.slice(0, library.shown).map((i) => card(ctx, i))),
    items.length > library.shown && el('button', { type: 'button', className: 'nx-action-btn is-more', onClick: ctx.showMore }, `Show more (${items.length - library.shown})`));
}
