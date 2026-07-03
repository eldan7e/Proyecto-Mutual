/**
 * Global application constants.
 * Single source of truth for provider identifiers and payment states.
 */

/* ─────────────────────────────────────────────
   PROVIDERS
   ───────────────────────────────────────────── */

/**
 * Canonical provider catalogue.
 * Each entry carries its DB id, display name, and lowercase key
 * used in CargaManual / parser selection.
 */
export const PROVIDERS = Object.freeze({
  CLARO:    { id: 1, name: 'CLARO',    key: 'claro' },
  MOVISTAR: { id: 2, name: 'MOVISTAR', key: 'movistar' },
  PERSONAL: { id: 3, name: 'PERSONAL', key: 'personal' },
});

/** Map lowercase key → provider id  (used to replace inline `provMap` objects). */
export const PROVIDER_KEY_TO_ID = Object.freeze(
  Object.values(PROVIDERS).reduce((m, p) => ({ ...m, [p.key]: p.id }), {})
);
// { claro: 1, movistar: 2, personal: 3 }

/** Map uppercase name → provider id  (used in Facturacion.jsx PROV_IDS). */
export const PROVIDER_NAME_TO_ID = Object.freeze(
  Object.values(PROVIDERS).reduce((m, p) => ({ ...m, [p.name]: p.id }), {})
);
// { CLARO: 1, MOVISTAR: 2, PERSONAL: 3 }

/** Map id → uppercase name  (reverse lookup for display). */
export const PROVIDER_ID_TO_NAME = Object.freeze(
  Object.values(PROVIDERS).reduce((m, p) => ({ ...m, [p.id]: p.name }), {})
);
// { 1: 'CLARO', 2: 'MOVISTAR', 3: 'PERSONAL' }

/** Dropdown options for `<select>` elements. */
export const PROVIDER_OPTIONS = Object.freeze(
  Object.values(PROVIDERS).map((p) => ({ value: p.name, label: p.name }))
);

/* ─────────────────────────────────────────────
   PAYMENT / LIQUIDATION STATES
   ───────────────────────────────────────────── */

export const PAYMENT_STATES = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  LIQUIDADO: 'LIQUIDADO',
  ABONADO:   'ABONADO',
});

/** CSS-friendly colour map for status badges. */
export const PAYMENT_STATE_STYLES = Object.freeze({
  [PAYMENT_STATES.PENDIENTE]: { bg: '#fef3c7', color: '#92400e', label: 'Pendiente' },
  [PAYMENT_STATES.LIQUIDADO]: { bg: '#dbeafe', color: '#1e40af', label: 'Liquidado' },
  [PAYMENT_STATES.ABONADO]:   { bg: '#dcfce7', color: '#166534', label: 'Abonado' },
});

/* ─────────────────────────────────────────────
   LINE / SOCIO STATES
   ───────────────────────────────────────────── */

export const LINE_STATES = Object.freeze({
  ACTIVA:   'ACTIVA',
  INACTIVA: 'INACTIVA',
});

/* ─────────────────────────────────────────────
   MISC
   ───────────────────────────────────────────── */

/** Default tarifa Aunar fallbacks by provider id. */
export const DEFAULT_TARIFA_AUNAR = Object.freeze({
  [PROVIDERS.CLARO.id]:    7585,
  [PROVIDERS.MOVISTAR.id]: 6700,
  [PROVIDERS.PERSONAL.id]: 3280,
});

/** Chunk size used when upserting / inserting rows in batches. */
export const DB_CHUNK_SIZE = 50;
