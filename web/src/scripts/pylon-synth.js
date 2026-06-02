import { SuperSonic } from "https://unpkg.com/supersonic-scsynth@0.67.2";

// ---------------------------------------------------------------------------
// Parameter definitions  [key, label, min, max, default, cc]
// ---------------------------------------------------------------------------
export const PARAM_DEFS = [
  ['m1Ratio', 'M1 Ratio', 0.25, 8.0,  1.0,  1],
  ['m2Ratio', 'M2 Ratio', 0.25, 8.0,  2.0,  2],
  ['c1Ratio', 'C1 Ratio', 0.25, 8.0,  1.0,  3],
  ['c2Ratio', 'C2 Ratio', 0.25, 8.0,  1.0,  4],
  ['m1Index', 'M1 Index', 0.0,  10.0, 1.0,  5],
  ['m2Index', 'M2 Index', 0.0,  10.0, 1.0,  6],
  ['atk',     'Attack',   0.001, 2.0, 0.01, 7],
  ['rel',     'Release',  0.01,  4.0, 0.5,  8],
];

// ---------------------------------------------------------------------------
// Ritusen pentatonic scale helpers
// ---------------------------------------------------------------------------
const MINOR_SCALE = [0, 2, 5, 7, 9];
const DEGREES     = [0, 1, 2, 3, 4, 5, 6];
const ROOT_MIDI   = 69; // A4

function degreeToFreq(degree) {
  const octave    = Math.floor(degree / MINOR_SCALE.length);
  const semitones = MINOR_SCALE[((degree % MINOR_SCALE.length) + MINOR_SCALE.length) % MINOR_SCALE.length];
  const midi      = ROOT_MIDI + octave * 12 + semitones;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------------------
// Sequencer constants
// ---------------------------------------------------------------------------
const BPM           = 110;
const DUR_BEATS     = 0.5;
const NOTE_DUR_S    = (60 / BPM) * DUR_BEATS;
const LOOKAHEAD_MS  = 50;
const SCHEDULE_AHEAD = 0.15; // seconds

const NTP_EPOCH_OFFSET = 2208988800; // seconds between 1900-01-01 and 1970-01-01

// ---------------------------------------------------------------------------
// PylonSynth
// ---------------------------------------------------------------------------
export class PylonSynth {
  /** @param {{ onStatus?: (message: string, className: string) => void }} [opts] */
  constructor({ onStatus } = {}) {
    this._onStatus = onStatus ?? (() => {});

    // Synth engine
    this._supersonic = new SuperSonic({
      baseURL:     "https://unpkg.com/supersonic-scsynth@0.67.2/dist/",
      coreBaseURL: "https://unpkg.com/supersonic-scsynth-core@0.67.2/",
      debug: true,
      scsynthOptions: { realTimeMemorySize: 16536 },
    });

    this._osc = SuperSonic.osc;

    // State
    this._engineReady      = false;
    this._correctedInitTime = 0;
    this._activeNodes      = new Set();

    // Params — initialised from PARAM_DEFS defaults
    this._params = {};
    PARAM_DEFS.forEach(([key, , , , def]) => { this._params[key] = def; });

    // Sequencer
    this._seqRunning  = false;
    this._seqTimer    = null;
    this._nextNoteTime = 0;
    this._degreeIndex  = 0;
  }

  // -------------------------------------------------------------------------
  // Public getters
  // -------------------------------------------------------------------------
  get isReady()   { return this._engineReady; }
  get isRunning() { return this._seqRunning; }

  // -------------------------------------------------------------------------
  // boot() — initialise SuperSonic and load synth defs
  // -------------------------------------------------------------------------
  async boot() {
    this._status('engine: booting…', 'loading');
    try {
      await this._supersonic.init();

      // Recalibrate the NTP offset now that the AudioContext is actually running.
      // Chrome suspends the context before a user gesture, so supersonic.initTime
      // is captured before currentTime starts advancing.
      this._correctedInitTime =
        (Date.now() / 1000 + NTP_EPOCH_OFFSET) -
        this._supersonic.audioContext.currentTime;

      this._status('engine: loading synthdefs…', 'loading');

      const [fmBytes, reverbBytes] = await Promise.all([
        fetch('/fm.scsyndef').then(r => r.arrayBuffer()),
        fetch('/reverb.scsyndef').then(r => r.arrayBuffer()),
      ]);
      await Promise.all([
        this._supersonic.loadSynthDef(fmBytes),
        this._supersonic.loadSynthDef(reverbBytes),
      ]);

      // Spawn one persistent reverb tail; FM voices write to bus 16.
      const reverbId = this._supersonic.nextNodeId();
      this._supersonic.send('/s_new', 'reverb', reverbId, 1, 0,
        'bus', 16, 'mix', 0.3, 'room', 0.8, 'damp', 0.5);

      this._engineReady = true;
      this._status('engine: ready', 'ready');
    } catch (err) {
      this._status(`engine: error — ${err.message}`, 'error');
      console.error(err);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // start() / stop()
  // -------------------------------------------------------------------------
  start() {
    if (!this._engineReady) throw new Error('Engine not ready — call boot() first.');
    this._nextNoteTime = this._supersonic.audioContext.currentTime + 0.05;
    this._degreeIndex  = 0;
    this._seqRunning   = true;
    this._tick();
  }

  stop() {
    this._seqRunning = false;
    clearTimeout(this._seqTimer);
    this._supersonic.cancelAll();
  }

  // -------------------------------------------------------------------------
  // setParam(key, value) — update a parameter and forward to live voices
  // -------------------------------------------------------------------------
  setParam(key, value) {
    this._params[key] = value;

    if (this._activeNodes.size > 0 && this._engineReady) {
      const now = this._supersonic.audioContext.currentTime;
      this._activeNodes.forEach(id => {
        const bundle = this._osc.encodeSingleBundle(
          this._audioCtxToNtp(now),
          '/n_set',
          [id, key, value]
        );
        this._supersonic.sendOSC(bundle);
      });
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------
  _status(message, className) {
    this._onStatus(message, className);
  }

  _audioCtxToNtp(t) {
    return this._correctedInitTime + t;
  }

  _triggerNote(freq, audioCtxTime, p) {
    const id     = this._supersonic.nextNodeId();
    const bundle = this._osc.encodeSingleBundle(
      this._audioCtxToNtp(audioCtxTime),
      '/s_new',
      ['fm', id, 0, 0,
        'freq',    freq,
        'm1Ratio', p.m1Ratio,
        'm2Ratio', p.m2Ratio,
        'c1Ratio', p.c1Ratio,
        'c2Ratio', p.c2Ratio,
        'm1Index', p.m1Index,
        'm2Index', p.m2Index,
        'atk',     p.atk,
        'rel',     p.rel]
    );
    this._supersonic.sendOSC(bundle);
    this._activeNodes.add(id);
    return id;
  }

  _releaseNote(id, audioCtxTime, relDur) {
    const bundle = this._osc.encodeSingleBundle(
      this._audioCtxToNtp(audioCtxTime),
      '/n_set',
      [id, 'gate', 0]
    );
    this._supersonic.sendOSC(bundle);
    // Synth self-frees via doneAction:2 after the release ramp.
    const msUntilFree = (audioCtxTime - this._supersonic.audioContext.currentTime + relDur + 0.1) * 1000;
    setTimeout(() => this._activeNodes.delete(id), Math.max(msUntilFree, 0));
  }

  _fireNote(freq, audioCtxTime, dur, p) {
    const id = this._triggerNote(freq, audioCtxTime, p);
    this._releaseNote(id, audioCtxTime + dur * 0.9, p.rel);
  }

  _scheduleNote(audioCtxTime) {
    let degree = DEGREES[this._degreeIndex % DEGREES.length];
    if (Math.random() < 0.3) degree += Math.floor(Math.random() * 3) + 1;
    this._degreeIndex++;
    const isBeatOne = this._degreeIndex === 1;
    if (!isBeatOne && Math.random() < 0.2) return; // 20% mute chance, never on beat 1

    const p = { ...this._params };
    const r = Math.random();

    if (r < 0.25) {
      // ~25%: double note — degree then degree+1 in the same slot
      const halfDur = NOTE_DUR_S * 0.5;
      this._fireNote(degreeToFreq(degree),     audioCtxTime,           halfDur, p);
      this._fireNote(degreeToFreq(degree + 1), audioCtxTime + halfDur, halfDur, p);
    } else {
      this._fireNote(degreeToFreq(degree), audioCtxTime, NOTE_DUR_S, p);
    }
  }

  _tick() {
    const now = this._supersonic.audioContext.currentTime;
    while (this._nextNoteTime < now + SCHEDULE_AHEAD) {
      this._scheduleNote(this._nextNoteTime);
      this._nextNoteTime += NOTE_DUR_S;
    }
    this._seqTimer = setTimeout(() => this._tick(), LOOKAHEAD_MS);
  }
}
