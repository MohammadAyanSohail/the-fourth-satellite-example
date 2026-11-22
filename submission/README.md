# The Fourth Satellite

Most people think a satellite tells their phone where they are. It doesn't. No satellite knows you exist. The satellites only repeat who they are, where they are and what time it is. Your phone times how late each message arrives and works out the blue dot by itself. The site explains how in five short steps. Each step has one idea, one thing to play with, and one everyday analogy.

## What you can do with it

| Step | The idea | What you play with | Analogy |
|---|---|---|---|
| 1. Timing | A delay is a distance | Move a satellite from overhead to the horizon and watch its timed message travel down (slowed 30×), with a stopwatch | Counting between lightning and thunder |
| 2. Circles | One distance is a ring; three rings meet in one spot | Switch satellites on one at a time, drag yourself around | A friend texting "I'm 5 km from the station" |
| 3. Clock | The phone's clock is wrong, so every ring is too big by the same amount, and finding that amount takes one more satellite | Shrink every ring by the same amount yourself until they sit on faint dashed rings showing the true distances, with a 12× magnifier on the crossings. Turn off one satellite and every amount works, drawn as a trail of possible answers. A card counts the unknowns: 3 in the flat picture, 4 in the real world | A watch that's 5 minutes fast |
| 4. Wobble | Where the satellites sit decides the size of the pale circle | Spread the satellites out or bunch them together, or drag them, and watch the cloud of answers | Two torch beams crossing |
| 5. City | Buildings block and bounce signals, so the dot wanders | Change building height and where you stand, pause the sky, and turn on a 3D city map | A friend calling your name across a busy street |

After the steps there is a five-line recap, three surprising facts, and a collapsed "What we simplified, and sources" box.

The page starts in a dark space theme and has a light/dark switch in the top bar. The choice is remembered. The top bar also links to each step, lights up the step you're reading, and shows how far down the page you are.

### Design rules we followed

- **No walls of text.** Each step has a one-sentence big idea, one analogy card, two or three "Try" prompts and a live caption that changes as you play. Nothing on the page is longer than three sentences.
- **Every animation shows something real.** The message in step 1 moves at a real speed, slowed by a stated amount. When you press "Let the phone find it", the rings in step 3 shrink by exactly the clock error the receiver found. The dots in step 4 are real answers from the receiver. Anything exaggerated says so on screen.
- **Two colours and an odd accent.** Blue is you and the dot. Violet is satellites and their signals. Acid lime marks anything you can drag, and anything going wrong or not yet settled: bounced signals, the places two or three rings cross, the trail of possible answers in step 3. It also circles you when step 1's message arrives, and is the page's highlight colour. One exception: step 5 draws straight signals in blue so they stand out from bounced (lime) and blocked (grey) ones.

## How it works

Steps 2 to 4 share a flat "map of space" (`js/space.js`). You are near the middle, and the satellites are about 20,000 km away. Positions are in metres.

For each satellite it hears, the phone gets two things: where the satellite is, and how long its signal took by the phone's own clock. That time is the real travel time, plus any clock error, plus some noise in steps 4 and 5, plus the extra length of a bounce in step 5. Multiplied by the speed of light, it gives a distance.

The receiver, `fix()` in `js/receiver.js`, works out x, y and the clock error with Gauss–Newton least squares:

1. Guess. Steps 2 to 4 start in the middle of the satellites, and step 5 starts in the middle of the street.
2. Work out how long each signal would have taken if the guess were right.
3. Compare that with what was measured.
4. Solve a small set of equations for the move that best shrinks all the differences at once, and take it.
5. Repeat until the move is under a millimetre, or for 12 rounds at most.

In step 3 the visitor chooses how much to shrink every ring. For that amount, `fix()` (solving only x and y) finds the single best spot, and the page says whether the rings are still too big or now too small, and how far that spot is from you. The rings meet only when the amount equals the clock error times the speed of light: the page checks this against the amount `fix()` finds when it solves for the clock itself, to within 1 km. The slider moves 10 km a step, so letting go within 60 km of that amount snaps onto it. With two satellites, the page instead draws where the two rings cross for every shrink amount, a whole trail of possible answers, and `fix()` with the clock unknown refuses, because two clues can't settle three unknowns. "Let the phone find it" glides the slider to the amount `fix()` finds when it solves for the clock itself.

The pale circle in step 4 comes from `spread()`, which inverts the same matrix the solver uses. That shows how much the answer moves for each metre of error in a distance (GPS engineers call this dilution of precision). The circle's radius is the square root of the x and y variances added together, the measure phones themselves use.

In step 5 the satellites are so far away that their signals arrive as parallel lines. `signalPath()` in `js/step5-city.js` checks whether each signal clears the roof on its side. If it doesn't, it checks for one bounce off the glass opposite, which adds `2 × (your distance from that wall) × cos(elevation)` metres. Anything else is blocked. With the 3D city map on, `mapCheck()` tries every spot across the street, predicts each signal's delay from there (bounces included), and keeps the spot that fits best. Spots from which a signal it heard would be blocked count against it. If fewer signals get through than the phone needs (three for `fix()`, two for the map check), there is no fix: the caption says so and the map shows the last answer faded.

### What is computed and what is drawn by hand

Every distance, delay, ring, guess, dot, pale circle and caption is computed as you play. The receiver is only given satellite positions and signal times. It never sees where you really are. The page uses your true position only to draw you, to draw step 3's faint true-distance rings, and to say how far off the dot is.

Decoration: the orbiting satellites and the breathing dot at the top of the page, the stars, the satellite and person icons, and the windows on the buildings.

## What we simplified

- **The world is flat in steps 2 to 4.** A real phone solves for x, y, height and the clock, so it needs four satellites. Ours needs three. Step 3 says this on screen.
- **Step 1 is not to scale.** The arc the satellite sits on is a drawing, but the distance and delay come from the real geometry of an orbit 20,200 km up.
- **Step 4's wobble is about 500,000 times too big,** so you can see it. The page says so.
- **Nothing slows the signal down.** In real life the upper atmosphere adds a few metres. The orbits are perfect circles whose positions the phone knows exactly.
- **Step 5 has flat walls, one bounce at most, and a perfect city map.** The map check works better here than in a real city, and the sky turns about 140 times faster than real life.

## Where this falls short

### You never see how the phone measures the time

Every step rests on "the signal took 69.6 ms", and that's the hard part. A GPS signal arrives weaker than the noise around it. The phone finds it by sliding a copy of the satellite's known pattern of 1,023 on-off chips against what the antenna picks up until they line up. Our times come from the true distance plus noise. A better version would let the visitor slide the pattern themselves and watch the match rise out of the noise.

### The fourth satellite is only counted, not shown

Step 3 shows, in the flat picture, why the clock takes one extra satellite, and counts the unknowns for the real world (east–west, north–south, height and clock). But you never see the fourth satellite at work, because the picture is flat. A better version would add a small 3D view at the end.

### Smaller problems

- With the satellites bunched up in step 4, the cloud of answers is long and thin but the pale circle is round. Phones draw a circle too, but an ellipse would be more honest.

## Things we didn't make ourselves

| What | Where it's used | Why we chose it |
|---|---|---|
| The HTML canvas, built into browsers | All the interactive pictures | It draws anything we can describe in code, with nothing to install. |
| Space Grotesk, Inter and JetBrains Mono, from Google Fonts | The type | A slightly spacey display face, a plain one for reading, and a monospace face for the numbers. |
| Node's built-in test runner, `node:test` | The tests | It comes with Node, so the tests need nothing installed. |

Everything else, including the receiver, the orbits, the street and the theme switch, is plain JavaScript: it came from the organisers' exemplar, and we have built on it since.

## Sources for the facts on the page

- About 31 GPS satellites, 20,200 km up, in six orbits of just under 12 hours: GPS.gov, "Space segment", <https://www.gps.gov/systems/gps/space/>.
- Phones "typically accurate to within a 4.9 m (16 ft.) radius under open sky": GPS.gov, "GPS accuracy", <https://www.gps.gov/systems/gps/performance/accuracy/>.
- Satellite clocks 38 µs a day fast without correction, and the 10.22999999543 MHz setting: N. Ashby, "Relativity in the Global Positioning System", *Living Reviews in Relativity* 6, 2003.
- The navigation message at 50 bit/s, 12.5 minutes for the full almanac, the signal's minimum strength and the 1,023-chip code: the GPS interface specification IS-GPS-200, <https://www.gps.gov/technical/icwg/>.
- Pseudoranges, least squares and dilution of precision: P. Misra and P. Enge, *Global Positioning System: Signals, Measurements, and Performance*, 2nd ed., 2006.
- 3D-mapping-aided positioning on Android from 2020: F. van Diggelen, "Improving urban GPS accuracy for your app", Android Developers Blog, December 2020.

## Running it

There's no build step and nothing to install. From the top of the repository, run:

```bash
python3 -m http.server 8642
```

Then open <http://localhost:8642/submission/>. Browsers won't load JavaScript modules from a file opened directly, which is why it needs a server.

The receiver has tests in `tests/receiver.test.mjs`, using Node's built-in test runner (Node 20 or later). From the top of the repository, run:

```bash
node --test
```

They check the exact position and clock error with no noise, the refusal when there are too few satellites, the same answer from different first guesses, that `fix()` reads nothing but positions and times, that the pale circle matches the real scatter, and the step 5 bounce and map check.

## The code

There are about 870 lines of JavaScript, with no libraries. Each step has its own file, so you can explain one step without reading the others.

| File | What's in it |
|---|---|
| `js/app.js` | Starts everything: the theme, the five steps, the navigation bar. Each step only animates while it's on screen. |
| `js/theme.js` | Light and dark mode, and the colours the canvases borrow from the CSS |
| `js/geo.js` | The speed of light and the sizes of things, small vector helpers, a linear solver, seeded noise, where two circles cross |
| `js/receiver.js` | The receiver: `fix()` turns signal times into a position and a clock error, and `spread()` gives the pale circle |
| `js/draw.js` | Shared drawing: sizing a canvas, metres to pixels, the blue dot, satellites, dragging, the animation loop |
| `js/space.js` | The flat map of space shared by steps 2 to 4 |
| `js/step1-timing.js` … `js/step5-city.js` | One file per step |
| `js/ui.js` | The on/off switch, number formats, and `setHTML()`, which changes a caption only when its text changes |
| `tests/receiver.test.mjs` | Tests for the receiver and step 5 (see Running it) |

## Licences and credits

The code and text are under the MIT licence; see `LICENSE` at the top of the repository.

The fonts are Space Grotesk by Florian Karsten, Inter by Rasmus Andersson, and JetBrains Mono by JetBrains, all under the SIL Open Font License.
