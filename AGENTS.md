# The Fourth Satellite

An interactive explainer of how GPS works, in five steps (timing, circles, clock, wobble, city). Its key point: a phone needs a fourth satellite to fix its own clock error. Derived from the Global Virtual Hackathon 2026 exemplar submission (MIT).

## Layout

- `submission/` is the whole site. It is static HTML, CSS and ES modules with no build step and no dependencies. Serve the repo root with any local static server (the page loads `../links.js`) and open `/submission/`.
  - `index.html` and `css/style.css`: page and styles (dark/light theme).
  - `js/app.js`: entry point. `step1-timing.js` through `step5-city.js`: one module per step.
  - `js/receiver.js`: Gauss–Newton solver `fix()` and `spread()` (dilution of precision).
  - `js/space.js`, `geo.js`, `draw.js`, `ui.js`, `theme.js`: shared map, geometry, drawing, UI and theme helpers.
- `tests/receiver.test.mjs`: tests for the receiver and step 5, on Node's built-in runner. Run `node --test` from the repo root.
- `.github/workflows/pages.yml`: every push to `main` deploys the site to GitHub Pages.
- `links.js` (repo root): the repo and live-site URLs the pages link to.
- `submission/README.md`: detailed design notes, how it works, and what was simplified.

## Conventions

- Everything shown (distances, rings, dots, captions) is computed live. The receiver never sees the user's true position; the page uses it only to draw you, step 3's faint true-distance rings, and how far off the dot is. Anything exaggerated or simplified must say so on screen.
- Keep text short: no more than three sentences in any block.
- Write live captions with `setHTML()` from `js/ui.js`, not `innerHTML`: the steps redraw every frame, and it only touches the caption when the text changes.
- Colour roles: blue is you, violet is satellites and signals, acid lime marks draggable or "going wrong" things, including unsettled answers (ring crossings in steps 2 and 3, step 3's trail). It also circles you when step 1's message arrives, and is the page's highlight colour (call-to-action button, "Try" badges, eyebrow, footnotes, bold live-caption words, focus outline). One exception: step 5 draws straight signals in blue so they stand out from bounced (lime) and blocked (muted) ones.
- Keep the existing coding style and the plain no-build setup.
