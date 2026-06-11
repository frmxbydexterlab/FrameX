/**
 * SSMA Standard Steel Framing Member Catalog
 * Based on Steel Stud Manufacturers Association designations.
 *
 * Designation format: {depth}{S|T}{flange}-{gauge}
 *   depth   = in hundredths of inch (e.g. 362 = 3-5/8")
 *   S       = C-Stud, T = Track
 *   flange  = in hundredths of inch (e.g. 125 = 1-1/4")
 *   gauge   = mils (e.g. 33 = 33 mil = 0.838mm)
 */

const SSMA_GAUGES = {
  18: { mils: 18, mm: 0.455, label: '18 mil (25 ga)' },
  27: { mils: 27, mm: 0.686, label: '27 mil (22 ga)' },
  30: { mils: 30, mm: 0.762, label: '30 mil (22 ga)' },
  33: { mils: 33, mm: 0.838, label: '33 mil (20 ga)' },
  43: { mils: 43, mm: 1.092, label: '43 mil (18 ga)' },
  54: { mils: 54, mm: 1.372, label: '54 mil (16 ga)' },
  68: { mils: 68, mm: 1.727, label: '68 mil (14 ga)' },
  97: { mils: 97, mm: 2.464, label: '97 mil (12 ga)' },
};

const SSMA_DEPTHS = [
  { code: '150', mm: 38.10, label: '1-1/2"' },
  { code: '162', mm: 41.28, label: '1-5/8"' },
  { code: '250', mm: 63.50, label: '2-1/2"' },
  { code: '350', mm: 88.90, label: '3-1/2"' },
  { code: '362', mm: 92.08, label: '3-5/8"' },
  { code: '400', mm: 101.60, label: '4"' },
  { code: '550', mm: 139.70, label: '5-1/2"' },
  { code: '600', mm: 152.40, label: '6"' },
  { code: '800', mm: 203.20, label: '8"' },
  { code: '1000', mm: 254.00, label: '10"' },
  { code: '1200', mm: 304.80, label: '12"' },
];

const SSMA_STUD_FLANGES = [
  { code: '125', mm: 31.75, label: '1-1/4"' },
  { code: '137', mm: 34.93, label: '1-3/8"' },
  { code: '150', mm: 38.10, label: '1-1/2"' },
  { code: '162', mm: 41.28, label: '1-5/8"' },
  { code: '200', mm: 50.80, label: '2"' },
];

const SSMA_TRACK_FLANGES = [
  { code: '125', mm: 31.75, label: '1-1/4"' },
  { code: '150', mm: 38.10, label: '1-1/2"' },
  { code: '200', mm: 50.80, label: '2"' },
];

// Common stud designations used in practice
const SSMA_COMMON_STUDS = [
  '162S125-18', '162S125-27', '162S125-33',
  '250S125-18', '250S125-27', '250S125-33', '250S125-43',
  '350S125-18', '350S125-27', '350S125-33', '350S125-43', '350S125-54',
  '362S125-18', '362S125-27', '362S125-33', '362S125-43', '362S125-54',
  '362S137-33', '362S137-43', '362S137-54',
  '362S162-33', '362S162-43', '362S162-54', '362S162-68',
  '400S125-33', '400S125-43', '400S125-54',
  '400S162-33', '400S162-43', '400S162-54', '400S162-68',
  '550S162-33', '550S162-43', '550S162-54', '550S162-68',
  '600S125-33', '600S125-43', '600S125-54',
  '600S162-33', '600S162-43', '600S162-54', '600S162-68', '600S162-97',
  '800S162-33', '800S162-43', '800S162-54', '800S162-68', '800S162-97',
  '800S200-33', '800S200-43', '800S200-54', '800S200-68', '800S200-97',
  '1000S162-43', '1000S162-54', '1000S162-68', '1000S162-97',
  '1200S162-54', '1200S162-68', '1200S162-97',
];

const SSMA_COMMON_TRACKS = [
  '162T125-18', '162T125-27', '162T125-33',
  '250T125-18', '250T125-27', '250T125-33', '250T125-43',
  '350T125-18', '350T125-27', '350T125-33', '350T125-43', '350T125-54',
  '362T125-18', '362T125-27', '362T125-33', '362T125-43', '362T125-54',
  '400T125-33', '400T125-43', '400T125-54',
  '400T150-33', '400T150-43', '400T150-54',
  '550T125-33', '550T125-43', '550T125-54',
  '600T125-33', '600T125-43', '600T125-54',
  '600T150-33', '600T150-43', '600T150-54',
  '800T125-33', '800T125-43', '800T125-54', '800T125-68',
  '800T150-33', '800T150-43', '800T150-54', '800T150-68',
  '1000T150-43', '1000T150-54', '1000T150-68',
  '1200T150-54', '1200T150-68', '1200T150-97',
];

/**
 * Parse an SSMA designation string into dimensions (mm).
 * E.g. "362S125-33" → { depth_mm: 92.08, flange_mm: 31.75, gauge_mm: 0.838, type: 'S' }
 */
function parseSSMA(designation) {
  const match = designation.match(/^(\d+)(S|T)(\d+)-(\d+)$/);
  if (!match) return null;

  const depthCode = match[1];
  const type = match[2];
  const flangeCode = match[3];
  const gaugeCode = parseInt(match[4]);

  const depth = SSMA_DEPTHS.find(d => d.code === depthCode);
  const flanges = type === 'S' ? SSMA_STUD_FLANGES : SSMA_TRACK_FLANGES;
  const flange = flanges.find(f => f.code === flangeCode);
  const gauge = SSMA_GAUGES[gaugeCode];

  if (!depth || !flange || !gauge) return null;

  return {
    designation,
    type,
    depth_mm: depth.mm,
    flange_mm: flange.mm,
    gauge_mm: gauge.mm,
    depth_label: depth.label,
    flange_label: flange.label,
    gauge_label: gauge.label,
  };
}

/**
 * Build a readable label: "362S125-33 (3-5/8" × 1-1/4" × 33mil)"
 */
function ssmaLabel(designation) {
  const p = parseSSMA(designation);
  if (!p) return designation;
  return `${designation}  (${p.depth_label} × ${p.flange_label} × ${p.gauge_label})`;
}
