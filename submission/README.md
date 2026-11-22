# Nobody up there knows where you are

This is the example project for the Global Virtual Hackathon 2026, made by the organisers to show the kind of complete entry we hope to see. It isn't competing. "Where this falls short" near the end says what a winning entry would do better.

Most people think a satellite tells their phone where they are. It doesn't. No satellite knows you exist. About thirty GPS satellites, 20,200 km up, keep announcing which satellite they are, where they are and what time it is. Your phone only listens. A message that took 0.07 seconds to arrive came from 21,000 km away, and with enough of those distances there is only one place you can be standing. The catch is that your phone's clock is nowhere near good enough to time them, so it has to work out its own clock error at the same time, and that is why it needs one more satellite than you'd think. This site is a working version of that sum, running in the browser.

## What you can do with it

### Sheet 1: where the blue dot comes from

Ten satellites go round the Earth, drawn to scale. Around every satellite your phone can hear is a circle as big as the distance its signal says it travelled, and you are where they meet. You can drag satellites along their orbit, switch them off, or drag yourself around the Earth, and watch the circles and the dot follow. You can set the phone's clock wrong by a millionth, a thousandth or a hundredth of a second, then flip a switch between trusting the clock and working it out. A close-up redraws itself at whatever zoom fits the error, from 60 m to 40,000 km across, with the blue dot, the pale shape around it, and the answers the phone would give over many seconds. A table lists what each satellite's signal took and what distance that means, and a button steps through the phone's guesses one at a time, starting from the centre of the Earth.

### Sheet 2: why the dot wanders downtown

A street seen end on, with glass buildings on both sides. As the sky turns, each satellite's signal is drawn as it reaches you: straight, bounced off the glass opposite, or blocked. Next to it is the map your phone would show, with a trail of where the dot has been. You can change how tall the buildings are, move where you stand, and switch between using every signal and checking them against a 3D city map first.

## How it works

The world is a flat slice through the middle of the Earth. Positions are in metres from the Earth's centre. Each satellite is on a circle 26,560 km from the centre and goes round once every 11 h 58 min, sped up on the page so one orbit takes four minutes. A satellite can be heard if it is at least 5° above your horizon and you haven't switched it off.

For each satellite it can hear, the phone gets two things: where the satellite is, and how long its signal took by the phone's own clock. That time is the real travel time, plus noise of about 1.5 m (in distance), plus the phone's clock error. Multiplying by the speed of light gives a distance that is wrong by the same amount for every satellite. GPS engineers call it a pseudorange.

The receiver, `fix()` in `js/receiver.js`, solves for three unknowns: x, y, and the clock error. It uses Gauss–Newton least squares:

1. Guess. The first guess is the centre of the Earth with a perfect clock.
2. Work out how long each signal would have taken if the guess were right.
3. Compare with what was measured. For each satellite, note which way moving the guess would change that time.
4. Solve a 3×3 set of equations for the move that best shrinks all the differences at once, and take it.
5. Repeat until the move is under a millimetre. It takes about five steps.

With the clock switch on "trust the phone's clock", the same code solves for just x and y and leaves the clock error in the distances, which is why the dot lands hundreds of kilometres away.

The pale shape around the dot comes from `spread()`. It inverts the same matrix the solver used to find how much the answer moves for a metre of error in each distance (GPS engineers call this dilution of precision), and scales it by the noise. It gets long and thin when the satellites you hear are bunched together, and it is usually taller than it is wide, because every satellite you can hear is above you.

On Sheet 2 the satellites are so far away that their signals arrive as parallel lines. `signalPath()` in `js/canyon.js` decides, for each satellite, whether the line from you to it clears the roof on its side. If not, it checks for a single bounce off the glass wall opposite, which adds `2 × (your distance from that wall) × cos(elevation)` metres to the trip. Anything else is blocked. The same `fix()` then solves for across-the-street position, height and clock. With the city-map switch on, the phone tries every spot across the street 25 cm apart, predicts how long every signal should take from there with its map (bounces included), and keeps the spot where the predictions fit best after the common clock error is taken out.

### What is computed and what is drawn by hand

Every position, distance, clock error, pale shape and message on both sheets is computed by the code as it runs. The receiver is only given satellite positions and travel times. It never sees where you really are. The page uses your true position only to say how far off the dot is and to draw you.

Three things are decoration. The strip at the top is not to scale, and the time in it is your computer's clock. The dots moving along the lines in Fig. 1 don't travel at any real speed. The figure of a person and the street names are drawings.

## What we simplified

The world is flat. A real phone solves for x, y, z and the clock, so it needs four satellites. Ours lives in a slice of the Earth, so it needs three. All ten satellites are on one circle, and we picked ten so that a few are always in view. A real sky is full of satellites going different ways.

The distances are made up. Each one is the true distance plus noise we chose, so the pale shape always matches the spread of the dots exactly. A real phone has to estimate its own noise.

Nothing slows the signal. In real life the upper atmosphere delays it by several metres, more by day than by night. We also ignore the Earth turning while the signal travels, and the satellites' orbits are perfect circles whose positions the phone knows exactly.

The street has flat walls, one bounce at most, and a receiver that always picks the straight signal when both arrive. Real reflections blur together with the straight signal. Our city map is perfect, and our phone knows its height and which street it's in, so the map check works far better here than in a real city.

## Where this falls short

### You never see how the phone measures the time

The whole page rests on "the signal took 71.714 ms". That is the hard part, and we skip it. A GPS signal arrives far weaker than the noise around it. The phone finds it by sliding a copy of the satellite's known pattern of 1,023 on-off chips, which repeats every millisecond, against what the antenna picks up, until they line up. Our distances come straight from the true distance plus noise. A winning entry would let the visitor slide the pattern themselves and watch a match rise out of the noise.

### The code doesn't prove the receiver works from the measurements alone

`fix()` is only given satellite positions and travel times, and it is careful not to look at anything else. But nothing enforces that, and there are no tests. A winning entry would test the receiver against known answers: the exact position when there is no noise, the clock error recovered to the nanosecond, a refusal when there are too few satellites, and the same answer from any starting guess.

### The world is flat

The flat slice makes the pictures clear, but it loses the step most people stumble on, which is that the real thing needs four satellites, not three. A winning entry would have a 3D globe, or at least a second view that shows why the fourth is needed.

### Smaller problems

- On Sheet 2 the sky turns about seventy times faster than real life, which makes the dot jump more often than it really would.
- The side view draws the dot's height even when it is far above the street, clamped to the edge of the picture.
- `mapCheck()` is exported only so we could test it from the command line.

## Things we didn't make ourselves

| What | Where it's used | Why we chose it |
|---|---|---|
| The HTML canvas, built into browsers | All the drawings | It draws anything we can describe in code, with nothing to install. |
| Fraunces, Source Serif 4 and IBM Plex Mono, from Google Fonts | The type | A serif for reading, and a typewriter face for the numbers, to suit a field guide. |

Everything else, including the solver, the orbits and the street, is our own code.

## Sources for the facts on the page

- GPS constellation size, orbit height of 20,200 km, six orbital planes and an orbit of just under 12 hours: GPS.gov, "Space segment", <https://www.gps.gov/systems/gps/space/>.
- Phones "typically accurate to within a 4.9 m (16 ft.) radius under open sky": GPS.gov, "GPS accuracy", <https://www.gps.gov/systems/gps/performance/accuracy/>.
- Satellite clocks 38 µs a day fast without correction, and the 10.22999999543 MHz setting: N. Ashby, "Relativity in the Global Positioning System", *Living Reviews in Relativity* 6, 2003.
- The navigation message at 50 bit/s, 25 pages of 30 seconds (12.5 minutes) for the full almanac, and the 1,023-chip code repeating every millisecond: the GPS interface specification IS-GPS-200, <https://www.gps.gov/technical/icwg/>.
- Pseudoranges, least squares and dilution of precision: P. Misra and P. Enge, *Global Positioning System: Signals, Measurements, and Performance*, 2nd ed., Ganga-Jamuna Press, 2006.
- 3D-mapping-aided positioning on Android from 2020: F. van Diggelen, "Improving urban GPS accuracy for your app", Android Developers Blog, December 2020. Shadow matching: P. D. Groves, "Shadow matching: a new GNSS positioning technique for urban canyons", *Journal of Navigation* 64(3), 2011.
- The speed of light, 299,792,458 m/s, exact by definition of the metre since 1983.

## Running it

There's no build step and nothing to install. From the top of the repository, run:

```bash
python3 -m http.server 8642
```

Then open <http://localhost:8642/submission/>. Browsers won't load JavaScript modules from a file opened directly, which is why it needs a server.

## The code

There are about 900 lines of JavaScript, with no libraries.

| File | What's in it |
|---|---|
| `js/geo.js` | The speed of light and the sizes of things, small vector helpers, a linear solver, seeded noise |
| `js/receiver.js` | The receiver: `fix()`, which turns travel times into a position and a clock error, and `spread()`, the pale shape |
| `js/sky.js` | Sheet 1's world: the satellites, their orbit, your horizon and what each signal took |
| `js/canyon.js` | Sheet 2: signal paths in the street, bounces, and the city-map check |
| `js/viz.js` | Every drawing: the strip, Fig. 1 to Fig. 4 |
| `js/app.js`, `js/ui.js` | Sheet 1's controls and the shared switch, play button and number formats |

## Licences and credits

The code and text are under the MIT licence; see `LICENSE` at the top of the repository.

The fonts are Fraunces by Undercase Type, Source Serif 4 by Frank Grießhammer for Adobe, and IBM Plex Mono by Mike Abbink and Bold Monday for IBM, all under the SIL Open Font License.
