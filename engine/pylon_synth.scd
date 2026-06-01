(
SynthDef.new(\fm, {
  arg freq = 440, gate = 1,
      m1Ratio = 1.0, m2Ratio = 2.0, c1Ratio = 1.0, c2Ratio = 1.0,
      m1Index = 1.0, m2Index = 1.0,
      atk = 0.01, rel = 0.5;

  var m1, m2, c1, c2, sig, env, amp;
  amp = 0.5;

  env = EnvGen.kr(Env.asr(atk, 1, rel), gate, doneAction: 2);

  m1 = SinOsc.ar(freq * m1Ratio) * (m1Index * freq * m1Ratio);
  m2 = SinOsc.ar((freq * m2Ratio) + m1) * (m2Index * freq * m2Ratio);

  c1 = SinOsc.ar((freq * c1Ratio) + m2);
  c2 = SinOsc.ar((freq * c2Ratio) + m1);

  sig = (c1 + c2) * 0.5 * env * amp;

  Out.ar(~main, sig ! 2);
}).add;
)

t =TempoClock(135/60).permanent_(true);

(
Pbindef(\pat,
  \instrument, \fm,
  \scale, Scale.newFromKey(\minor),
  \degree, Pseq([0, 2, 4, 5], inf),
  \dur, 0.5,
).play(t);
)

(
var win, params, sliders, ccMap;

// [param, label, min, max, default, cc]
params = [
	[\m1Ratio, "M1 Ratio", 0.25,  8.0,  1.0,  1],
	[\m2Ratio, "M2 Ratio", 0.25,  8.0,  2.0,  2],
	[\c1Ratio, "C1 Ratio", 0.25,  8.0,  1.0,  3],
	[\c2Ratio, "C2 Ratio", 0.25,  8.0,  1.0,  4],
	[\m1Index, "M1 Index", 0.0,   10.0, 1.0,  5],
	[\m2Index, "M2 Index", 0.0,   10.0, 1.0,  6],
	[\atk,     "Attack",   0.001, 2.0,  0.01, 7],
	[\rel,     "Release",  0.01,  4.0,  0.5,  8],
];

win = Window("Pylon Synth", Rect(100, 100, 400, 290)).front;

// build sliders, retain references for MIDI sync
sliders = params.collect { |p|
	EZSlider(win, 380 @ 28, p[1], ControlSpec(p[2], p[3], \lin, 0, p[4]),
		{ |ez| Pbindef(\pat, p[0], ez.value) },
		p[4], labelWidth: 70, numberWidth: 50
	)
};

win.layout = VLayout(*sliders.collect(_.view));

// cc number -> [slider, controlSpec, paramName]
ccMap = Dictionary.new;
params.do { |p, i|
	ccMap[p[5]] = [sliders[i], ControlSpec(p[2], p[3], \lin, 0, p[4]), p[0]];
};

// MIDI init
if(MIDIClient.initialized.not) { MIDIClient.init };
MIDIIn.connectAll;

MIDIdef.cc(\pylonCC, { |val, cc|
  //("CC is " ++ cc).postln;
  //("Val is " ++ val).postln;
	var entry = ccMap[cc];
	if(entry.notNil) {
		var mapped = entry[1].map(val / 127.0);
		{ entry[0].value_(mapped) }.defer;    // sync UI on AppClock
		Pbindef(\pat, entry[2], mapped);      // update synth
	};
}, ccNum: nil, chan: nil);
)
