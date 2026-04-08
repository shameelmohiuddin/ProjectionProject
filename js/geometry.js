// js/geometry.js — Solid geometry for engineering drawings
// Coordinate system: X=right, Y=up, Z=toward viewer
// Front view looks along -Z (camera at +Z). Top view looks along -Y (camera at +Y).

export function getPolygonSides(baseShape) {
  return { triangle: 3, square: 4, pentagon: 5, hexagon: 6, circle: 48 }[baseShape] || 4;
}

/**
 * Build solid in canonical position: base at y=0, axis along +Y.
 * One edge of base is parallel to X-axis (frontal to VP) for even n;
 * one vertex points toward -Z for odd n — matching VTU convention.
 */
export function buildCanonicalSolid(shapeType, baseShape, sideLength, height, restType = 'edge', baseRot = 0) {
  const n = getPolygonSides(baseShape);
  const isCircle = baseShape === 'circle';

  // Circumradius
  const R = isCircle ? sideLength / 2 : sideLength / (2 * Math.sin(Math.PI / n));

  // Angle of first vertex
  let startAngle = 0;
  if (!isCircle) {
    if (restType === 'corner') {
      startAngle = 0; // Extreme right is a corner (+X)
    } else {
      startAngle = -Math.PI / n; // Extreme right is an edge centered at +X (parallel to Z)
    }
  }
  startAngle += (baseRot * Math.PI) / 180;

  const baseVerts = [];
  for (let i = 0; i < n; i++) {
    const a = startAngle + (2 * Math.PI * i / n);
    baseVerts.push([R * Math.cos(a), 0, R * Math.sin(a)]);
  }

  let vertices, edges, faces;

  if (shapeType === 'pyramid') {
    const apex = [0, height, 0];
    vertices = [...baseVerts, apex];
    const ai = n; // apex index

    edges = [];
    // Base polygon edges
    for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]);
    // Lateral edges
    for (let i = 0; i < n; i++) edges.push([i, ai]);

    faces = [];
    // Base face (one polygon)
    faces.push(Array.from({ length: n }, (_, i) => i));
    // Lateral triangle faces
    for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, ai]);

    return { vertices, edges, faces, shapeType, baseShape, n, isCircle, height, sideLength };

  } else { // prism
    const topVerts = baseVerts.map(([x, , z]) => [x, height, z]);
    vertices = [...baseVerts, ...topVerts];

    edges = [];
    // Bottom edges
    for (let i = 0; i < n; i++) edges.push([i, (i + 1) % n]);
    // Top edges
    for (let i = 0; i < n; i++) edges.push([n + i, n + (i + 1) % n]);
    // Lateral edges
    for (let i = 0; i < n; i++) edges.push([i, n + i]);

    faces = [];
    // Bottom face
    faces.push(Array.from({ length: n }, (_, i) => i));
    // Top face (reversed winding for outward normal)
    faces.push(Array.from({ length: n }, (_, i) => n + (n - 1 - i)));
    // Lateral quad faces
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push([i, j, n + j, n + i]);
    }

    return { vertices, edges, faces, shapeType, baseShape, n, isCircle, height, sideLength };
  }
}

function rotateX([x, y, z], theta) {
  return [x, y * Math.cos(theta) - z * Math.sin(theta), y * Math.sin(theta) + z * Math.cos(theta)];
}
function rotateY([x, y, z], gamma) {
  return [x * Math.cos(gamma) + z * Math.sin(gamma), y, -x * Math.sin(gamma) + z * Math.cos(gamma)];
}
function rotateZ([x, y, z], alpha) {
  return [x * Math.cos(alpha) - y * Math.sin(alpha), x * Math.sin(alpha) + y * Math.cos(alpha), z];
}

export function transformSolid(geo, inclHP = 45, apparentVP = 45) {
  // Find rightmost point on base to figure out the resting edge
  const baseVerts = geo.vertices.filter(v => v[1] < 1e-6);
  const xmax = Math.max(...baseVerts.map(v => v[0]));
  
  let theta_initial;
  if (geo.shapeType === 'prism') {
    theta_initial = Math.PI / 2; // 90°
  } else {
    theta_initial = Math.atan2(geo.height, -xmax); // Angle of (-xmax, H)
  }

  // inclHP is direct slant edge inclination to HP. 0 = sleep.
  const E = (inclHP * Math.PI) / 180;
  const alpha = E - theta_initial; 

  // apparentVP inclination: peak faces towards the XY axis!
  // Positive gamma rotates +X (where the peak sits after tilt) into -Z (upwards towards XY)
  const gamma = (apparentVP * Math.PI) / 180; 

  const transform = (v) => rotateY(rotateZ(v, alpha), gamma);
  let newVerts = geo.vertices.map(transform);

  // Ground the solid on the HP (y=0) so front views touch the XY line
  const minY = Math.min(...newVerts.map(v => v[1]));
  newVerts = newVerts.map(([x, y, z]) => [x, y - minY, z]);

  return {
    ...geo,
    vertices: newVerts,
    _theta: alpha,
    _gamma: gamma,
  };
}

/** Compute outward face normal (right-hand rule from vertex order). */
export function faceNormal(face, vertices) {
  const v0 = vertices[face[0]];
  const v1 = vertices[face[1]];
  const v2 = vertices[face[2]];
  const e1 = sub3(v1, v0), e2 = sub3(v2, v0);
  return normalize3(cross3(e1, e2));
}

/**
 * Classify edges as visible or hidden for a given camera direction.
 * viewDir: unit vector pointing FROM scene TOWARD camera (e.g. [0,0,1] for front view).
 * Works perfectly for convex solids: edge hidden iff ALL adjacent faces are back-facing.
 */
export function classifyEdges(geo, viewDir) {
  const { vertices, edges, faces } = geo;

  // Which faces are front-facing?
  const frontFacing = faces.map(f => dot3(faceNormal(f, vertices), viewDir) > -0.001);

  // Edge → adjacent face indices
  const edgeFaces = new Map();
  faces.forEach((face, fi) => {
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const key = Math.min(a, b) + '_' + Math.max(a, b);
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key).push(fi);
    }
  });

  const visible = [], hidden = [];
  edges.forEach(([i, j]) => {
    const key = Math.min(i, j) + '_' + Math.max(i, j);
    const fis = edgeFaces.get(key) || [];
    // Boundary edges (only one face) are always visible
    const isVisible = fis.length <= 1 || fis.some(fi => frontFacing[fi]);
    (isVisible ? visible : hidden).push([i, j]);
  });
  return { visible, hidden };
}

// --- Vector helpers ---
export function sub3([ax,ay,az],[bx,by,bz]) { return [ax-bx,ay-by,az-bz]; }
export function dot3([ax,ay,az],[bx,by,bz]) { return ax*bx+ay*by+az*bz; }
export function cross3([ax,ay,az],[bx,by,bz]) { return [ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx]; }
export function normalize3(v) {
  const l = Math.sqrt(v[0]**2+v[1]**2+v[2]**2);
  return l > 0 ? [v[0]/l,v[1]/l,v[2]/l] : [0,1,0];
}
