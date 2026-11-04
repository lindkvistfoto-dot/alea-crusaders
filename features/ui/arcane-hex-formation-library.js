/* Data-driven formation catalog that extends the existing Arcane Geometry Engine. */
(function (root) {
  'use strict';
  const engine = root.aleaArcaneGeometryEngine;
  if (!engine) throw new Error('Arcane Geometry Engine must load before the formation library');

  // Row recipes stay data, not per-formation rendering code. Row offsets are
  // computed once through the shared axial engine and persisted in each record.
  const recipes = [
    ['single-standard', 'Standard', '1 hex', [1], 'standard'],
    ['double-line', 'Linje', '2 hex', [2], 'linear'],
    ['triple-line', 'Linje', '3 hex', [3], 'linear'],
    ['triple-compact', 'Kompakt', '3 hex', [1, 2], 'compact'],
    ['quad-line', 'Linje', '4 hex', [4], 'linear'],
    ['quad-diamond', 'Diamant', '4 hex', [1, 2, 1], 'compact'],
    ['quad-compact', 'Kompakt', '4 hex', [1, 3], 'compact'],
    ['five-line', 'Linje', '5 hex', [5], 'linear'],
    ['five-compact-a', 'Kompakt', '5 hex', [2, 3], 'compact'],
    ['five-compact-b', 'Kompakt', '5 hex', [1, 3, 1], 'compact'],
    ['six-triangle', 'Triangel', '6 hex', [1, 2, 3], 'standard'],
    ['six-chevron', 'Kompakt', '6 hex', [1, 2, 2, 1], 'compact'],
    ['six-block', 'Block', '6 hex', [1, 1, 2, 2], 'compact'],
    ['seven-standard', 'Symmetrisk', '7 hex', [2, 3, 2], 'standard'],
    ['seven-alternative', 'Kompakt', '7 hex', [1, 2, 3, 1], 'compact'],
    ['eight-compact', 'Kompakt', '8 hex', [2, 3, 3], 'compact'],
    ['eight-symmetric', 'Symmetrisk', '8 hex', [2, 4, 2], 'standard'],
    ['nine-diamond', 'Diamant', '9 hex', [1, 2, 3, 2, 1], 'standard'],
    ['nine-block', 'Block', '9 hex', [3, 3, 3], 'compact']
  ];

  const coordKey = c => `${c.q},${c.r}`;
  const canonical = cells => {
    const forms = [];
    for (const mirror of [false, true]) {
      for (let steps = 0; steps < 6; steps++) {
        const points = cells.map(c => {
          const reflected = mirror ? engine.reflect(c) : c;
          return engine.rotate(reflected, steps);
        });
        const minQ = Math.min(...points.map(c => c.q));
        const minR = Math.min(...points.map(c => c.r));
        forms.push(points.map(c => ({ q: c.q - minQ, r: c.r - minR }))
          .map(coordKey).sort().join(';'));
      }
    }
    return forms.sort()[0];
  };
  const rotationalCanonical = cells => {
    const forms = [];
    for (let steps = 0; steps < 6; steps++) {
      const points = cells.map(c => engine.rotate(c, steps));
      const minQ = Math.min(...points.map(c => c.q));
      const minR = Math.min(...points.map(c => c.r));
      forms.push(points.map(c => ({ q: c.q - minQ, r: c.r - minR }))
        .map(coordKey).sort().join(';'));
    }
    return forms.sort()[0];
  };
  const edgeDirections = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
  function outline(cells) {
    const occupied = new Set(cells.map(coordKey));
    const edges = [];
    for (const cell of cells) {
      edgeDirections.forEach(([dq, dr], direction) => {
        if (!occupied.has(`${cell.q + dq},${cell.r + dr}`)) edges.push({ cell: { ...cell }, direction });
      });
    }
    return edges;
  }
  const catalog = recipes.map(([id, name, label, rows, family]) => {
    const aligned = engine.autoAlign(rows);
    const cells = aligned.cells.map(c => ({ q: c.q, r: c.r }));
    const check = engine.validate(cells);
    if (!check.valid) throw new Error(`Invalid built-in formation: ${id}`);
    return Object.freeze({
      id, name, label, count: cells.length, family,
      rows: Object.freeze(rows.slice()),
      offsets: Object.freeze(aligned.offsets.slice()),
      cells: Object.freeze(cells.map(Object.freeze)),
      canonical_key: canonical(cells),
      geometric_center: Object.freeze({
        q: cells.reduce((sum, c) => sum + c.q, 0) / cells.length,
        r: cells.reduce((sum, c) => sum + c.r, 0) / cells.length
      }),
      rotation_anchor: Object.freeze({ ...cells[0] }),
      contour: Object.freeze(outline(cells).map(Object.freeze)),
      directions: Object.freeze([0, 1, 2, 3, 4, 5]),
      mirror_available: rotationalCanonical(cells) !== rotationalCanonical(cells.map(engine.reflect)),
      graphic_profile: 'arcane-bronze-ivory-base', graphic_version: 'v1',
      graphic_status: 'generated-in-geometry-lab'
    });
  });
  const ids = new Set();
  const canonicalKeys = new Set();
  for (const item of catalog) {
    if (ids.has(item.id)) throw new Error(`Duplicate formation id: ${item.id}`);
    if (canonicalKeys.has(item.canonical_key)) throw new Error(`Duplicate geometric formation: ${item.id}`);
    ids.add(item.id);
    canonicalKeys.add(item.canonical_key);
  }

  function get(id) { return catalog.find(item => item.id === id) || null; }
  function byCount(count) { return catalog.filter(item => item.count === Number(count)); }
  function orient(id, { steps = 0, mirror = false } = {}) {
    const item = typeof id === 'string' ? get(id) : id;
    if (!item) throw new Error(`Unknown formation: ${id}`);
    const turns = ((Number(steps) % 6) + 6) % 6;
    const anchor = item.cells[0];
    const cells = item.cells.map(c => {
      const local = { q: c.q - anchor.q, r: c.r - anchor.r };
      return engine.rotate(mirror ? engine.reflect(local) : local, turns);
    });
    return { id: item.id, count: item.count, steps: turns, mirror: Boolean(mirror), cells, outline: outline(cells), canonical_key: item.canonical_key };
  }
  function audit(id, { steps = 0, mirror = false } = {}) {
    const item = typeof id === 'string' ? get(id) : id;
    if (!item) throw new Error(`Unknown formation: ${id}`);
    const oriented = orient(item, { steps, mirror });
    const connected = engine.validate(oriented.cells).valid;
    const sixTurnsReturn = canonical(oriented.cells) === item.canonical_key;
    return { valid: connected && sixTurnsReturn, count: oriented.cells.length,
      outerEdges: oriented.outline.length, connected, sixTurnsReturn,
      rotation: oriented.steps * 60, mirror: oriented.mirror };
  }
  root.aleaHexFormationLibrary = Object.freeze({ schema: 'arcane-hex-formation-library-v1', catalog: Object.freeze(catalog), get, byCount, canonical, outline, orient, audit });
})(globalThis);
