# St Shenouda Coptic Orthodox Monastery, homepage

The homepage of St Shenouda Coptic Orthodox Monastery, 8419 Putty Road, Putty NSW 2330, Australia.

Plain HTML, CSS and JavaScript. No build step, no frameworks, nothing to install.

## What is here

- `index.html` is the whole page on its own. Open it from GitHub Pages to see the site without Wix.
- `assets/` holds the stylesheet, the script, the page body (`fragment.html`), the hero video, the images and the cross.
- `wix/stsm-home.js` is the Wix Custom Element. It loads the same page into the Wix site, so there is only ever one copy of the content.
- `wix/mount-test.html` is a test page used during development. It is not linked from anywhere.

## How the Wix site uses this repository

The Wix homepage holds one Custom Element with the tag name `stsm-home`. Its script address is:

```
https://stsmaus-dev.github.io/stmauswebsite/wix/stsm-home.js
```

GitHub Pages republishes the site about a minute after every push to `main`, and the Wix page picks up the change on its next load. Nothing needs to be republished in Wix for content changes.

## Making a change

Edit `assets/fragment.html` for words, `assets/site.css` for looks, or `assets/site.js` for behaviour, then commit and push to `main`. After editing `fragment.html`, copy it into `index.html` between the `FRAGMENT START` and `FRAGMENT END` markers so the standalone page matches.
