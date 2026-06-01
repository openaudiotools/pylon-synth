# pylon-synth — web UI implementation plan

Detailed, todo-driven plan for the **web UI** milestone and its deployment to
`pylonsynth.xyz` on Cloudflare. Simplicity is the primary constraint: no build
step, no framework, minimal dependencies.

For the product overview see [`PLAN.md`](PLAN.md); for design-decision history
see the project journal (`venturesquad/pylon-synth`).

## Scope this round

**In scope:** the `web/` three.js control surface and its Cloudflare deploy.

**Out of scope:** the SuperCollider engine. Note triggering / the MIDI *sequence*
is played in SuperCollider for now — the web page only **dispatches operator CC**.
The engine consumes that CC; building it is a later milestone.

## Assumptions (chosen for simplicity — flag if wrong)

- **No build step.** Single `index.html` + ES modules, `three` loaded from a CDN
  via an import map. Served as static files; deployable as-is.
- **4 pylons = 4 operators.** One pylon per operator (`M1`, `M2`, `c1`, `c2`).
- **The web side is parameter-agnostic.** A pylon's only job is to map its Y
  position to a CC value `0–127` and send it. *What* that CC drives on the operator
  is decided entirely in SuperCollider — for now it maps to the operator's
  **frequency ratio**, but the web never needs to know that. All other params and
  note/pitch decisions live in SuperCollider.
- **Config-driven CC numbers.** A config file lists the pylons; each pylon entry
  carries its own `cc` property. Each SuperCollider operator listens on a
  predefined CC number; the config is the contract between the two sides.
- **Full CC range.** Y maps linearly across the whole `0–127` range.
- **MIDI channel 1** (placeholder default).
- **World unit = 1 metre.** Pylon vertical band is `y ∈ [1, 6]`.
- **Fixed camera.** Single static framing showing all 4 pylons (no orbit).
- **Connector lines = the algorithm only.** Lines just show the FM routing
  (`M1→c2`, `M1→M2`, `M2→c1`); they are static and do not encode value/depth.
- **Chrome / Edge only** (Web MIDI API). No fallback for Firefox/Safari.

## Tech stack

| Concern | Choice |
|---|---|
| 3D | three.js via CDN import map (no bundler) |
| MIDI out | Web MIDI API (`navigator.requestMIDIAccess`) |
| Transport to engine | loopMIDI virtual port (user-selected) |
| Hosting | Cloudflare Workers static assets, custom domain `pylonsynth.xyz` |
| Tooling | `wrangler` (dev + deploy) |

## Repo layout (web/)

```
web/
├── index.html        # import map + canvas + minimal UI (port picker, status)
├── main.js           # bootstraps scene + MIDI, wires interaction
├── scene.js          # three.js scene, ground, lights, render loop
├── pylon.js          # Pylon class: bicone + connector ring + halo
├── connections.js    # draws the FM routing lines (bright lime)
├── midi.js           # Web MIDI: access, port selection, throttled CC send
├── config.js         # pylon list (each with cc), palette, band constants
├── style.css         # overlay UI styling
├── wrangler.jsonc    # Cloudflare config (excluded from served assets)
├── package.json      # dev-dep: wrangler (excluded from served assets)
└── .assetsignore     # keeps tooling files out of the deployed bundle
```

(Start as few files as practical; split only when a file gets unwieldy.)

### Pylon config shape

`config.js` is the single source of truth for the pylon→CC mapping. Each entry
owns its `cc`, so reconciling with the SuperCollider handlers is a one-file edit:

```js
export const MIDI_CHANNEL = 0;            // 0 = MIDI channel 1
export const BAND = { min: 1, max: 6 };   // metres → CC 0..127

export const PYLONS = [
  { id: "M1", role: "modulator", cc: 1, position: [-3, 0, 0], color: "#73EC8B" },
  { id: "M2", role: "modulator", cc: 2, position: [-1, 0, 0], color: "#54C392" },
  { id: "c1", role: "carrier",   cc: 3, position: [ 1, 0, 0], color: "#15B392" },
  { id: "c2", role: "carrier",   cc: 4, position: [ 3, 0, 0], color: "#73EC8B" },
];

// FM routing for the connection lines (bright lime)
export const CONNECTIONS = [["M1","c2"], ["M1","M2"], ["M2","c1"]];
```

## MIDI mapping

Defined in `config.js` (above), not hard-coded. CC value is derived from pylon
height across the full range: `value = round((y - min) / (max - min) * 127)`,
clamped to `0..127`, sent only when the integer value changes. The web side sends
this value and nothing more — the "drives" column is the SuperCollider-side meaning,
shown only for context.

| Pylon | Operator | CC# | Drives (SC-side, for now) |
|---|---|---|---|
| 1 | M1 (modulator) | 1 | M1 frequency ratio |
| 2 | M2 (modulator) | 2 | M2 frequency ratio |
| 3 | c1 (carrier) | 3 | c1 frequency ratio |
| 4 | c2 (carrier) | 4 | c2 frequency ratio |

Connection lines (bright lime `#D2FF72`) just depict the fixed FM algorithm —
`M1→c2`, `M1→M2`, `M2→c1` — and are static (no value encoding).

---

## Milestones & todos

### M0 — Project setup
- [ ] `npm init -y` in `web/` (only to pin `wrangler` as a dev dep; app stays buildless).
- [ ] `npm install -D wrangler@latest` (wrangler is not currently installed).
- [ ] Add `web/.gitignore` (`node_modules/`, `.wrangler/`).
- [ ] Add `web/.assetsignore` (`wrangler.jsonc`, `package.json`, `package-lock.json`, `node_modules`) so only the app ships.
- [ ] `config.js` with the `PYLONS` / `CONNECTIONS` / `BAND` / `MIDI_CHANNEL` constants.
- [ ] `wrangler whoami` / `wrangler login` to confirm auth to the right account.

### M1 — Static scene
- [ ] `index.html` with import map for `three` (pin a version) + a `<canvas>`.
- [ ] `scene.js`: renderer, **fixed camera** framing all pylons, ground plane, ambient + key light, resize handling, render loop.
- [ ] Confirm it serves locally via `wrangler dev` and renders an empty ground.

### M2 — Pylon mesh
- [ ] `pylon.js`: bicone (two cones / lathe) + a torus "connector ring" at the waist.
- [ ] Static green surface (`#73EC8B`/`#54C392`/`#15B392`); bright-lime ring + halo (`#D2FF72`).
- [ ] Place 4 pylons on the ground at distinct positions; each starts mid-band (`y≈3.5`).

### M3 — Interaction (click-hold drag → value)
- [ ] Raycaster pick on pointerdown; grab the pylon under the cursor.
- [ ] On pointermove while held, move the pylon vertically, clamped to `y ∈ [1, 6]`.
- [ ] Release on pointerup. (Camera is fixed, so no orbit/drag conflict to handle.)
- [ ] Visual feedback: brighten halo / thicken connector while grabbed.

### M4 — MIDI dispatch
- [ ] `midi.js`: `requestMIDIAccess({ sysex: false })`; handle the permission prompt + denial.
- [ ] Enumerate outputs; render a **port picker** (default to a port whose name matches `loopMIDI`).
- [ ] Map each pylon's height to its CC and `output.send([0xB0, cc#, value])` on change.
- [ ] Throttle: only send when the rounded CC value changes (avoid flooding).
- [ ] Status line: "MIDI ready / no access / no ports".

### M5 — Connections & polish
- [ ] `connections.js`: draw `M1→c2`, `M1→M2`, `M2→c1` as static bright-lime lines that track pylon positions (algorithm depiction only — no value encoding).
- [ ] Title + one-line help overlay ("Click and hold a pylon, drag up/down").

### M6 — Deploy to Cloudflare (`pylonsynth.xyz`)
- [ ] Add `web/wrangler.jsonc` (config below).
- [ ] `wrangler dev` — final local smoke test.
- [ ] `wrangler deploy` — first deploy to `*.workers.dev`.
- [ ] Verify custom domain `pylonsynth.xyz` resolves and serves over HTTPS.
- [ ] Test end-to-end on the deployed URL with loopMIDI + SuperCollider running locally.

## Cloudflare config

`web/wrangler.jsonc` (assets-only Worker — `main` is omitted, which is allowed):

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "pylon-synth",
  "compatibility_date": "2026-06-01",
  "assets": {
    "directory": "./",
    "not_found_handling": "single-page-application"
  },
  "routes": [
    { "pattern": "pylonsynth.xyz", "custom_domain": true }
  ]
}
```

Notes:
- `directory: "./"` serves `web/` directly (no build output). If we later add a
  build, point this at `./dist` instead.
- `custom_domain: true` lets Cloudflare provision the route + cert for the apex
  domain that's already in the dashboard. (Apex custom domains need the zone on
  this account — already done per setup.)
- Tooling files (`wrangler.jsonc`, `package.json`, `package-lock.json`,
  `node_modules`) are kept out of the served bundle via `web/.assetsignore`, so
  we can serve `web/` directly without a `public/` subfolder.

## Considerations / gotchas

- **Web MIDI needs a secure context.** Works on `https://` (Cloudflare gives us
  this) and on `http://localhost` during `wrangler dev`. It will *not* work from
  a `file://` open — always go through `wrangler dev`.
- **Browser support.** Web MIDI is Chromium-only. Detect `navigator.requestMIDIAccess`
  and show a clear "use Chrome/Edge" message otherwise.
- **Permission + ports.** Access can be denied; there may be zero outputs until
  loopMIDI is running. Handle both, and let the user re-pick the port.
- **CC flooding.** Pointer events fire fast; only emit on integer-CC change. One
  CC per operator keeps the stream tiny.
- **Local-host vs hosted page.** The page is hosted on Cloudflare but Web MIDI
  runs client-side in the browser and talks to the *local* loopMIDI port, so the
  user must run loopMIDI + SuperCollider on the same machine as the browser.
- **No secrets, no server logic.** Pure static; nothing sensitive ships. No KV/D1/etc.
- **Pin three.js version** in the import map for reproducibility (avoid "latest").
- **Permissions-Policy.** Top-level page doesn't need extra headers for MIDI; only
  relevant if ever embedded in an iframe.

## Resolved decisions

- **Web is parameter-agnostic** — pylon Y maps to CC `0–127` and sends it; the
  operator param it drives (currently frequency ratio) is decided in SuperCollider.
- **CC mapping** lives in `config.js`; each pylon owns its `cc`. Defaults CC `1..4`,
  channel 1 — a one-file edit to match the SuperCollider handlers.
- **Full CC range** — Y spans the whole `0–127`.
- **Camera**: fixed framing (no orbit).
- **Connector lines**: static depiction of the FM algorithm only; no value/depth encoding.
- **Params, notes, pitch**: all decided in SuperCollider, not the web side.
- **Serve layout**: `web/` served directly, tooling excluded via `.assetsignore`.

## Open questions

- Confirm the `config.js` CC numbers/channel against the predefined CC numbers the
  SuperCollider operators listen on, once the engine exists.
```
