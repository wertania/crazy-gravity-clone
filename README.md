# Gravity Hauler

A gravity cave flyer built with Three.js and TypeScript — a modern take on the
1996 Windows shareware game *Crazy Gravity* by Axel Meierhöfer (XLM Software),
which itself descends from *Thrust* (1986) and Atari's *Gravitar*.

> **The game's interface is German.** Menus, HUD, level names and hints are all
> in German; this README stays in English as developer documentation.

Rotate the ship, burn the engine along its nose, fight a constant downward pull,
pick up freight and put it down softly on the base pad. The rock is always fatal.

![Cave 01, First Light](shots/level01.png)

<table>
<tr>
<td><img src="shots/boot.png" alt="Loading screen: ship silhouette, progress bar, status line" /></td>
<td><img src="shots/title.png" alt="Title menu: two-line rows with a label, an explanation and a value chip" /></td>
</tr>
</table>

<table>
<tr>
<td><img src="shots/level05-cannons.png" alt="Cave 05, Crossfire: cannons firing on a fixed beat" /></td>
<td><img src="shots/level07-blowers.png" alt="Cave 07, Updraft: blower shafts" /></td>
</tr>
<tr>
<td><img src="shots/level13-unlit.png" alt="Cave 13, Glow-worm: an unlit cave lit only by the ship's lamp" /></td>
<td><img src="shots/level20-finale.png" alt="Cave 20, Eventide" /></td>
</tr>
<tr>
<td><img src="shots/phone-landscape.png" alt="On a phone in landscape: steering paddle bottom left, throttle paddle bottom right held open, HUD stacked at the top" /></td>
<td><img src="shots/difficulty.png" alt="Difficulty screen listing speed and thrust per tier" /></td>
</tr>
</table>

> Screenshots are captured from the built bundle in a real Chromium under
> SwiftShader software rasterisation, with the quality tier **pinned to the top
> one** so bloom is actually on. Pinning matters: the adaptive quality system
> disables bloom on a software renderer, so screenshots taken without it show a
> different game from the one a GPU renders — which is how an over-bright build
> once shipped past several rounds of "looks fine to me".

> **On the name and the content.** Game mechanics are not copyrightable, but
> names, art, sound and level layouts are. Nothing here is taken from the
> original: the title, the twenty caves, the passwords, the ship, every sound
> and every line of code are original work. "Crazy Gravity" is also an unrelated
> 2021 Steam title, which is a second good reason not to reuse the name.

---

## Play

```bash
npm install
npm run dev            # http://127.0.0.1:5173
```

```bash
npm run build          # type-check + production bundle into dist/
npm run preview        # serve the built bundle
```

### Controls

| | |
|---|---|
| <kbd>A</kbd> / <kbd>←</kbd> | links drehen — rotate left |
| <kbd>D</kbd> / <kbd>→</kbd> | rechts drehen — rotate right |
| <kbd>W</kbd> / <kbd>↑</kbd> / <kbd>Space</kbd> | Schub — thrust along the nose |
| <kbd>S</kbd> / <kbd>↓</kbd> | Lage-Assistent — auto-level assist |
| <kbd>R</kbd> | Höhle neu starten — restart the cave |
| <kbd>Esc</kbd> / <kbd>P</kbd> | Pause |
| <kbd>M</kbd> | Ton an/aus — mute |
| <kbd>F3</kbd> | Technik-Anzeige — debug overlay |

Gamepads work too — left stick or d-pad to turn, A or the right trigger to
thrust. The trigger is analog.

**On a touchscreen** two paddles appear automatically. Each owns half of the
lower screen as a gesture zone, with a slider drawn inside it as an indicator —
press anywhere in the zone and drag: sideways on the left to steer, upwards on
the right for power. The mapping is *relative*, so there is no invisible origin
to find first and a thumb landing beside the drawn track works exactly the same.
Both are analog, both spring back when you let go, and they work simultaneously
as two thumbs. Force them on or off under Settings. Landscape gives you
noticeably more cave to see; portrait is playable and the game says so once,
rather than blocking the screen.

Thrust only ever fires along the nose. To slow down you have to turn around
first, and that turn is the entire game.

### Making it easier

Two independent dials, both under Settings and Difficulty:

- **Pace** (default *Gentle*, 85%) scales how much simulated time passes per
  real second. It is not a physics change — gravity, thrust and the speed cap
  keep their exact relationships and the ship handles identically. You simply
  get more real milliseconds to react in, which is the most effective and least
  balance-breaking difficulty dial a reaction game has.
- **Difficulty** (default *Rookie*) changes the hull itself. The two biggest
  dials are **top speed** and **thrust**: Rookie flies at 58% speed and 70%
  thrust, Legend at 118% and 112%. A slower ship simply cannot build up a
  velocity it has no room to shed, so most crashes stop happening rather than
  being survived. Hulls, fuel, gravity, hazard tempo, landing tolerance and the
  score multiplier move with it. It never changes the level list.

  | tier | speed | thrust | hulls | score |
  |---|---|---|---|---|
  | Rookie | 58% | 70% | 9 | 0.60× |
  | Pilot | 76% | 84% | 6 | 1.00× |
  | Ace | 100% | 100% | 4 | 1.35× |
  | Veteran | 108% | 105% | 3 | 1.80× |
  | Legend | 118% | 112% | 1 | 2.50× |

---

## What it takes from 1996, and what it does differently

Faithful to the original's design:

- **Rotate-and-thrust only.** No directional control, no braking key.
- **Wall contact is death.** Pads are the only soft surface.
- **The full resource set:** fuel, a time target, a hull count, coloured keys
  and gates, freight waiting versus freight aboard, and the green / yellow / red
  landing indicator.
- **Five difficulty tiers, twenty caves, and per-level passwords.**
- **Hazards from the original's roster:** cannons, magnets, blowers, moving
  rods, one-way sluices and locked colour gates.

Deliberately modern:

- **Flow.** Skimming close to rock *at speed* fills a meter that multiplies your
  score and trickles fuel back. The original punished proximity and rewarded
  nothing for skirting it; here the fastest line is also the most dangerous one,
  which turns a punishing game into a risk/reward loop without softening it.
- **Cargo mass is a decision.** You can carry three crates, but each one makes
  the hull heavier and lazier. Haul all three in one trip or shuttle twice —
  that is a real choice, not a formality.
- **Retry latency near zero.** <kbd>R</kbd> restarts instantly, respawn after a
  crash takes under a second, and delivered freight and collected keys stay
  banked. Death costs a hull, not your progress.
- **Difficulty never gates content.** Rookie plays all twenty caves; the tiers
  change gravity, fuel, hazard tempo and landing tolerance — and your score
  multiplier — not the level list.
- **Locked gates bump instead of killing.** Grey rock kills, coloured tech
  pushes you back, red crystal kills. A consistent visual language means a
  mechanic can teach itself without a death.
- **One new idea per cave.** Each of the first thirteen levels introduces
  exactly one mechanic in a safe room before it is ever combined.
- **Medals and a par time** instead of a hard timer — except on Veteran and
  Legend, where the clock does bite.
- **A loading screen that exists before the JavaScript does.** Markup, styles
  and progress script are inline in `index.html`, so the very first paint shows
  a title card rather than a black rectangle. Its phases are real milestones —
  bundle running, shaders compiling, first frame composited — not a fake timer,
  and it explains a slow connection and a failed download instead of hanging.
- **Autosave**, so passwords are a convenience rather than homework.
- **Analog throttle.** The original was strictly on/off and a key still gives
  full power, but the touch slider and gamepad triggers are continuous, and
  fuel burn follows the throttle. Feathering the engine to hold a hover is what
  makes a touchscreen viable at all — hover sits at about a third of the slider
  travel, leaving usable resolution on both sides of it.
- **Adjustable pace**, defaulting below 1, and per-tier speed and thrust.

---

## Architecture

```
src/
  sim/          simulation - no DOM, no Three.js, runs in node
    config.ts     every tuning constant in one table
    types.ts      tile codes, input frame, event types
    level.ts      the carve DSL, the baker, the validator
    levels.ts     the twenty caves
    collision.ts  circle vs tile grid, sub-stepping, wall proximity
    world.ts      entities and stepWorld()
  app/          orchestration
    loop.ts       fixed timestep + interpolated rendering
    input.ts      keyboard and gamepad -> InputFrame
    save.ts       localStorage progress
    game.ts       state machine wiring everything together
  render/       Three.js views over the simulation
    scene.ts      renderer, camera rig, bloom
    terrain.ts    instanced cave geometry
    actors.ts     ship and props
    particles.ts  one pooled additive point cloud
    backdrop.ts   parallax layers
  ui/           DOM overlay (German)
    hud.ts, screens.ts, touch.ts
  audio/        procedural WebAudio, no sample files
tests/          vitest unit + integration, playwright end-to-end
```

The dependency arrow only ever points one way: `sim` knows nothing about
`render`, `ui`, `app` or the browser. That is what lets the whole game be
simulated headlessly in tests.

### Simulation

Fixed 120 Hz timestep with an accumulator and a `dt` clamp; rendering is
decoupled and interpolates between the last two states. Integration is
semi-implicit (symplectic) Euler — stable, cheap, and energy-behaved enough for
a gravity game, where explicit Euler visibly drifts.

Collision is a circle against the tile grid. Movement is sub-stepped so the hull
can never skip a one-tile wall at the speed cap; there is a unit test that fires
the ship at a single solid column at maximum velocity and asserts it dies on the
near side.

### How levels are authored

Levels are not painted tile by tile. Each starts as solid rock, and a short list
of shapes — rooms, elliptical caverns, polyline tubes — is subtracted from it. A
seeded value-noise field perturbs every carve boundary, so the result reads as
an organic cave instead of a rectangle collage while the source data stays small
enough to diff:

```ts
{
  name: 'First Light',
  carve: [
    { t: 'cave', cx: 20, cy: 14, rx: 13, ry: 8 },
    { t: 'cave', cx: 70, cy: 30, rx: 12, ry: 9 },
    tube(3.2, [20, 14], [44, 17], [70, 30]),
  ],
  pads: [{ x: 13, y: 8, w: 7, kind: 'base' }],
  objects: [{ t: 'cargo', x: 70, y: 28 }],
}
```

Baking is deterministic — same spec in, byte-identical grid out — which is what
makes the validator and the replayable autopilot trustworthy. `validateLevel`
flood-fills from the spawn and fails the build if any crate, key or pad is
unreachable, if a pad is too narrow to land on, or if a gate colour has no key.

### Rendering

The 2D playfield is drawn as a 3D relief: solid tiles are boxes extruded towards
the camera, open space is the dark floor between them. The camera is perspective
rather than orthographic on purpose — the slight parallax on wall flanks near
the screen edge is what makes a tile grid read as a cavern.

A whole level is a handful of draw calls (instanced rock, instanced pads,
instanced spikes, floor plane) plus one pooled point cloud for every particle in
the game. Only rock within two tiles of open space is instanced at all — the
mass behind the cave wall is painted onto the floor slab from a texture built
straight out of the tile grid, which cuts the geometry roughly fivefold without
changing what you see. Unlit levels dim the global lights and leave only the
ship's lamp.

Quality steps itself down automatically after a sustained slow patch: first
bloom, then the buffer resolution. On software rendering the game stays
playable, it just stops glowing.

---

## Testing

```bash
npm test               # vitest: unit + headless integration
npm run e2e            # playwright: real browser, real WebGL
```

**Unit** (`tests/physics.test.ts`) covers free fall against the analytic
solution, hover equilibrium, the speed cap, frame-rate independence, fuel burn,
throttle linearity, a steady hover on a constant analog throttle, the throttle
dead zone, per-tier speed caps and acceleration, fuel buying the same delta-v on
every tier, wells staying climbable on every tier, the auto-level controller, contact normals, anti-tunneling, landing
versus crashing at the tolerance boundary, difficulty-scaled tolerance, respawn
semantics, and the flow meter's earn and decay rules.

**Level validation** (`tests/levels.test.ts`) bakes all twenty caves and asserts
each one is structurally valid, deterministic, fully connected from the spawn,
and sealed by a solid border.

**Integration** (`tests/integration.test.ts`) flies levels end to end with a
scripted pilot (`tests/autopilot.ts`) that plans routes with Dijkstra over the
tile grid and follows them with a PD thrust-vector controller. It exercises the
real loop: routing, keys and gates in order, one-way sluices, magnets, blowers,
refuelling, cargo mass, delivery, scoring and the clear condition.

Its scope is stated honestly in the test file. It finishes **13 of the 20 caves
with timing hazards disabled** and **8 of those with every hazard live**. The
seven it does not finish (3, 7, 10, 11, 13, 14, 17) are a limitation of the
pilot, not evidence those caves are unwinnable — it follows a static route and
loses time in long fuel-critical tunnels and dies at sharp bends in narrow
tubes. Their geometry is covered instead by the reachability validator.

**End to end** (`tests/e2e/smoke.spec.ts`) drives a real Chromium: the loading
screen carries the wait with the bundle held open and hands over cleanly once it
lands, a failed download is reported rather than hung on, WebGL boots,
the menus navigate, keyboard flight actually moves the ship and burns fuel,
gravity pulls it back down, pause genuinely freezes the simulation, restart
resets it, passwords unlock caves, progress survives a reload, and — on the
largest level — simulated time keeps pace with wall time while the quality
system steps itself down. That last one runs on SwiftShader, a software
rasteriser around two orders of magnitude slower than a GPU, so it asserts the
property that matters (the simulation does not stall or run fast) rather than a
frame count that would mean nothing on real hardware.

It also drives the on-screen controls for real: the throttle slider is checked
for analog response at half and full travel, for actually lifting the ship and
draining fuel, and for springing shut on release; the steering slider for
turning the hull and re-centring; and both together, one under a real
touchscreen pointer and one under the mouse, to prove two thumbs do not fight
each other. Plus: a fresh save starts on the easier defaults, and the Brisk pace
really does advance simulated time faster than Gentle.

### Bugs these tests actually caught

Worth recording, because each one was a design flaw rather than a typo:

- The autopilot could not land at all. A "thrust when demand exceeds a
  threshold" rule is a bang-bang controller whose equilibrium sits at a
  *positive* climb rate — it hovers forever and can never touch down. Replacing
  it with PWM-modulated thrust fixed it.
- A clamp that stopped the nose from turning past ±77° made it impossible to
  thrust downwards, which is the only way to stop climbing inside an updraft.
- The route planner happily pathed backwards through one-way sluices, wedging
  the ship against a membrane it could never re-enter.
- Manhattan-distance clearance has a discontinuous gradient; steering off it
  chattered so badly the alignment gate never opened and the ship hung in place
  with the engine off. A chamfer distance transform fixed it.
- A pad's rock foundation sealed the only tunnel into a chamber in level 14 —
  caught by the reachability validator before it ever reached a player.
- `lives: 1` gave two attempts, off by one.
- The particle shader patch declared an attribute named `size`, which collides
  with `PointsMaterial`'s own uniform and fails to compile. Only a real browser
  finds that.
- The ship carried a point light at intensity 60 over an 18-unit range on lit
  levels, which put a floodlit disc on the cave floor; with bloom on top the
  ship disappeared inside a white ball. Every screenshot until then had been
  taken with bloom auto-disabled by the quality system, so nobody had looked at
  the thing being complained about. There is now a browser test that pins the
  top tier and measures the fraction of the frame blown out to white — ~0.03%
  after the fix against ~0.28% before, so it discriminates.
- The game loop capped catch-up at 8 sub-steps, which silently ran the
  simulation in slow motion on a slow renderer instead of just dropping frames.
- Distance fog was configured in world units without accounting for the camera
  sitting ~44 units back, so the unlit level rendered as a completely black
  screen. Only a screenshot finds that.
- A `SpriteMaterial` with no map is a hard square, so the ship's "halo" was a
  cyan box.
- The results card scaled the total by the difficulty multiplier but printed
  unscaled rows, and omitted freight and key points entirely — an itemised
  table whose rows did not add up to its own total.

A fourth round, from the loading screen and the menu rewrite:

- The menu's selection marker was a CSS `::before` glyph, and Chromium folds
  pseudo-element content into the accessible name — so the selected row
  announced itself as "▸ Zurück". Noise for a screen reader, and it silently
  broke name-based lookups. The marker is now drawn with borders, which never
  enter the accessibility tree.
- The title panel overflowed its own `max-height` on a 800-pixel-tall window,
  cutting the last menu row in half.

A third round, after making the hull speed difficulty-dependent — two of these
were real balance bugs that only a slow tier could expose:

- **Gravity wells were never difficulty-scaled.** The finale's well pulls at 22
  while Rookie's thrust is 18.2, so the ship simply could not climb out of it.
  Wells are an environmental force the engine has to fight, so they now scale
  with thrust and the ratio stays constant across tiers.
- **Fuel was charged per second, not per unit of speed change.** A weaker engine
  needs ~1.4× as long to achieve the same manoeuvre, so the gentlest difficulty
  was quietly the most fuel-starved one. Burn now scales alongside thrust, which
  makes fuel buy a fixed amount of delta-v on every tier.
- The first touch controls made the drawn slider the hit area. A thumb landing
  beside a 52-pixel-wide track and swiping up did nothing at all — which is
  exactly what it felt like. Both paddles are now large gesture zones with
  relative mapping.
- The knobs were positioned with CSS transform percentages, and **a translate
  percentage resolves against the element being moved, not its container**. So
  full throttle shifted the knob by one knob-height instead of one
  track-length — roughly a third of the way — and at rest it was translated
  half its own height below the track, where `overflow: hidden` cut it in half.
  Knob offsets are computed in pixels from measured geometry now, and two
  browser tests assert the knob stays fully visible and covers at least 95% of
  the room it has.

A second round, after the touch controls went in:

- The camera framed more than the level contained on a portrait phone, so the
  player got black bands past the rock border. The min-horizontal-span rule was
  also written with a bogus `tan(fov/2 * aspect)` term that only looked right at
  16:9.
- Reserving space for the sliders by pushing the bottom HUD row up by their
  height landed it in the middle of the playfield. Both HUD rows now stack at
  the top when the sliders are mounted.
- A guessed margin for the controls did not survive an orientation change, so
  the widget height is measured and published as a CSS variable instead.

Playtesting the autopilot runs also changed three level designs: level 7's
blowers were producing a 2 g net updraft that pinned you to the ceiling, level
13's tunnel was too long for a single refuel pad at the far end, and level 3
started with too little fuel to reach the first pad with any margin.

---

## Deployment

The game is a static bundle — no server, no database, no state that outlives a
tab. The image is a two-stage build: Node builds `dist`, nginx serves it, and
the ~300 MB of `node_modules` stays behind in the build stage.

```bash
docker build -t gravity-hauler .
docker run --rm -p 8080:80 gravity-hauler   # http://localhost:8080
```

or, the same thing through compose:

```bash
docker compose up --build                   # http://localhost:8080
```

### On Coolify

New resource → **Public Repository** (or your Git source) → this repo, branch
`main`.

| Setting | Value |
|---|---|
| Build pack | **Dockerfile** |
| Dockerfile location | `/Dockerfile` |
| Port | `80` |
| Health check path | `/healthz` |

Nothing else is required: no build command, no environment variables, no
volumes. Coolify's proxy terminates TLS and forwards to port 80 inside the
container. The image declares its own `HEALTHCHECK`, so the container status in
the UI reflects whether nginx is actually answering rather than merely running.

Choosing the **Docker Compose** build pack instead works too — remove the
`ports:` block from `docker-compose.yml` first, or Coolify will try to publish
8080 on the host as well as route through its proxy.

### What the nginx config does

`docker/default.conf`, with the shared response headers in
`docker/security-headers.conf`:

- **`/assets/` is cached for a year, immutable.** Vite fingerprints those
  filenames, so the name changes whenever the content does.
- **`index.html` is `no-cache`.** Not "don't store" — store it, but revalidate,
  so a deploy is picked up on the next load instead of whenever a cache feels
  like expiring.
- **gzip on the fly.** The bundle goes out at 178 kB instead of 684 kB, which on
  mobile data is most of the loading screen's reason to exist.
- **`/healthz` returns `ok`**, outside the access log so a 30-second probe does
  not drown the interesting lines.
- **CSP, nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options**, all
  `always`, and included in *each* location block — an `add_header` inside a
  location discards the inherited set rather than adding to it, which is the
  classic way security headers vanish from exactly the responses that matter.
  The policy is `'self'` throughout with one concession: `'unsafe-inline'` for
  script and style, because the loading screen is inline in `index.html` on
  purpose.

Two things this config deliberately does *not* do. There is no `listen [::]:80`
— on a host with IPv6 switched off in the container's network namespace that is
not a degraded service, it is a container that refuses to start, and Coolify's
proxy is what faces the public network anyway. And there is no `gzip_static`,
which would trade CPU for a pre-compression step at build time: the directive is
missing from some nginx builds, and an unknown directive is again a container
that will not start.

The source map ships with the build. Browsers only fetch it when devtools are
open, so it costs a visitor nothing and makes a production stack trace readable.

### Verifying it

The image was built and run, and the whole browser suite was pointed at the
container instead of `vite preview` — all green, WebGL and all. Also checked
against the running container: the headers arrive on both HTML and asset
responses, gzip is applied (684 kB → 178 kB), `/healthz` returns `200 ok`, the
declared `HEALTHCHECK` reports `healthy`, a missing fingerprinted asset 404s
rather than being quietly answered with `index.html`, and `docker compose up`
brings the same thing up on :8080. The image is 78 MB.

Testing it caught two things. `listen [::]:80` in the first draft is not a
degraded service but a container that refuses to start where IPv6 is off in the
container's network namespace. And the nginx base image's own `50x.html` was
sitting in the webroot next to the game, so the directory is emptied before
`dist` is copied in.

---

## Licence

MIT. See `LICENSE`.
