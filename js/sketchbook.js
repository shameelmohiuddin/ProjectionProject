// js/sketchbook.js
// Reference: "Projection of Solids" PDF — 6-shape, 2×3 construction sequence
//
// VTU First-Angle Projection rules (confirmed from PDF pages 1–8):
//
// FRONT VIEW (VP, top half):
//   • Camera at +Z looking toward –Z; project onto XY plane (drop Z).
//   • The base (y=0) sits DIRECTLY ON the XY line — the XY line IS the ground.
//   • The apex / top face rises above XY line.
//   • No gap between XY line and the front view shape.
//
// TOP VIEW (HP, bottom half):
//   • Camera at +Y looking down; project onto XZ plane (drop Y).
//   • The frontmost edge of the base (highest Z in my coords = closest to observer)
//     appears nearest to the XY line, separated by a small drafting gap.
//   • The rest extends downward away from XY.
//   • A GAP is always preserved between the XY line and the top-view shape.
//
// CONSTRUCTION SEQUENCE: 4 → 1 → 2 → 5 → 6 → 3
//   4 (BL): canonical top view     1 (TL): canonical front view
//   2 (TM): tilted front view      5 (BM): tilted top view
//            (thin vertical projectors from 4, thin horizontal from 2 → build 5)
//   6 (BR): final top view         3 (TR): final front view
//            (45° mirror from 5 → 6)  (thin h-projectors from 2, v-projectors from 6 → build 3)

import { buildCanonicalSolid, transformSolid } from './geometry.js';
import { project } from './projections.js';

const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
};
const tx = (str, attrs = {}) => { const e = mk('text', attrs); e.textContent = str; return e; };

// Line styles
const LS = {
  visible:  { stroke: '#111', 'stroke-width': '1.5', fill: 'none', 'stroke-linecap': 'round' },
  hidden:   { stroke: '#333', 'stroke-width': '0.9', fill: 'none', 'stroke-dasharray': '5.5,3.5' },
  proj:     { stroke: '#bbb', 'stroke-width': '0.5', fill: 'none' },
  axis:     { stroke: '#777', 'stroke-width': '0.8', fill: 'none', 'stroke-dasharray': '13,4.5' },
  xy:       { stroke: '#222', 'stroke-width': '1.3', fill: 'none' },
  div:      { stroke: '#dde1ee', 'stroke-width': '0.7', fill: 'none', 'stroke-dasharray': '4,5' },
  m45:      { stroke: '#ccc',  'stroke-width': '0.7', fill: 'none' },
};

let svgEl = null;
export function initSketchbook(s) { svgEl = s; }

export function renderStep(step, params) {
  if (!svgEl) return;
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  const W = svgEl.clientWidth  || 1200;
  const H = svgEl.clientHeight || 720;
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // ── Layout ──────────────────────────────────────────────────────────────────
  const TOOLBAR = 58;
  const drawH   = H - TOOLBAR;
  const marginX = W * 0.025;
  const colW    = (W - 2 * marginX) / 3;

  const COL = [0, 1, 2].map(i => marginX + colW * (i + 0.5));

  // XY line sits at ~48% of draw height
  const XY_Y  = drawH * 0.47;
  const GAP_T = 18; // px gap between XY line and TOP VIEW (HP) nearest edge

  // ── Build three solid states ─────────────────────────────────────────────────
  const { shapeType, baseShape, sideLength, height, restType, baseRot, inclHP, apparentVP } = params;
  const canon  = buildCanonicalSolid(shapeType, baseShape, sideLength, height, restType, baseRot);
  const tilted = transformSolid(canon, inclHP, 0); // apparentVP = 0 means geometry stays horizontal in TV
  const final  = transformSolid(canon, inclHP, apparentVP);

  const pFV = [
    project(canon,  'front'),  // shape 1 TL
    project(tilted, 'front'),  // shape 2 TM
    project(final,  'front'),  // shape 3 TR
  ];
  const pTV = [
    project(canon,  'top'),    // shape 4 BL
    project(tilted, 'top'),    // shape 5 BM
    project(final,  'top'),    // shape 6 BR
  ];

  // ── Compute uniform SCALE ────────────────────────────────────────────────────
  // Front view: base at y=0 ON XY_Y, apex rises up → needs space = maxY * SCALE
  // Top view:   front edge at XY_Y+GAP_T, back edge at XY_Y+GAP_T+(zRange)*SCALE
  // Both must fit in their halves.

  const availTop = XY_Y - 28;               // px above XY for front views
  const availBot = drawH - XY_Y - GAP_T - 20; // px below (XY+GAP) for top views

  let maxFV = 0, maxTV = 0;
  pFV.forEach(p => { maxFV = Math.max(maxFV, p.bounds.maxY); });          // max Y in front view
  pTV.forEach(p => {                                                        // z-range in top view
    const zAll = p.allVerts2d.map(pt => pt[1]);
    maxTV = Math.max(maxTV, Math.max(...zAll) - Math.min(...zAll));
  });

  // Also constrain horizontally: shape must not exceed 65% of colW on each side
  let maxHW = 0;
  [...pFV, ...pTV].forEach(p => {
    maxHW = Math.max(maxHW, p.bounds.maxX - p.bounds.minX);
  });

  const scaleV = Math.min(availTop / (maxFV  || 1), availBot / (maxTV  || 1));
  const scaleH = colW * 0.65 / ((maxHW / 2) || 1);
  const SCALE  = Math.min(scaleV, scaleH, 3.5);

  // ── toSVG ────────────────────────────────────────────────────────────────────
  const fvSVG = ([u, v], cx) => [cx + u * SCALE, XY_Y - v * SCALE];

  // Top view: The smallest Z value across the base shape maps to GAP_T below the line
  const tvSVG = (proj, [u, v], cx) => {
    const localBaseZ = Math.min(...proj.allVerts2d.map(pt => pt[1]));
    return [cx + u * SCALE, XY_Y + GAP_T + (v - localBaseZ) * SCALE];
  };

  // ── Draw XY reference line ───────────────────────────────────────────────────
  const gXY = mk('g');
  gXY.appendChild(mk('line', { x1: 14, y1: XY_Y, x2: W - 14, y2: XY_Y, ...LS.xy }));
  gXY.appendChild(tx('X',  { x: 16, y: XY_Y - 6, 'font-size': 13, 'font-family': 'Inter,sans-serif', fill: '#222', 'font-weight': '700' }));
  gXY.appendChild(tx('Y',  { x: W - 17, y: XY_Y - 6, 'font-size': 13, 'font-family': 'Inter,sans-serif', fill: '#222', 'font-weight': '700', 'text-anchor': 'end' }));
  gXY.appendChild(tx('VP', { x: 18, y: XY_Y - 20, 'font-size': 11, 'font-family': 'Inter,sans-serif', fill: '#777' }));
  gXY.appendChild(tx('HP', { x: 18, y: XY_Y + 26, 'font-size': 11, 'font-family': 'Inter,sans-serif', fill: '#777' }));
  svgEl.appendChild(gXY);

  // ── Column dividers ──────────────────────────────────────────────────────────
  const gDiv = mk('g');
  [1, 2].forEach(i => {
    const x = marginX + colW * i;
    gDiv.appendChild(mk('line', { x1: x, y1: 20, x2: x, y2: drawH - 10, ...LS.div }));
  });
  svgEl.appendChild(gDiv);

  // ── Helper: draw a projection ────────────────────────────────────────────────
  const drawProj = (proj, view, cx, projRef) => {
    const g = mk('g');
    const toSVG = view === 'front'
      ? pt => fvSVG(pt, cx)
      : pt => tvSVG(projRef || proj, pt, cx);

    proj.visibleEdges.forEach(([a, b]) => {
      const [x1, y1] = toSVG(a), [x2, y2] = toSVG(b);
      g.appendChild(mk('line', { x1, y1, x2, y2, ...LS.visible }));
    });
    proj.hiddenEdges.forEach(([a, b]) => {
      const [x1, y1] = toSVG(a), [x2, y2] = toSVG(b);
      g.appendChild(mk('line', { x1, y1, x2, y2, ...LS.hidden }));
    });
    if (proj.axisLine) {
      const [x1, y1] = toSVG(proj.axisLine[0]), [x2, y2] = toSVG(proj.axisLine[1]);
      g.appendChild(mk('line', { x1, y1, x2, y2, ...LS.axis }));
    }
    svgEl.appendChild(g);
  };

  // ── Construction projectors ──────────────────────────────────────────────────
  const drawProjectorsTo5 = () => {
    const g = mk('g', { opacity: '0.7' });
    const doneX = new Set(), doneY = new Set();
    
    pFV[1].allVerts2d.forEach(pt => {
      const [sx, sy] = fvSVG(pt, COL[1]);
      if (doneX.has(sx)) return; doneX.add(sx);
      g.appendChild(mk('line', { x1: sx, y1: sy, x2: sx, y2: XY_Y + GAP_T + maxTV * SCALE + 20, ...LS.proj }));
    });
    
    pTV[0].allVerts2d.forEach(pt => {
      const [sx0, sy] = tvSVG(pTV[0], pt, COL[0]);
      if (doneY.has(sy)) return; doneY.add(sy);
      g.appendChild(mk('line', { x1: sx0, y1: sy, x2: COL[1] + colW * 0.45, y2: sy, ...LS.proj }));
    });
    svgEl.appendChild(g);
  };

  const drawApparentVPLine = () => {
    const g = mk('g', { opacity: '0.6' });
    const a = (apparentVP * Math.PI) / 180;
    const len = 100;
    const cx = COL[2], cy = XY_Y + GAP_T + maxTV * SCALE / 2;
    // Axis rotated by angle `a` from horizontal: vector is [cos(a), -sin(a)] in std coords
    // SVG coords: Y goes down, so vector is [cos(a), -sin(a)] visually upwards
    g.appendChild(mk('line', { 
      x1: cx - Math.cos(a)*len, y1: cy + Math.sin(a)*len, 
      x2: cx + Math.cos(a)*len, y2: cy - Math.sin(a)*len, 
      ...LS.axis 
    }));
    g.appendChild(tx(`${apparentVP}°`, { 
      x: cx + Math.cos(a)*len + 5, y: cy - Math.sin(a)*len - 5, 
      'font-size': 9, 'font-family': 'Inter,sans-serif', fill: '#888' 
    }));
    svgEl.appendChild(g);
  };

  const drawProjectorsTo3 = () => {
    const g = mk('g', { opacity: '0.7' });
    const doneX = new Set(), doneY = new Set();
    
    pFV[1].allVerts2d.forEach(pt => {
      const [sx0, sy] = fvSVG(pt, COL[1]);
      if (doneY.has(sy)) return; doneY.add(sy);
      g.appendChild(mk('line', { x1: sx0, y1: sy, x2: COL[2] + colW * 0.45, y2: sy, ...LS.proj }));
    });
    
    pTV[2].allVerts2d.forEach(pt => {
      const [sx, sy0] = tvSVG(pTV[2], pt, COL[2]);
      if (doneX.has(sx)) return; doneX.add(sx);
      g.appendChild(mk('line', { x1: sx, y1: sy0, x2: sx, y2: XY_Y - maxFV * SCALE - 15, ...LS.proj }));
    });
    svgEl.appendChild(g);
  };

  // ── Render by step ───────────────────────────────────────────────────────────
  if (step >= 1) drawProj(pTV[0], 'top',   COL[0]);
  if (step >= 2) drawProj(pFV[0], 'front', COL[0]);
  if (step >= 3) { drawProj(pFV[1], 'front', COL[1]); drawProjectorsTo5(); }
  if (step >= 4) drawProj(pTV[1], 'top',   COL[1]);
  if (step >= 5) { drawApparentVPLine(); drawProj(pTV[2], 'top', COL[2]); }
  if (step >= 6) { drawProjectorsTo3(); drawProj(pFV[2], 'front', COL[2]); }

  // ── Labels ───────────────────────────────────────────────────────────────────
  const LINFO = [
    null,
    { col: COL[0], y: XY_Y + GAP_T + maxTV * SCALE + 30, text: '④ Top View — Initial' },
    { col: COL[0], y: XY_Y - maxFV * SCALE - 14,         text: '① Front View — Initial' },
    { col: COL[1], y: XY_Y - maxFV * SCALE - 14,         text: '② Front View — Tilted' },
    { col: COL[1], y: XY_Y + GAP_T + maxTV * SCALE + 30, text: '⑤ Top View — Tilted' },
    { col: COL[2], y: XY_Y + GAP_T + maxTV * SCALE + 30, text: '⑥ Final Top View' },
    { col: COL[2], y: XY_Y - maxFV * SCALE - 14,         text: '③ Final Front View ✓', bold: true },
  ];
  const gL = mk('g');
  for (let s = 1; s <= step; s++) {
    const info = LINFO[s];
    if (!info) continue;
    gL.appendChild(tx(info.text, {
      x: info.col, y: info.y,
      'text-anchor': 'middle',
      'font-size': 10.5,
      'font-family': 'Inter,sans-serif',
      fill: info.bold ? '#1d4ed8' : '#4361EE',
      'font-weight': info.bold ? '700' : '500',
    }));
  }
  svgEl.appendChild(gL);

  // ── Progress dots ─────────────────────────────────────────────────────────────
  const gDots = mk('g');
  for (let i = 0; i < 6; i++) {
    gDots.appendChild(mk('circle', {
      cx: W / 2 - 37.5 + i * 15, cy: 13, r: i < step ? 5 : 3.5,
      fill: i < step ? '#4361EE' : '#d1d5db',
    }));
  }
  svgEl.appendChild(gDots);
}
