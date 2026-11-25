// The four surveyed corners run along the long edge, then across the fitting.
function insetFrame([a, b, , d]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], ex = d[0] - a[0], ey = d[1] - a[1];
  const length = Math.hypot(dx, dy), width = Math.hypot(ex, ey);
  if (Math.min(length, width) < .08) return null;
  return { length, width, at: (s, t) => [a[0] + dx*s/length + ex*t/width, a[1] + dy*s/length + ey*t/width] };
}

function oval(frame, radius) {
  return Array.from({length: 40}, (_, i) => {
    const angle = 2*Math.PI*i/40;
    return frame.at(frame.length*(.5+radius*Math.cos(angle)), frame.width*(.5+radius*Math.sin(angle)));
  });
}

export function roadInsetFootprint(ring, kind) {
  const frame = kind === "ironCover" && insetFrame(ring);
  return frame ? oval(frame, .5) : ring;
}

export function drawRoadHardware(mesh, ring, kind, height, tone) {
  const frame = insetFrame(ring);
  if (!frame) return;
  const { length, width, at } = frame;
  const steel = tone({light:"#92918c", dark:"#494b4d"});
  const iron = tone({light:"#605e58", dark:"#353639"});
  const slot = tone({light:"#373738", dark:"#232527"});
  const up = [0,0,1];
  const face = (points, lift, color) => mesh.polygon([points], p => height(p)+lift, up, color);
  function rect(s, t, end, edge, lift, color) {
    mesh.quad([at(s,t), at(end,t), at(end,edge), at(s,edge)].map(p => [p,height(p)+lift]), up, color);
  }
  if (kind === "graniteCourse" || kind === "slotDrain") {
    const granite = kind === "graniteCourse";
    const count = Math.max(1, Math.round(length / (granite ? .57 : .82)));
    const pitch = length / count;
    const stones = ["#bbb9b0", "#aeafa9", "#c4c1b9", "#b9b6b0"].map(light => tone({light, dark:"#555957"}));
    for (let i = 0; i < count; i++) {
      const a = i * pitch, b = (i + 1) * pitch;
      rect(a, 0, b, width, .020, granite ? iron : slot);
      if (granite) {
        rect(a+.004, .003, b-.004, width-.003, .025, stones[i % stones.length]);
      } else {
        // The narrow shopfront drain has longitudinal bars, joined by short cross ties.
        for (let k = 0; k < 6; k++) rect(a+.008, k*width/6, b-.008, (k+.40)*width/6, .029, steel);
        for (let k = 0; k < 4; k++) rect(a+(k+.5)*pitch/4, 0, a+(k+.5)*pitch/4+.013, width, .025, iron);
      }
    }
    return;
  }
  if (kind === "ironCover") {
    face(oval(frame,.50), .016, slot);
    face(oval(frame,.478), .020, steel);
    face(oval(frame,.455), .024, iron);
    // Three concentric rows of raised, broken ribs cast into the lid.
    for (const [r, count] of [[.15,8],[.28,13],[.39,18]]) {
      for (let k=0; k<count; k++) {
        const a = (k+r)*2*Math.PI/count, b = a+4.4/count;
        const on = (t,rad) => at(length*(.5+rad*Math.cos(t)), width*(.5+rad*Math.sin(t)));
        face([on(a,r),on(b,r),on(b,r+.023),on(a,r+.023)],.028,steel);
      }
    }
    rect(length*.45,width*.47,length*.55,width*.51,.030,slot);
    return;
  }
  const rim = kind === "grate" ? .018 : .023;
  if (kind === "grate") {
    rect(0,0,length,width,.012,slot);
    const bars = Math.max(1,Math.round(length/.046));
    for(let i=0; i<bars; i++) {
      const s = i*length/bars;
      rect(s,0,s+.012,width,.026,steel);
    }
    rect(0,width*.48,length,width*.52,.022,iron);
    // Individual lift-out sections sit in the continuous pair of angle irons.
    const sections = Math.max(1,Math.round(length/.75));
    for(let i=1; i<sections; i++) rect(i*length/sections-.01,0,i*length/sections+.01,width,.029,iron);
  } else {
    rect(length*.12,width*.14,length*.20,width*.17,.026,slot);
    rect(length*.80,width*.83,length*.88,width*.86,.026,slot);
  }
  rect(0,0,length,rim,.028,steel);
  rect(0,width-rim,length,width,.028,steel);
  rect(0,0,rim,width,.028,steel);
  rect(length-rim,0,length,width,.028,steel);
}
