// js/app.js — Main app controller: state machine, screen transitions, event wiring
import { buildCanonicalSolid, transformSolid } from './geometry.js';
import { initScene, updateSolidGeometry } from './scene3d.js';
import { initSketchbook, renderStep } from './sketchbook.js';

// ─── App State ───────────────────────────────────────────────────────────────
const state = {
  screen: 'landing',      // landing | shapeType | baseShape | viewer
  mode: '360',            // '360' | 'sketchbook'
  shapeType: null,        // 'pyramid' | 'prism'
  baseShape: null,        // 'triangle'|'square'|'pentagon'|'hexagon'|'circle'
  sketchStep: 0,          // 0-6 construction steps
  params: {
    sideLength: 35,
    height: 60,
    restType: 'edge',
    baseRot: 0,
    inclHP: 45,
    apparentVP: 45,
  },
};

// ─── DOM References ──────────────────────────────────────────────────────────
const screens = {
  landing:   document.getElementById('screen-landing'),
  shapeType: document.getElementById('screen-shape-type'),
  baseShape: document.getElementById('screen-base-shape'),
  viewer:    document.getElementById('screen-viewer'),
};
const canvas3d       = document.getElementById('canvas-3d');
const sketchSVG      = document.getElementById('sketchbook-svg');
const sketchOverlay  = document.getElementById('sketchbook-overlay');
const btnToggleView        = document.getElementById('btn-toggle-view');
const btnToggleViewSketch  = document.getElementById('btn-toggle-view-sketch');
const shapeTag             = document.getElementById('shape-tag');
const btnNextStep    = document.getElementById('btn-next-step');
const btnPrevStep    = document.getElementById('btn-prev-step');
const stepCounter    = document.getElementById('step-counter');
const baseShapeGrid  = document.getElementById('base-shape-grid');
const baseShapeTitle = document.getElementById('base-shape-title');

// Param controls
const slSide     = document.getElementById('sl-side');
const slHeight   = document.getElementById('sl-height');
const slInclHP   = document.getElementById('sl-incl-hp');
const slApprVP   = document.getElementById('sl-appr-vp');
const valSide    = document.getElementById('val-side');
const valHeight  = document.getElementById('val-height');
const valInclHP  = document.getElementById('val-incl-hp');
const valApprVP  = document.getElementById('val-appr-vp');

// ─── Screen transition ───────────────────────────────────────────────────────
function goTo(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[screenName].classList.add('active');
  state.screen = screenName;
}

// ─── Landing screen ──────────────────────────────────────────────────────────
document.querySelectorAll('[data-module]').forEach(card => {
  card.addEventListener('click', () => {
    const mod = card.dataset.module;
    if (mod === 'solids') {
      goTo('shapeType');
    } else {
      showComingSoon(card.querySelector('.module-title')?.textContent || mod);
    }
  });
});

function showComingSoon(name) {
  const modal = document.getElementById('modal-coming-soon');
  document.getElementById('modal-module-name').textContent = name;
  modal.classList.add('visible');
}
document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal-coming-soon').classList.remove('visible');
});

// ─── Shape Type screen ───────────────────────────────────────────────────────
document.querySelectorAll('[data-shape-type]').forEach(card => {
  card.addEventListener('click', () => {
    state.shapeType = card.dataset.shapeType;
    buildBaseShapeGrid();
    goTo('baseShape');
  });
});

document.getElementById('btn-back-shape-type').addEventListener('click', () => goTo('landing'));

// ─── Base Shape screen ───────────────────────────────────────────────────────
const BASE_SHAPES = {
  pyramid: [
    { id: 'triangle', label: 'Triangular', icon: '▲', sub: 'Tetrahedron (equal edges)' },
    { id: 'square',   label: 'Square',     icon: '◼', sub: 'Square Pyramid' },
    { id: 'pentagon', label: 'Pentagonal', icon: '⬠', sub: 'Pentagonal Pyramid' },
    { id: 'hexagon',  label: 'Hexagonal',  icon: '⬡', sub: 'Hexagonal Pyramid' },
    { id: 'circle',   label: 'Circular',   icon: '●', sub: 'Cone' },
  ],
  prism: [
    { id: 'triangle', label: 'Triangular', icon: '▲', sub: 'Triangular Prism' },
    { id: 'square',   label: 'Square',     icon: '◼', sub: 'Cube / Square Prism' },
    { id: 'pentagon', label: 'Pentagonal', icon: '⬠', sub: 'Pentagonal Prism' },
    { id: 'hexagon',  label: 'Hexagonal',  icon: '⬡', sub: 'Hexagonal Prism' },
    { id: 'circle',   label: 'Circular',   icon: '●', sub: 'Cylinder' },
  ],
};

function buildBaseShapeGrid() {
  baseShapeTitle.textContent = `Choose Base Shape — ${state.shapeType === 'pyramid' ? 'Pyramid' : 'Prism'}`;
  baseShapeGrid.innerHTML = '';
  BASE_SHAPES[state.shapeType].forEach(shape => {
    const card = document.createElement('div');
    card.className = 'base-shape-card';
    card.innerHTML = `
      <div class="base-shape-icon">${shape.icon}</div>
      <div class="base-shape-label">${shape.label}</div>
      <div class="base-shape-sub">${shape.sub}</div>`;
    card.addEventListener('click', () => {
      state.baseShape = shape.id;
      state.sketchStep = 0;
      enterViewer();
    });
    baseShapeGrid.appendChild(card);
  });
}

document.getElementById('btn-back-base-shape').addEventListener('click', () => goTo('shapeType'));

// ─── Viewer ──────────────────────────────────────────────────────────────────
let sceneReady = false;

const SHAPE_NAMES = {
  pyramid: { triangle:'Triangular Pyramid', square:'Square Pyramid', pentagon:'Pentagonal Pyramid', hexagon:'Hexagonal Pyramid', circle:'Cone' },
  prism:   { triangle:'Triangular Prism',  square:'Square Prism / Cube', pentagon:'Pentagonal Prism', hexagon:'Hexagonal Prism', circle:'Cylinder' },
};

function enterViewer() {
  goTo('viewer');
  state.mode = '360';
  if (shapeTag) shapeTag.textContent = SHAPE_NAMES[state.shapeType]?.[state.baseShape] || '';
  sketchOverlay.classList.remove('visible');
  btnToggleView.textContent = 'Switch to Sketchbook View';

  if (!sceneReady) {
    initScene(canvas3d);
    initSketchbook(sketchSVG);
    sceneReady = true;
  }

  rebuildSolid();
}

function rebuildSolid() {
  const { shapeType, baseShape, params } = state;
  const canon = buildCanonicalSolid(shapeType, baseShape, params.sideLength, params.height, params.restType, params.baseRot);
  const geo   = transformSolid(canon, params.inclHP, params.apparentVP);
  updateSolidGeometry(geo);

  if (state.mode === 'sketchbook') {
    renderStep(state.sketchStep, { shapeType, baseShape, ...params });
    updateStepUI();
  }
}

// ─── View toggle ─────────────────────────────────────────────────────────────
// Wire the sketchbook's own toggle button
btnToggleViewSketch?.addEventListener('click', () => {
  state.mode = '360';
  sketchOverlay.classList.remove('visible');
  btnToggleView.textContent = 'Switch to Sketchbook View';
});

btnToggleView.addEventListener('click', () => {
  if (state.mode === '360') {
    state.mode = 'sketchbook';
    state.sketchStep = 0;
    sketchOverlay.classList.add('visible');
    btnToggleView.textContent = 'Switch to 360° View';
    const { shapeType, baseShape, params } = state;
    renderStep(0, { shapeType, baseShape, ...params });
    updateStepUI();
  } else {
    state.mode = '360';
    sketchOverlay.classList.remove('visible');
    btnToggleView.textContent = 'Switch to Sketchbook View';
  }
});

// ─── Step controls ───────────────────────────────────────────────────────────
btnNextStep.addEventListener('click', () => {
  if (state.sketchStep < 6) {
    state.sketchStep++;
    const { shapeType, baseShape, params } = state;
    renderStep(state.sketchStep, { shapeType, baseShape, ...params });
    updateStepUI();
  }
});

btnPrevStep.addEventListener('click', () => {
  if (state.sketchStep > 0) {
    state.sketchStep--;
    const { shapeType, baseShape, params } = state;
    renderStep(state.sketchStep, { shapeType, baseShape, ...params });
    updateStepUI();
  }
});

const STEP_LABELS = [
  'Start — press Next Step to begin',
  'Step 1 of 6 — Initial Top View (Shape ④)',
  'Step 2 of 6 — Initial Front View (Shape ①)',
  'Step 3 of 6 — Front View after tilt (Shape ②) + projection lines',
  'Step 4 of 6 — Top View after tilt (Shape ⑤)',
  'Step 5 of 6 — Final Top View (Shape ⑥) via 45° transfer',
  'Step 6 of 6 — FINAL Front View (Shape ③) ✓',
];

function updateStepUI() {
  stepCounter.textContent = STEP_LABELS[state.sketchStep] || '';
  btnPrevStep.disabled = state.sketchStep === 0;
  btnNextStep.disabled = state.sketchStep === 6;
  btnNextStep.textContent = state.sketchStep === 6 ? '✓ Complete' : 'Next Step →';
}

// ─── Parameter sliders ───────────────────────────────────────────────────────
function bindSlider(sl, val, key, suffix, rebuild = true) {
  sl.value = state.params[key];
  val.textContent = state.params[key] + suffix;
  sl.addEventListener('input', () => {
    state.params[key] = parseFloat(sl.value);
    val.textContent = sl.value + suffix;
    if (rebuild) rebuildSolid();
  });
}

bindSlider(slSide,    valSide,   'sideLength', ' mm');
bindSlider(document.getElementById('sl-base-rot'), document.getElementById('val-base-rot'), 'baseRot', '°');
bindSlider(slHeight,  valHeight, 'height',     ' mm');
bindSlider(slInclHP,  valInclHP, 'inclHP',     '°');
bindSlider(slApprVP,  valApprVP, 'apparentVP', '°');

const slRestType = document.getElementById('sl-rest-type');
if (slRestType) {
  slRestType.value = state.params.restType;
  slRestType.addEventListener('change', () => {
    state.params.restType = slRestType.value;
    rebuildSolid();
  });
}

document.getElementById('btn-sleep').addEventListener('click', () => {
  state.params.inclHP = 0;
  document.getElementById('sl-incl-hp').value = 0;
  document.getElementById('val-incl-hp').textContent = '0°';
  rebuildSolid();
});

// ─── Back button from viewer ─────────────────────────────────────────────────
document.getElementById('btn-back-viewer').addEventListener('click', () => {
  sketchOverlay.classList.remove('visible');
  state.mode = '360';
  goTo('baseShape');
});
