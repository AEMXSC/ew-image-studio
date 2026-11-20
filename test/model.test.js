import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blockAspect, buildPrompt, cleanAlt, contentUrl, escapeHtml, fileName, filterLibrary, folderTrail, imageHtml,
  isPublicMedia, libraryFolders,
  libraryItems, normalizeFolder, pageFolder, pagePrompt, pickImageModel, placePrompt, readPage, sourceUrl,
  startPrompt, styleFromConfig,
  uniqueName,
} from '../tools/studio/model.js';

const PAGE = `<main><div>
  <h1>Autumn <em>house</em> blend</h1>
  <p>Short.</p>
  <p>Our autumn house blend is back: caramel, toasted hazelnut &amp; baked apple.</p>
  <p><img src="https://content.da.live/aemxsc/frescopa26/media/cafe.jpg" alt="Café counter"></p>
  <p><img src="https://content.da.live/aemxsc/frescopa26/media/cafe.jpg" alt="dupe"></p>
  <img src="javascript:alert(1)">
</div></main>`;

test('reads the page: heading, opening copy, unique safe images', () => {
  const page = readPage(PAGE);
  assert.equal(page.title, 'Autumn house blend');
  assert.equal(page.text, 'Our autumn house blend is back: caramel, toasted hazelnut & baked apple.');
  assert.deepEqual(page.images, [{ src: 'https://content.da.live/aemxsc/frescopa26/media/cafe.jpg', alt: 'Café counter' }]);
  assert.ok(readPage(`<p>${'word '.repeat(300)}</p>`).text.endsWith('…'), 'long copy is cut at a word');
  assert.deepEqual(readPage(''), { title: '', text: '', images: [] });
});

test('page prompt names the use and the page; empty pages still get a prompt', () => {
  const prompt = pagePrompt({ title: 'Autumn house blend', text: 'Caramel notes.' }, '4:3');
  assert.match(prompt, /^A card image for a web page titled "Autumn house blend"\. The page says: Caramel notes\./);
  assert.match(pagePrompt({ title: '', text: '' }), /^A hero image for this web page/);
});

test('model prompt: edits keep the rest, references keep the product, style and no-text rule added', () => {
  const edit = buildPrompt({ kind: 'edit', prompt: ' autumn leaves ', references: 1, style: 'Warm light' });
  assert.match(edit, /^Edit the first image: autumn leaves\n/);
  assert.match(edit, /The other images are references: show the products in them exactly as they look/);
  assert.match(edit, /Brand style: Warm light/);
  assert.match(edit, /Keep the labels on the reference products exactly as they are; no other words/,
    'with references, the no-text rule must not blank out product labels');
  assert.match(buildPrompt({ kind: 'generate', prompt: 'A café' }), /No words, letters or logos/);
  const gen = buildPrompt({ kind: 'generate', prompt: 'A café', references: 2 });
  assert.match(gen, /^A café\nThe images are references/);
  assert.doesNotMatch(buildPrompt({ kind: 'generate', prompt: 'A café' }), /references|Brand style/);
});

test('alt text is one tidy sentence', () => {
  assert.equal(cleanAlt('"Image of a bag of coffee on a table."\n'), 'A bag of coffee on a table.');
  assert.equal(cleanAlt('a photo showing two cups'), 'Two cups');
  assert.ok(cleanAlt('x '.repeat(200)).length <= 150);
  assert.equal(cleanAlt(''), '');
});

test('file names are readable, unique and typed', () => {
  const now = new Date(2026, 10, 18, 9, 5, 7);
  assert.equal(fileName('A hero image for the Café Autumn blend!', 'image/jpeg', now), 'hero-cafe-autumn-blend-20261118-090507.jpg');
  assert.equal(fileName('???', 'image/png', now), 'studio-20261118-090507.png');
  assert.equal(fileName(pagePrompt({ title: 'Learn to pull the perfect shot', text: 'Two-hour classes.' }), 'image/jpeg', now),
    'hero-learn-to-pull-perfect-shot-20261118-090507.jpg', 'the panel\'s own opening words are skipped');
  assert.equal(fileName(startPrompt({ title: 'Autumn house blend' }, { name: 'cards', text: 'Hazelnut latte' }, '4:3'), 'image/jpeg', now),
    'card-autumn-house-blend-hazelnut-latte-20261118-090507.jpg');
});

test('review fixes: unique names per variant, encoded addresses, safe entities, <p> only', () => {
  const now = new Date(2026, 10, 18, 9, 5, 7);
  assert.notEqual(fileName('A café', 'image/jpeg', now, 1), fileName('A café', 'image/jpeg', now, 2), 'two accepts in one second');
  assert.equal(contentUrl('o', 's', '/media/a #1?.png'), 'https://content.da.live/o/s/media/a%20%231%3F.png');
  assert.equal(readPage('<h1>Caf&#x00e9; &#99999999;</h1>').title, 'Café', 'hex decoded, out-of-range dropped, no throw');
  const page = readPage('<picture><source srcset="x"></picture><pre>code block that is long enough</pre><p>A real paragraph that is long enough.</p>');
  assert.equal(page.text, 'A real paragraph that is long enough.');
});

test('dropped files get a name no other drop has used', () => {
  assert.equal(uniqueName('cafe.jpg', 36 ** 3), 'cafe-1000.jpg');
  assert.equal(uniqueName('a/b.PNG', 35), 'a-b-z.png', 'no path separators: Workspace refuses them');
  assert.equal(uniqueName('Café Hero!.JPG', 1), 'cafe-hero-1.jpg', 'storage-safe: lowercase ASCII and dashes');
  assert.equal(uniqueName('???.jpg', 1), 'image-1.jpg');
  assert.equal(uniqueName('noext', 1), 'noext-1.jpg');
  assert.notEqual(uniqueName('x.jpg', 1), uniqueName('x.jpg', 2));
});

test('folders and DA addresses', () => {
  assert.equal(normalizeFolder('media//studio/'), '/media/studio');
  assert.equal(normalizeFolder(''), '/');
  assert.equal(pageFolder('/blog/atelier-taste'), '/blog');
  assert.equal(pageFolder('/index'), '/');
  assert.equal(contentUrl('o', 's', 'media/x.jpg'), 'https://content.da.live/o/s/media/x.jpg');
});

test('only this org\'s DA images get the signed-in address', () => {
  assert.equal(sourceUrl('https://content.da.live/aemxsc/frescopa26/media/x.jpg', 'aemxsc'), 'https://admin.da.live/source/aemxsc/frescopa26/media/x.jpg');
  assert.equal(sourceUrl('https://content.da.live/other/site/x.jpg', 'aemxsc'), '', 'another org');
  assert.equal(sourceUrl('https://evil.example/aemxsc/x.jpg', 'aemxsc'), '', 'another host');
  assert.equal(sourceUrl('not a url', 'aemxsc'), '');
  assert.ok(isPublicMedia('https://main--frescopa26--aemxsc.aem.page/media_1.jpg'));
  assert.ok(!isPublicMedia('https://aem.page.evil.example/x.jpg'));
  assert.ok(!isPublicMedia('http://main--a--b.aem.live/x.jpg'));
});

test('library: images only, site-relative, newest first, filterable', () => {
  const items = libraryItems([
    { path: '/o/s/media/old.png', lastModified: 1 },
    { path: '/o/s/media/new.jpg', lastModified: 5 },
    { path: '/o/s/media/notes.html', lastModified: 9 },
    { path: '/o/s/media/sub' },
  ], 'o', 's');
  assert.deepEqual(items.map((i) => i.path), ['/media/new.jpg', '/media/old.png']);
  assert.equal(items[0].src, 'https://content.da.live/o/s/media/new.jpg');
  assert.deepEqual(filterLibrary(items, ' OLD ').map((i) => i.name), ['old.png']);
  assert.deepEqual(libraryItems(null, 'o', 's'), []);
});

test('image HTML escapes the address and alt text', () => {
  assert.equal(imageHtml({ src: 'https://content.da.live/o/s/a.jpg', alt: 'Say "hi" <b>' }),
    '<p><img src="https://content.da.live/o/s/a.jpg" alt="Say &quot;hi&quot; &lt;b&gt;"></p>');
  assert.equal(escapeHtml('\'&'), '&#39;&amp;');
});

test('brand style comes from the image-studio sheet, multi- or single-sheet', () => {
  const multi = { ':names': ['library', 'image-studio'], 'image-studio': { data: [{ key: 'Style ', value: ' Warm light ' }] } };
  assert.equal(styleFromConfig(multi), 'Warm light');
  assert.equal(styleFromConfig({ ':names': ['library'], library: { data: [] } }), '');
  assert.equal(styleFromConfig({ data: [{ key: 'style', value: 'Muted' }] }), 'Muted');
  assert.equal(styleFromConfig(null), '');
});

test('default image model: Flash, stable, newest', () => {
  // The list one real key returned (November 2026).
  const ids = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-3-pro-image', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image'];
  assert.equal(pickImageModel(ids.map((id) => ({ id }))), 'gemini-3.1-flash-image');
  assert.equal(pickImageModel([]), '');
});

test('block prompt: names the block and the page, uses its text; no text falls back to the page', () => {
  const page = { title: 'Autumn house blend', text: 'Caramel notes.' };
  const prompt = startPrompt(page, { name: 'cards', text: 'Hazelnut latte. Warm and nutty.' }, '4:3');
  assert.match(prompt, /^A card image for the Cards block on a web page titled "Autumn house blend"\./);
  assert.match(prompt, /The block says: Hazelnut latte\. Warm and nutty\.\n/);
  assert.equal(startPrompt(page, { name: 'hero', text: '' }, '16:9'), pagePrompt(page, '16:9'));
  assert.equal(startPrompt(page, null, '16:9'), pagePrompt(page, '16:9'));
  assert.match(startPrompt({ title: '', text: '' }, { name: 'image-text', text: 'Hi' }), /for the Image text block\. The block/);
});

test('block shape: known blocks pick one, others keep the current shape', () => {
  assert.equal(blockAspect('hero'), '16:9');
  assert.equal(blockAspect('cards'), '4:3');
  assert.equal(blockAspect('columns'), null);
  assert.equal(blockAspect(undefined), null);
});

test('chat prompt: image, alt text or decorative, and where to put it', () => {
  const src = 'https://content.da.live/aemxsc/frescopa26/media/studio/latte.jpg';
  const inBlock = placePrompt({ src, alt: 'A latte on a café table' }, { name: 'cards', text: '' });
  assert.match(inBlock, /^Add this image to the page in the Cards block where my cursor is\.\n/);
  assert.ok(inBlock.includes(`Image: ${src}`));
  assert.match(inBlock, /Alt text: A latte on a café table/);
  assert.match(inBlock, /ask me before replacing it/);
  const decorative = placePrompt({ src, alt: '' });
  assert.match(decorative, /^Add this image to the page where my cursor is\./);
  assert.match(decorative, /decorative: use empty alt text \(alt=""\)/);
});

test('library folders: entries without ext, site-relative, by name, hidden ones left out', () => {
  const folders = libraryFolders([
    { path: '/o/s/media/studio', name: 'studio' },
    { path: '/o/s/media/brand', name: 'brand' },
    { path: '/o/s/media/.trash', name: '.trash' },
    { path: '/o/s/media/hero.jpg', name: 'hero', ext: 'jpg' },
  ], 'o', 's');
  assert.deepEqual(folders, [{ path: '/media/brand', name: 'brand' }, { path: '/media/studio', name: 'studio' }]);
  assert.deepEqual(libraryFolders(null, 'o', 's'), []);
});

test('folder trail: site root first, then each folder down to the current one', () => {
  assert.deepEqual(folderTrail('/media/studio/'), [
    { path: '/', name: 'Site' }, { path: '/media', name: 'media' }, { path: '/media/studio', name: 'studio' },
  ]);
  assert.deepEqual(folderTrail('/'), [{ path: '/', name: 'Site' }]);
});
