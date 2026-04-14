export const CONFIG = {
  canvasWidth: 960,
  canvasHeight: 704,
  tileSize: 32,
  pixelScale: 3,
  targetFPS: 60,
  characterWidth: 12 * 3,
  characterHeight: 16 * 3,
  collisionPadding: 4,
  minY: 60,
  zoomMin: 0.25,
  zoomMax: 2.0,
  zoomDefault: 1.0,
};

export const ROLE_COLORS = {
  leader: { primary: '#FFD700', secondary: '#9B59B6', accent: '#F4D03F', dot: '#FFD700' },
  frontend: { primary: '#3498DB', secondary: '#2980B9', accent: '#85C1E9', dot: '#3498DB' },
  backend: { primary: '#27AE60', secondary: '#1E8449', accent: '#82E0AA', dot: '#27AE60' },
  designer: { primary: '#E91E8C', secondary: '#C2185B', accent: '#F48FB1', dot: '#E91E8C' },
  qa: { primary: '#E74C3C', secondary: '#CB4335', accent: '#F1948A', dot: '#E74C3C' },
  default: { primary: '#94a3b8', secondary: '#64748b', accent: '#cbd5e1', dot: '#94a3b8' },
};

export const WORKSTATIONS = {
  'leader-01': { x: 15 * 32 + 16, y: 4 * 32 + 28 },
  'fe-01': { x: 5 * 32 + 16, y: 4 * 32 + 28 },
  'be-01': { x: 9 * 32 + 16, y: 4 * 32 + 28 },
  'design-01': { x: 5 * 32 + 16, y: 14 * 32 + 28 },
  'qa-01': { x: 9 * 32 + 16, y: 14 * 32 + 28 },
};

export const AGENT_WORKSTATION = {
  main: 'leader-01',
  husky: 'fe-01',
};
