// Shared sound definitions used by both admin and user notification systems.
// Each sound is a sequence of {at, freq, dur, type, peak} notes scheduled
// on a Web Audio context. peak gets multiplied by user-selected volume.

export const ADMIN_BUILTIN_SOUNDS = [
  {
    id: 'ding',
    label: 'Ding (default)',
    notes: [
      { at: 0.00, freq: 880,  dur: 0.40, type: 'sine', peak: 0.30 },
      { at: 0.22, freq: 1175, dur: 0.40, type: 'sine', peak: 0.30 },
    ],
  },
  {
    id: 'chime',
    label: 'Chime (soft)',
    notes: [
      { at: 0.00, freq: 1568, dur: 0.50, type: 'sine', peak: 0.22 },
      { at: 0.18, freq: 2093, dur: 0.50, type: 'sine', peak: 0.22 },
      { at: 0.36, freq: 2637, dur: 0.55, type: 'sine', peak: 0.22 },
    ],
  },
  {
    id: 'bell',
    label: 'Bell',
    notes: [
      { at: 0.00, freq: 1760, dur: 0.90, type: 'triangle', peak: 0.28 },
      { at: 0.06, freq: 2637, dur: 0.85, type: 'triangle', peak: 0.18 },
    ],
  },
  {
    id: 'alert',
    label: 'Alert (urgent)',
    notes: [
      { at: 0.00, freq: 880, dur: 0.18, type: 'square', peak: 0.22 },
      { at: 0.20, freq: 660, dur: 0.18, type: 'square', peak: 0.22 },
      { at: 0.40, freq: 880, dur: 0.18, type: 'square', peak: 0.22 },
      { at: 0.60, freq: 660, dur: 0.18, type: 'square', peak: 0.22 },
    ],
  },
  {
    id: 'cash',
    label: 'Cash register',
    notes: [
      { at: 0.00, freq: 1318, dur: 0.18, type: 'sine', peak: 0.30 },
      { at: 0.10, freq: 1568, dur: 0.18, type: 'sine', peak: 0.30 },
      { at: 0.20, freq: 2093, dur: 0.20, type: 'sine', peak: 0.30 },
      { at: 0.32, freq: 2637, dur: 0.40, type: 'sine', peak: 0.30 },
    ],
  },
];

// User-side sound bank — separate menus for "approval", "rejection", "click".
export const USER_APPROVAL_SOUNDS = [
  {
    id: 'success',
    label: 'Success chime',
    notes: [
      { at: 0.00, freq: 1318, dur: 0.18, type: 'sine', peak: 0.32 },
      { at: 0.10, freq: 1568, dur: 0.18, type: 'sine', peak: 0.32 },
      { at: 0.22, freq: 2093, dur: 0.40, type: 'sine', peak: 0.32 },
    ],
  },
  {
    id: 'fanfare',
    label: 'Fanfare',
    notes: [
      { at: 0.00, freq: 880,  dur: 0.14, type: 'triangle', peak: 0.30 },
      { at: 0.10, freq: 1175, dur: 0.14, type: 'triangle', peak: 0.30 },
      { at: 0.20, freq: 1568, dur: 0.14, type: 'triangle', peak: 0.30 },
      { at: 0.30, freq: 2093, dur: 0.40, type: 'triangle', peak: 0.30 },
    ],
  },
  {
    id: 'coin',
    label: 'Coin drop',
    notes: [
      { at: 0.00, freq: 2637, dur: 0.06, type: 'sine', peak: 0.30 },
      { at: 0.05, freq: 3136, dur: 0.18, type: 'sine', peak: 0.28 },
    ],
  },
  {
    id: 'cashreg',
    label: 'Cash register',
    notes: [
      { at: 0.00, freq: 1318, dur: 0.18, type: 'sine', peak: 0.30 },
      { at: 0.10, freq: 1568, dur: 0.18, type: 'sine', peak: 0.30 },
      { at: 0.20, freq: 2093, dur: 0.20, type: 'sine', peak: 0.30 },
      { at: 0.32, freq: 2637, dur: 0.40, type: 'sine', peak: 0.30 },
    ],
  },
];

export const USER_REJECTION_SOUNDS = [
  {
    id: 'sadtone',
    label: 'Sad tone',
    notes: [
      { at: 0.00, freq: 622, dur: 0.22, type: 'sine', peak: 0.28 },
      { at: 0.20, freq: 466, dur: 0.30, type: 'sine', peak: 0.28 },
    ],
  },
  {
    id: 'buzz',
    label: 'Buzzer',
    notes: [
      { at: 0.00, freq: 220, dur: 0.45, type: 'sawtooth', peak: 0.20 },
    ],
  },
  {
    id: 'descend',
    label: 'Descending',
    notes: [
      { at: 0.00, freq: 880, dur: 0.14, type: 'square', peak: 0.18 },
      { at: 0.12, freq: 660, dur: 0.14, type: 'square', peak: 0.18 },
      { at: 0.24, freq: 440, dur: 0.30, type: 'square', peak: 0.18 },
    ],
  },
];

export const USER_CLICK_SOUNDS = [
  {
    id: 'tick',
    label: 'Tick',
    notes: [
      { at: 0.00, freq: 1500, dur: 0.04, type: 'square', peak: 0.18 },
    ],
  },
  {
    id: 'pop',
    label: 'Pop',
    notes: [
      { at: 0.00, freq: 880, dur: 0.05, type: 'sine', peak: 0.22 },
      { at: 0.03, freq: 1175, dur: 0.05, type: 'sine', peak: 0.22 },
    ],
  },
  {
    id: 'chip',
    label: 'Casino chip',
    notes: [
      { at: 0.00, freq: 2200, dur: 0.03, type: 'square', peak: 0.20 },
      { at: 0.02, freq: 1500, dur: 0.05, type: 'sine', peak: 0.18 },
    ],
  },
  {
    id: 'silent',
    label: 'No sound',
    notes: [],
  },
];

export const VIBRATION_PATTERNS = {
  // Notification patterns
  ding: [180, 80, 180],
  chime: [120, 60, 120, 60, 120],
  bell: [400],
  alert: [120, 80, 120, 80, 120, 80, 120],
  cash: [80, 40, 80, 40, 80, 40, 200],
  // Approval/rejection
  success: [120, 60, 200],
  fanfare: [80, 40, 80, 40, 200],
  coin: [60, 30, 60],
  cashreg: [80, 40, 80, 40, 80, 40, 200],
  sadtone: [400],
  buzz: [500],
  descend: [120, 60, 120, 60, 200],
  // Click
  tick: [10],
  pop: [15],
  chip: [12],
  silent: [],
};
