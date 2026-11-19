# Image Studio for Experience Workspace · Google Nano Banana

A side panel for [Adobe Experience Workspace](https://www.aem.live/docs/ew/developing/apps-plugins)
that makes and edits images for the page an author is working on, with
Google's Nano Banana (Gemini image) models, saves the good ones to the site
with alt text, and lets the author drag them onto the page.

| Reference product | Generated from the page, product kept as it is |
|---|---|
| ![A kraft-paper bag of Fréscopa Autumn House Blend coffee](tools/studio/demo/bag.jpg) | ![The same bag on a café table with a mug, hazelnuts and apple, autumn trees outside](tools/studio/demo/hero-1.jpg) |
| **A photo already on the site** | **Edited: "autumn evening, put the coffee bag on the counter"** |
| ![A bright café counter with an espresso machine and pastries](tools/studio/demo/cafe.jpg) | ![The same café counter in warm autumn light, with the Fréscopa bag and orange leaves on it](tools/studio/demo/edit-1.jpg) |

All four images were made with this panel's code and Nano Banana 2.

## The problem

Authors get stuck on images. Stock photos look generic, and a small change to
a photo the site already has ("same shot, but autumn") means a ticket to a
designer and a wait. Suites like Optimizely and Sitecore now generate images
inside the CMS. Experience Workspace authors don't have that, and they can't
choose which model to use.

## How an author uses it

1. **Open a page and the panel.** The **Create** tab starts with a prompt
   written from the page: its heading and opening copy. Edit it, or write your own.
2. **Make a new image or edit one.** **New image** generates from the prompt.
   **Edit an image** changes an image from the page, the Library or your
   computer ("autumn café background, warmer light") and keeps everything else.
3. **Keep the real product.** Add up to three **reference images**, such as a
   product shot, and the product appears as it really is, label included.
4. **Pick the shape:** Hero (16:9), Card (4:3), Square or Portrait. Each run
   makes three variants. **Edit this** refines one; **Discard** drops it.
5. **Accept.** Only accepted images leave the browser: each is saved to the
   site's `/media/studio/` folder in DA with alt text written for it.
6. **Put it on the page.** Drag the picture onto an image on the page to
   replace it, or use **Insert** (at the cursor, with alt text) or **Replace
   selected** (swaps the image selected on the page, with alt text). Workspace
   shows only a copy cursor while you drag, so the panel dims the picture and
   shows a reminder until you drop it.
7. **Library.** The **Library** tab shows the site's images a folder at a time,
   newest first. Any of them can be dragged onto the page, edited, or used as a
   reference.

## Try it without a key

[Open the demo](https://main--ew-image-studio--aemxsc.aem.page/tools/studio/studio.html?demo=1):
sample images made with Nano Banana, nothing is sent to Google or saved. Add
`?demo=1` to the library `path` to try it inside Workspace the same way.

## Before you start

- **An Experience Workspace site** (a DA site with Experience Workspace enabled).
- **A Gemini API key** for each author, from
  [Google AI Studio](https://aistudio.google.com/app/apikey). Image generation
  is billed to the key's Google Cloud project; see
  [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) for
  rates and free-tier limits.

## Add it to a site

1. Open the site config: `https://da.live/config#/{org}/{site}/`.
2. In the `library` sheet (add a tab called `library` if there is none), add a
   row:

   | title | path | icon |
   |---|---|---|
   | Image Studio | `https://main--ew-image-studio--aemxsc.aem.page/tools/studio/studio.html` | `https://main--ew-image-studio--aemxsc.aem.page/tools/studio/icon.svg` |

   Leave `ref`, `experience` and `format` empty.
3. Save the config.
4. Open a page of the site in Workspace and choose **Image Studio** in the
   **Panels** menu under Extensions. Each author pastes their Gemini key once.

### Optional: a brand style for every image

Add a tab called `image-studio` to the site config with `key` and `value`
columns, and a row with key `style`:

| key | value |
|---|---|
| style | Warm, natural light; muted autumn colours; real cafés, not studio sets. |

The panel adds it to every prompt. Authors can switch it off per image.

### Run your own copy

The row above loads the code from this repository, so changes here reach your
authors without review, and the code can read their Gemini key. To review
updates first, fork this repository, install
[AEM Code Sync](https://github.com/apps/aem-code-sync/installations/new) on the
fork, and use `https://main--{repo}--{owner}.aem.page/tools/studio/studio.html`
(and `icon.svg`) in the library row. There is no build step.

## What happens when

| Author action | Google | DA (the site) | The page |
|---|---|---|---|
| Generate / Make edits | The prompt, plus the edited image and references | – | – |
| Accept | The image, to write alt text | Saved to `/media/studio/{prompt-words}-{time}.jpg` | – |
| Drag onto the page | – | Workspace uploads the image file next to the page | The dropped-on image replaced (no alt text) |
| Insert / Replace selected | The image, if it has no alt text yet | – | `<img>` with alt text |

## What data goes where

- **The Gemini key** stays in the author's browser, in local storage of the
  panel's web address, and is sent only to Google, in a header. It never goes
  to Adobe or into the site config. **Disconnect Google** in the **⋯** menu
  removes it.
- **Google gets** the prompt, the images used as input, and accepted images (to
  write alt text). Images the author doesn't accept are never saved anywhere.
- **Adobe's APIs** are called with the author's Workspace sign-in, only to list
  and save images in DA, read the page and read the site config. The panel only
  sends that sign-in with requests for the site's own DA files, never to Google
  or other hosts.
- **The panel page** has a Content Security Policy: scripts and styles only from
  its own site and `da.live`; network only to Google's Gemini API, DA and public
  Edge Delivery media.

## Limits

- Gemini may decline prompts or images under Google's policies; the panel says
  so. Generated images can still get details wrong; check before you publish.
- Dragging sends the image file, because Workspace replaces an image only when
  a file is dropped on it. Workspace uploads that file again next to the page,
  and a dropped file carries no alt text. **Insert** and **Replace selected**
  reuse the saved image and write its alt text. Dragging needs a mouse or touch;
  **Insert** is the keyboard route.
- **Replace selected** inside a block (hero, cards…) sends the block back with
  only that image changed, so its text, links and other images stay; Workspace
  replaces whole blocks, so a lone image would wipe them. If the block has
  several images, the panel asks which one.
- **Replace selected** needs the image selected on the page and a Workspace
  version that supports replacing; otherwise insert the new image and delete the old one.
- Images on other hosts than DA or Edge Delivery can't be edited from the page.
- The Library lists one folder at a time, without subfolders.

## Other image models

`tools/studio/gemini.js` is the only file that knows Gemini. Another model
(Adobe Firefly, OpenAI, a model behind your own gateway) needs an adapter with
the same three methods, passed to `mountPanel` as `modelFactory`:

| Method | Returns |
|---|---|
| `models()` | `[{ id, label }]`, the image models the key can use |
| `generate({ model, prompt, images, aspect })` | `{ mime, data }` (base64) |
| `describe(image)` | alt text, or `''` |

## Develop

```sh
npm test            # unit tests (node --test), no install needed
npm install && npm run lint   # ESLint and Stylelint with the adobe-rnd/ew-extensions config
npx @adobe/aem-cli up   # serves the panel at http://localhost:3000
```

Open `http://localhost:3000/tools/studio/studio.html?org={org}&site={site}&path=/{page}`
to run it outside Workspace (standalone mode starts after 3 seconds), or use
that address as the library `path` to load your local copy inside Workspace.

| File | What it does |
|---|---|
| `tools/studio/studio.html` | Page loaded in the side-panel iframe |
| `tools/studio/studio.js` | Waits for the Workspace SDK, falls back to standalone |
| `tools/studio/panel.js` | State, flows and rendering |
| `tools/studio/create-view.js` | The Create tab |
| `tools/studio/library-view.js` | The Library tab |
| `tools/studio/model.js` | Prompts, page reading, file names, DA paths (pure, tested) |
| `tools/studio/gemini.js` | Google Gemini adapter |
| `tools/studio/da.js` | DA: list, save and read images, page and config |
| `tools/studio/images.js` | JPEG and base64 conversion in the browser |
| `tools/studio/demo-adapter.js` | Demo mode |

## License

Apache 2.0. See [LICENSE](LICENSE).
