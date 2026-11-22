# The Fourth Satellite

An interactive explainer of how GPS works, in five steps (timing, circles, clock, wobble, city). Its key point: a phone needs a fourth satellite to fix its own clock error. Derived from the Global Virtual Hackathon 2026 exemplar submission (MIT).

## Layout

- `submission/` is the whole site. It is static HTML, CSS and ES modules with no build step and no dependencies. Serve the repo root with any local static server (the page loads `../links.js`) and open `/submission/`.
  - `index.html` and `css/style.css`: page and styles (dark/light theme).
  - `js/app.js`: entry point. `step1-timing.js` through `step5-city.js`: one module per step.
  - `js/receiver.js`: Gauss–Newton solver `fix()` and `spread()` (dilution of precision).
  - `js/space.js`, `geo.js`, `draw.js`, `ui.js`, `theme.js`: shared map, geometry, drawing, UI and theme helpers.
- `links.js` (repo root): the repo and live-site URLs the pages link to.
- `submission/README.md`: detailed design notes, how it works, and what was simplified.

## Conventions

- Everything shown (distances, rings, dots, captions) is computed live. The receiver never sees the user's true position. Anything exaggerated or simplified must say so on screen.
- Keep text short: no more than three sentences in any block.
- Colour roles: blue is you, violet is satellites and signals, acid lime marks draggable or "going wrong" things, and is also the page's highlight colour (call-to-action button, "Try" badges, eyebrow, footnotes, bold live-caption words, focus outline). One exception: step 5 draws straight signals in blue so they stand out from bounced (lime) and blocked (muted) ones.
- Keep the existing coding style and the plain no-build setup.
