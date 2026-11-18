import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrompt, cleanAlt, contentUrl, escapeHtml, fileName, filterLibrary, imageHtml, isPublicMedia,
  libraryItems, normalizeFolder, pageFolder, pagePrompt, pickImageModel, readPage, sourceUrl, styleFromConfig,
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
  assert.match(edit, /No words, letters or logos/);
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
  const ids = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3.1-flash-image'];
  assert.equal(pickImageModel(ids.map((id) => ({ id }))), 'gemini-3.1-flash-image');
  assert.equal(pickImageModel([]), '');
});
