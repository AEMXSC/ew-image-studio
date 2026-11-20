---
name: image-studio
description: Places an image from the Image Studio panel on the page when the author asks to add an image with an Image line and alt text, keeping the block's text, links and other images.
version: 1
status: approved
license: Apache-2.0
---

# Placing an image from Image Studio

The Image Studio panel sends prompts like this one:

```
Add this image to the page in the Cards block where my cursor is.
Image: https://content.da.live/{org}/{site}/media/studio/latte-1700000000000.jpg
Alt text: A latte on a wooden café table
If an image is already there, ask me before replacing it. Change nothing else on the page.
```

## Steps

1. Use the image address exactly as given. Don't download, upload or re-host it; it is already saved in the site.
2. Use the alt text exactly as given. If the prompt says the image is decorative, use `alt=""`.
3. **No block named:** insert a paragraph with the image at the cursor.
4. **A block is named:** put the image in that block, the one the cursor is in.
   - If the block has an empty image cell, or one cell where an image belongs, use it.
   - If there are several places it could go (for example one per card), ask which one before changing anything.
   - If an image is already in that spot, ask before replacing it.
   - Keep the block's text, links, other images and variant classes as they are. Change only that one image.
5. Change nothing else on the page: no metadata, no other blocks, no rewording.
6. Say what you changed in one sentence, naming the block and the image's position in it (for example "the second card").
