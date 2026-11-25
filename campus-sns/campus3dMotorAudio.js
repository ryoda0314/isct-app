// Each ride owns its sound sources. The shared AudioContext also carries the
// existing bell and horn. All looping sources stop when the rider gets out.
export function motorAudio(ac, kind) {
  if (!ac || (kind !== "car" && kind !== "jet")) return null;
  const jet = kind === "jet";
  const tone = ac.createOscillator(), harmonic = ac.createOscillator();
  const mix = ac.createGain(), filter = ac.createBiquadFilter(), hiss = ac.createGain();
  const grain = ac.createBuffer(1, ac.sampleRate*.65 | 0, ac.sampleRate);
  const samples = grain.getChannelData(0);
  for (let i=0; i<samples.length; i++) samples[i] = (Math.random()*2-1)*.7;
  const noise = ac.createBufferSource();
  noise.buffer = grain; noise.loop = true;
  const air = ac.createBiquadFilter();
  air.type="bandpass"; air.frequency.value=jet ? 1450 : 2100; air.Q.value=.7;
  tone.type=jet ? "sine" : "sawtooth"; harmonic.type="triangle";
  filter.type="lowpass"; filter.Q.value=.7;
  mix.gain.value=0; hiss.gain.value=0;
  tone.connect(filter); harmonic.connect(filter); filter.connect(mix); mix.connect(ac.destination);
  noise.connect(air); air.connect(hiss); hiss.connect(ac.destination);
  tone.start(); harmonic.start(); noise.start();
  let stopped=false;
  return {
    update(s) {
      if (stopped || ac.state !== "running") return;
      const t=ac.currentTime, f=jet ? 215+s.throttle*440 : (s.rpm || 950)/30;
      tone.frequency.setTargetAtTime(f,t,.055); harmonic.frequency.setTargetAtTime(f*(jet?2.03:.50),t,.06);
      filter.frequency.setTargetAtTime(jet ? 1300+s.throttle*1200 : 210+f*3,t,.09);
      mix.gain.setTargetAtTime(jet ? .009+.006*s.throttle : .013+.003*Math.min(1,Math.abs(s.v)/10),t,.09);
      hiss.gain.setTargetAtTime(jet ? .025+s.throttle*.048 : s.skid ? .077 : .001,t,.045);
      if (!(s.impact>2)) return;
      const thud=ac.createOscillator(), hit=ac.createGain(), scrape=ac.createBufferSource(), burst=ac.createGain();
      const force=Math.min(1,s.impact/18);
      thud.frequency.setValueAtTime(119,t); thud.frequency.exponentialRampToValueAtTime(39,t+.18);
      hit.gain.setValueAtTime(.19*force,t); hit.gain.exponentialRampToValueAtTime(.001,t+.25);
      scrape.buffer=grain; burst.gain.setValueAtTime(.15*force,t); burst.gain.exponentialRampToValueAtTime(.001,t+.16);
      thud.connect(hit); hit.connect(ac.destination); scrape.connect(burst); burst.connect(ac.destination);
      thud.start(t); thud.stop(t+.26); scrape.start(t); scrape.stop(t+.17);
      thud.onended=()=>{thud.disconnect();hit.disconnect();};
      scrape.onended=()=>{scrape.disconnect();burst.disconnect();};
    },
    stop() {
      if (stopped) return;
      stopped=true;
      for (const source of [tone,harmonic,noise]) { source.stop(); source.disconnect(); }
      for (const node of [mix,filter,air,hiss]) node.disconnect();
    },
  };
}
