# The throat in your phone

This is the example project for the Global Virtual Hackathon 2026, made by the organisers to show the kind of complete entry we hope to see. It isn't competing. "Where this falls short" near the end says what a winning entry would do better.

A second of CD audio takes 1,411,200 bits and an old digital landline used 64,000, but a mobile call usually gets about 12,000. That is too few to send the sound of a voice. So the caller's phone describes the throat and mouth that made the sound, 50 times a second, and the phone at the other end rebuilds the voice by sending a buzz or a hiss through a matching tube. This site is a working version of the simplest way to do that, the method secure government phones used in the 1980s, running in the browser.

## What you can do with it

### Plate I: what the other end hears of you

Record five seconds of yourself or borrow one of three voices. The voice is encoded and decoded as it plays. The throat in Fig. 1 is redrawn from every packet, a table lists what is in the current packet and how many bits each part takes, and a ruler places the bit rate between LPC-10 and a CD. Two spectrograms compare what was said with what the phone rebuilt. A switch flips between the real voice and the copy at the same moment, so you can hear exactly what was lost.

### Plate II: why hold music sounds like that

A piece of real elevator music goes through the same phone. The page explains why music breaks a codec built for one voice: a chord has several pitches but the packet has room for one, ten throat numbers can't hold the separate notes of several instruments, and anything without one clear pitch goes as hiss.

## How it works

Speech is sampled 8,000 times a second, the band an ordinary phone call carries. Every 20 ms the encoder takes a 40 ms slice through a Hamming window, boosts its high frequencies slightly, and measures how much each sample resembles the ones before it (autocorrelation). The Levinson–Durbin recursion turns those eleven numbers into ten reflection coefficients. They describe a filter, and they can also be read as a tube of ten sections of different widths, which is the "throat" the page draws.

The encoder also looks for a pitch in the slice. If it finds one, the sound is a buzz from the vocal folds; if not, it is a hiss, as in s, f and sh. Each packet carries four things:

| Part | How it is sent | Bits |
|---|---|---|
| Throat | Ten reflection coefficients as log-area ratios, 5 bits each for the first four, 4 for the next four, then 3 and 2 | 41 |
| Pitch | The length of one vocal-fold cycle, 20 to 147 samples (54 to 400 Hz) | 7 |
| Buzz or hiss | One bit | 1 |
| Loudness | One of 32 levels on a decibel scale | 5 |
| Total | | 54 |

At 50 packets a second that comes to 2,700 bits a second. The page takes every rate and bit count from `bitsPerFrame()` and `bitrate()` in `js/codec.js`, so the numbers on screen are the ones the encoder uses.

The receiver blends the throat from one packet to the next and drives it with clicks or with noise. A click is a single sharp tick, standing in for the moment the vocal folds snap shut. For a buzz it plays one click per pitch period, and for a hiss it plays noise. Because only these four things are sent, the copy keeps the words and the tune of the voice but loses its exact waveform. It sounds robotic because every buzz is built from the same simple tick.

### What is computed and what is drawn by hand

Everything you hear is computed from the input. The packet table shows the values and bits of the current packet. The spectrograms, the spectrum, the F1 to F3 labels and the throat in Fig. 1 are computed from the input and the packets as they play. The clicks drawn beside the throat are spaced by the real pitch, and the hold-music caption counts how many packets were buzz and how many were hiss.

Two things are drawn by hand. The dots for hiss beside the throat are random, and the waveform and moving packets in the call diagram at the top are decoration.

## What we simplified

The throat is a model of a tube, and it isn't the caller's anatomy. Ten reflection coefficients describe a tube with no side branch, so there is no nasal cavity, and the shape of the vocal-fold pulse and the effect of the lips end up folded into the same ten numbers. Fig. 1 is a fixed drawing of a head in which the airway, tongue, jaw and lips move to fit the ten areas. Before drawing, the areas are scaled to a common average size, kept within limits and eased from one packet to the next, so the drawing shows which way the throat is changing more faithfully than by how much.

Our packet is close to LPC-10's but not the same. LPC-10 sent 54 bits every 22.5 ms: 41 for the throat, 7 shared between pitch and buzz-or-hiss, and the rest for loudness and for keeping the two ends in step. Ours sends 54 bits every 20 ms with pitch and buzz-or-hiss separate and no way of keeping in step, so it couldn't talk to a real LPC-10 phone.

There is no radio. Nothing models lost packets, error protection or the network choosing a rate.

Everything is narrowband. Many calls now use wideband codecs such as AMR-WB and EVS, which carry 7 kHz or more, but everything here stops at 4 kHz.

## Where this falls short

### You can hear what the codec does, but you can't take it apart

Plate I has one phone with fixed settings. You hear that ten numbers, a pitch, a loudness and a buzz-or-hiss bit add up to a voice you can follow, but you never get to switch one part off and hear what it was doing, or spend fewer bits on the throat and hear the vowels blur. A winning entry would let the visitor remove each stage, so the explanation comes from what they hear.

### The code doesn't show that the receiver works from the packet alone

The page rests on the claim that your phone rebuilds the voice from the bits it is sent. That is true here, but only because `synthesise()` happens to read just the rounded values. The decoder takes the encoder's own frame objects, which carry the unrounded numbers right beside the rounded ones, no packet is ever written out as bits, and there are no tests. A winning entry would build the receiver as its own module that reads nothing but a stream of bits, with a test that proves it.

### It uses the 1984 buzz-or-hiss method, not the pulse search phones use now

Every phone call today sends the same kind of throat, but chooses its buzz far more carefully: every 5 ms it tries out patterns of pulses and sends the pattern that sounds closest to the voice. That method, ACELP, is why a real call sounds like a person and ours sounds like a robot. Footnote 4 explains it, but the site doesn't build it, so it doesn't show how modern codecs choose what drives the throat.

### Smaller problems

- The recorder uses `ScriptProcessorNode`, which browsers have deprecated.
- A few functions and constants are no longer used and should have been deleted.

## Things we didn't make ourselves

| What | Where it's used | Why we chose it |
|---|---|---|
| The Web Audio API, built into browsers | Playing sound and opening the microphone. All the filtering, resampling and coding is our own code. | A web page can't play or record sound any other way, and it needs nothing installed. |
| Google Gemini text-to-speech (voices Kore, Puck and Aoede) | The three borrowed voices | We needed clear speech saying exact words without recording real people. The files were made once and are stored here, and the site never contacts Google. |
| "Local Forecast – Elevator" by Kevin MacLeod | The hold music in Plate II | It sounds like real hold music, and its licence lets us change it. We downloaded it from incompetech.com. |
| A plate from *Gray's Anatomy* (1918, public domain) | The outline of the head in Fig. 1 follows it loosely | It's a clear side view of the throat and mouth that anyone can use. |
| IM Fell English, Alegreya and Alegreya SC, from Google Fonts | The type | They suit the look of an old book of anatomy plates. |

## Sources for the facts on the page

- CD audio, 44,100 samples × 16 bits × 2 channels: the Red Book standard, IEC 60908.
- Landlines at 64,000 bit/s: ITU-T G.711 (1972), <https://www.itu.int/rec/T-REC-G.711>.
- AMR, 4.75 to 12.2 kbit/s in 20 ms frames, standard for 3G: 3GPP TS 26.071, <https://www.3gpp.org/DynaReport/26071.htm>. Its pulse search every 5 ms (ACELP): 3GPP TS 26.090, <https://www.3gpp.org/DynaReport/26090.htm>.
- LPC-10, US Federal Standard 1015 (1984), 54 bits every 22.5 ms at 2,400 bit/s: FIPS 137, <https://en.wikipedia.org/wiki/FIPS_137>. Its use in STU-III secure phones: Crypto Museum, <https://cryptomuseum.com/ref/codec/lpc10>.
- Atal and Schroeder at Bell Labs, and Itakura and Saito at NTT: B. S. Atal, "The History of Linear Prediction", *IEEE Signal Processing Magazine* 23(2), 2006.
- N. Levinson, "The Wiener RMS error criterion in filter design and prediction", *Journal of Mathematics and Physics* 25, 1947. J. Durbin, "The fitting of time series models", *Review of the International Statistical Institute* 28, 1960. The figure of about a hundred multiplications is our own count: 110 multiplications and 10 divisions for ten sections.
- F1 and F2 doing most of the work of telling vowels apart: G. E. Peterson and H. L. Barney, "Control methods used in a study of the vowels", *JASA* 24(2), 1952.
- EVS, agreed in 2014 as 3GPP TS 26.441 and first launched in 2016, and its switch between speech and music coding: Dietz et al., "Overview of the EVS codec architecture", ICASSP 2015.
- Whispering with the vocal folds slightly apart: UCL phonetics course notes, <https://www.phon.ucl.ac.uk/courses/spsci/iss/week4.php>.

## Running it

There's no build step and nothing to install. From the top of the repository, run:

```bash
python3 -m http.server 8642
```

Then open <http://localhost:8642/submission/>. Browsers won't load the JavaScript modules from a file opened directly, which is why it needs a server. Recording also needs localhost or HTTPS. With no microphone, or with permission refused, the page says so, and the borrowed voices and sound files still work.

## The code

There are about 1,800 lines of JavaScript, with no libraries.

| File | What's in it |
|---|---|
| `js/dsp.js` | FFT, windowing, autocorrelation, Levinson–Durbin, tube areas, log-area-ratio rounding, pitch detection |
| `js/codec.js` | The vocoder: frame analysis, bit counting and the click-or-noise receiver |
| `js/audio.js` | Loading, resampling, recording and the A/B player |
| `js/viz.js` | The call diagram, Fig. 1, the spectrum and the spectrograms |
| `js/app.js`, `js/hold.js`, `js/ui.js` | The two plates and the shared controls |

## Licences and credits

The code and text are under the MIT licence; see `LICENSE` at the top of the repository.

`audio/hold-music.wav` is "Local Forecast – Elevator" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0, <https://creativecommons.org/licenses/by/4.0/>. We kept the first 14 seconds and mixed it to one channel at 8 kHz, and the versions the site plays through the phone are our own changes.

`audio/caller-*.wav` were generated with Google Gemini text-to-speech. Under the Gemini API terms, Google doesn't claim ownership of what it generates.

The fonts are IM Fell English by Igino Marini, and Alegreya and Alegreya SC by Juan Pablo del Peral (Huerta Tipográfica), all under the SIL Open Font License.
