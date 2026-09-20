#!/usr/bin/env node
/**
 * Regenerates src/styles/_frntdesk-palettes.scss from the two brand hex
 * colors (see docs/plan for the "Copperbelt Copper" / "Mosi Teal" rationale).
 *
 * Uses Google's Material Color Utilities — the same HCT tonal-palette
 * algorithm behind the official Material Theme Builder — so the generated
 * ramp is bit-for-bit what that tool would produce for the same seed color.
 *
 * `CorePalette.contentOf()` is used deliberately instead of `CorePalette.of()`:
 * `.of()` floors chroma at 48, which resaturates a muted seed color into
 * something more vivid/generic. `.contentOf()` preserves the seed's actual
 * hue *and* chroma, which matters here since Mosi Teal is deliberately
 * desaturated — floored chroma would undo that on every regeneration.
 *
 * The package ships as pure ESM with extensionless internal imports, which
 * Node's own resolver rejects — esbuild's bundler-style resolution handles it,
 * so we bundle to a temp file and load that instead of require()'ing directly.
 *
 * Run: node apps/web/scripts/generate-theme-palette.cjs [primaryHex] [tertiaryHex]
 */
const { buildSync } = require('esbuild');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PRIMARY_SEED = process.argv[2] || '#C4622D'; // Copperbelt Copper
const TERTIARY_SEED = process.argv[3] || '#1F6F63'; // Mosi Teal
const OUT_FILE = path.join(__dirname, '../src/styles/_frntdesk-palettes.scss');

const BASE_TONES = [0, 10, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 95, 98, 99, 100];
const NEUTRAL_EXTRA_TONES = [4, 6, 12, 17, 22, 24, 87, 92, 94, 96];

// The fixed M3 error ramp Angular Material patches onto every stock palette
// (core/theming/_palettes.scss `_patch-error-palette`). Error hue is kept
// standardized across brands rather than derived from the seed, so this is
// reused verbatim rather than generated.
const ERROR_TONES = {
  0: '#000000', 10: '#410002', 20: '#690005', 25: '#7e0007', 30: '#93000a',
  35: '#a80710', 40: '#ba1a1a', 50: '#de3730', 60: '#ff5449', 70: '#ff897d',
  80: '#ffb4ab', 90: '#ffdad6', 95: '#ffedea', 98: '#fff8f7', 99: '#fffbff',
  100: '#ffffff',
};

function loadMaterialColorUtilities() {
  const entry = require.resolve('@material/material-color-utilities');
  const bundlePath = path.join(os.tmpdir(), `mcu-bundle-${process.pid}.cjs`);
  buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile: bundlePath });
  try {
    return require(bundlePath);
  } finally {
    fs.unlinkSync(bundlePath);
  }
}

function tonesOf(tonalPalette, tones) {
  const { hexFromArgb } = loadMaterialColorUtilities();
  const out = {};
  for (const t of tones) out[t] = hexFromArgb(tonalPalette.tone(t));
  return out;
}

function sassMap(obj, indent) {
  return Object.entries(obj)
    .map(([k, v]) => `${indent}${k}: ${v},`)
    .join('\n');
}

function main() {
  const { CorePalette, argbFromHex } = loadMaterialColorUtilities();

  const primaryCore = CorePalette.contentOf(argbFromHex(PRIMARY_SEED));
  const tertiaryCore = CorePalette.contentOf(argbFromHex(TERTIARY_SEED));

  const primary = tonesOf(primaryCore.a1, BASE_TONES);
  const secondary = tonesOf(primaryCore.a2, BASE_TONES);
  const neutral = tonesOf(primaryCore.n1, [...BASE_TONES, ...NEUTRAL_EXTRA_TONES]);
  const neutralVariant = tonesOf(primaryCore.n2, BASE_TONES);
  const tertiary = tonesOf(tertiaryCore.a1, BASE_TONES);

  const out = `// GENERATED FILE — do not hand-edit.
// Regenerate with: node apps/web/scripts/generate-theme-palette.cjs
// Source colors: primary ${PRIMARY_SEED} (Copperbelt Copper), tertiary ${TERTIARY_SEED} (Mosi Teal).
// See apps/web/scripts/generate-theme-palette.cjs for how and why.

$frnt-copper-palette: (
${sassMap(primary, '  ')}
  secondary: (
${sassMap(secondary, '    ')}
  ),
  neutral: (
${sassMap(neutral, '    ')}
  ),
  neutral-variant: (
${sassMap(neutralVariant, '    ')}
  ),
  error: (
${sassMap(ERROR_TONES, '    ')}
  ),
);

$frnt-teal-palette: (
${sassMap(tertiary, '  ')}
);
`;

  fs.writeFileSync(OUT_FILE, out);
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`  primary tone 40:  ${primary[40]}`);
  console.log(`  tertiary tone 40: ${tertiary[40]}`);
}

main();
