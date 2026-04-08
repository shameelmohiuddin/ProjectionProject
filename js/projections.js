// js/projections.js — Correct orthographic projection with depth-based visibility
import { faceNormal, dot3 } from './geometry.js';

/** Project 3D solid to 2D for a given view. */
export function project(geo, view) {
  const { vertices, edges, faces } = geo;

  // Camera direction (from scene toward camera)
  const viewDir = view === 'front' ? [0, 0, 1] : [0, 1, 0];

  // 2D projection: front drops Z, top drops Y
  const proj = view === 'front'
    ? ([x, y]) => [x, y]
    : ([x, , z]) => [x, z];

  // Depth: higher value = closer to camera
  const depthOf = view === 'front'
    ? ([, , z]) => z
    : ([, y]) => y;

  const pts2d  = vertices.map(v => proj(v));
  const depths = vertices.map(v => depthOf(v));

  // Precompute which faces are front-facing
  const normals    = faces.map(f => faceNormal(f, vertices));
  const frontFacing = normals.map(n => dot3(n, viewDir) > 0);

  // Edge-adjacency map
  const edgeFaces = new Map();
  faces.forEach((face, fi) => {
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const key = Math.min(a, b) + '_' + Math.max(a, b);
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key).push(fi);
    }
  });

  const visibleEdges = [], hiddenEdges = [];

  for (const [i, j] of edges) {
    const key = Math.min(i, j) + '_' + Math.max(i, j);
    const adjFaces = edgeFaces.get(key) || [];

    const visible = isEdgeVisible(
      vertices[i], vertices[j], i, j,
      vertices, faces, frontFacing,
      proj, depthOf, viewDir
    );

    (visible ? visibleEdges : hiddenEdges).push([pts2d[i], pts2d[j]]);
  }

  // Axis line
  let axisLine = null;
  if (geo.shapeType === 'pyramid') {
    axisLine = [pts2d[geo.n], avgPts(pts2d.slice(0, geo.n))];
  } else {
    axisLine = [avgPts(pts2d.slice(geo.n)), avgPts(pts2d.slice(0, geo.n))];
  }

  const xs = pts2d.map(p => p[0]), ys = pts2d.map(p => p[1]);
  return {
    visibleEdges, hiddenEdges, axisLine, allVerts2d: pts2d,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  };
}

/**
 * Depth-based edge visibility for a convex solid (orthographic).
 * An edge is HIDDEN if its midpoint is inside a front-facing face that is
 * closer to the camera (higher depth).
 *
 * Key insight: if NO face is front-facing (e.g. upright pyramid from top),
 * then nothing can occlude anything → ALL edges are visible. This correctly
 * shows all lines in canonical top/front views.
 */
function isEdgeVisible(A, B, iA, iB, vertices, faces, frontFacing, proj, depthOf, viewDir) {
  const SAMPLES = 5;
  const BIAS    = 0.5; // mm — prevents coplanar self-occlusion

  for (let s = 0; s < SAMPLES; s++) {
    const t  = (s + 0.5) / SAMPLES;
    const P3 = [
      A[0] + t * (B[0] - A[0]),
      A[1] + t * (B[1] - A[1]),
      A[2] + t * (B[2] - A[2]),
    ];
    const P2   = proj(P3);
    const depP = depthOf(P3);

    for (let fi = 0; fi < faces.length; fi++) {
      if (!frontFacing[fi]) continue;

      const face = faces[fi];
      // Skip if this face contains one of our edge vertices
      if (face.includes(iA) || face.includes(iB)) continue;

      // Face must be in FRONT of the sample point
      const faceDepth = face.reduce((s, vi) => s + depthOf(vertices[vi]), 0) / face.length;
      if (faceDepth <= depP + BIAS) continue;

      // Point-in-polygon test (2D)
      const poly = face.map(vi => proj(vertices[vi]));
      if (pointInPoly(P2, poly)) return false; // this sample is hidden
    }
  }
  return true;
}

// Ray-casting point-in-polygon (2D)
function pointInPoly([px, py], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function avgPts(pts) {
  const n = pts.length;
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
}
