# eval-tools

Puppeteer scripts for checking UI fixes the same way across several runs, so a baseline and each candidate result can be compared like for like.

| Script | What it checks |
| --- | --- |
| `capture.js` | Dropdown visibility, clickability, anchoring after scroll and outside-click dismissal at fixed viewports; saves screenshots and a JSON report |
| `fullpage-diff.js` | Full-page screenshots of each URL at three viewports, with the pixel difference against the first (baseline) URL |
| `keyboard-check.js` | Opens each dropdown trigger with Enter, then reports where Tab sends focus and whether Enter on the first item works |
| `stakes-keyboard.js` | Keyboard and interaction scenarios for the wager-calculator "Stakes" selector |

```bash
npm install
node capture.js http://localhost:3123/ ./out baseline
```

The scripts use `puppeteer-core` with a local Chrome. Set `CHROME` to the browser path if it is not at the default Windows location.
