// js/scene3d.js — Three.js 360° interactive 3D view
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let renderer, scene, camera, controls;
let dashedLines, solidLines, invisMesh;
let currentGeoData = null;
let animFrameId = null;

export function initScene(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0xffffff);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 2000);
  camera.position.set(80, 80, 160);
  camera.lookAt(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Resize observer
  const ro = new ResizeObserver(() => resize(canvas));
  ro.observe(canvas.parentElement);
  resize(canvas);

  startRenderLoop();
}

function resize(canvas) {
  const w = canvas.parentElement.clientWidth;
  const h = canvas.parentElement.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function updateSolidGeometry(geo) {
  currentGeoData = geo;
  clearScene();

  const { vertices, edges, faces } = geo;

  // --- Invisible mesh: fills depth buffer so solid lines clip correctly ---
  const meshGeo = buildMeshGeometry(vertices, faces);
  const meshMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.FrontSide,
    depthWrite: true,
    colorWrite: false,  // don't write color, just depth
  });
  invisMesh = new THREE.Mesh(meshGeo, meshMat);
  invisMesh.renderOrder = 0;
  scene.add(invisMesh);

  // --- ALL edges dashed — drawn without depth test (always shows hidden lines) ---
  const allEdgePts = edgePoints(vertices, edges);
  const dashedGeo = new THREE.BufferGeometry().setFromPoints(allEdgePts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const dashedMat = new THREE.LineDashedMaterial({
    color: 0x000000, dashSize: 3, gapSize: 2.5, linewidth: 1,
  });
  dashedLines = new THREE.LineSegments(dashedGeo, dashedMat);
  dashedLines.computeLineDistances();
  dashedLines.material.depthTest = false;
  dashedLines.renderOrder = 1;
  scene.add(dashedLines);

  // --- ALL edges solid — drawn WITH depth test (overwrites dashed for visible edges) ---
  const solidGeo = new THREE.BufferGeometry().setFromPoints(allEdgePts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const solidMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1.5 });
  solidLines = new THREE.LineSegments(solidGeo, solidMat);
  solidLines.material.depthTest = true;
  solidLines.renderOrder = 2;
  scene.add(solidLines);

  // Axis line (apex to base center): long-dash pattern, dark gray
  addAxisLine(geo);

  // Auto-fit camera to solid
  fitCamera(vertices);
}

function addAxisLine(geo) {
  let p1, p2;
  const v = geo.vertices;
  if (geo.shapeType === 'pyramid') {
    p2 = v[geo.n]; // apex
    p1 = avgVerts(v.slice(0, geo.n));
  } else {
    p1 = avgVerts(v.slice(0, geo.n));
    p2 = avgVerts(v.slice(geo.n));
  }
  const pts = [new THREE.Vector3(...p1), new THREE.Vector3(...p2)];
  const axGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const axMat = new THREE.LineDashedMaterial({ color: 0x444444, dashSize: 8, gapSize: 4, linewidth: 1 });
  const axLine = new THREE.LineSegments(axGeo, axMat);
  axLine.computeLineDistances();
  axLine.material.depthTest = false;
  axLine.renderOrder = 3;
  scene.add(axLine);
}

function edgePoints(vertices, edges) {
  const pts = [];
  edges.forEach(([i, j]) => { pts.push(vertices[i]); pts.push(vertices[j]); });
  return pts;
}

function buildMeshGeometry(vertices, faces) {
  const geo = new THREE.BufferGeometry();
  const pos = [];
  faces.forEach(face => {
    // Triangulate: fan from first vertex
    for (let i = 1; i < face.length - 1; i++) {
      pos.push(...vertices[face[0]], ...vertices[face[i]], ...vertices[face[i + 1]]);
    }
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function clearScene() {
  while (scene.children.length > 0) scene.remove(scene.children[0]);
}

function fitCamera(vertices) {
  const box = new THREE.Box3();
  vertices.forEach(([x, y, z]) => box.expandByPoint(new THREE.Vector3(x, y, z)));
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = box.getSize(new THREE.Vector3()).length();
  camera.position.copy(center).addScaledVector(new THREE.Vector3(0.6, 0.7, 1).normalize(), size * 1.8);
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}

function avgVerts(verts) {
  const n = verts.length;
  return [
    verts.reduce((s, v) => s + v[0], 0) / n,
    verts.reduce((s, v) => s + v[1], 0) / n,
    verts.reduce((s, v) => s + v[2], 0) / n,
  ];
}

function startRenderLoop() {
  function loop() {
    animFrameId = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  }
  loop();
}

export function stopRenderLoop() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
}
