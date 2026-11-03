import test from 'node:test';
import assert from 'node:assert/strict';
import { signatureSvg } from './signature-svg.js';

test('signature SVG preserves separate rounded strokes at the storage canvas size', () => {
  const svg = signatureSvg([
    [{ x: 10, y: 20 }, { x: 40.5, y: 60 }],
    [{ x: 80, y: 90 }],
    [],
  ]);
  assert.match(svg, /width="1200" height="360" viewBox="0 0 1200 360"/);
  assert.match(svg, /d="M10\.0,20\.0 L40\.5,60\.0/);
  assert.match(svg, /stroke-linecap="round" stroke-linejoin="round"/);
  assert.match(svg, /d="M80\.0,90\.0 L80\.0,90\.0/);
  assert.equal((svg.match(/<path /g) || []).length, 2);
});

test('signature SVG bounds coordinates and accepts no markup from point values', () => {
  const svg = signatureSvg([[{ x: -3, y: 999 }, { x: Number.NaN, y: Number.POSITIVE_INFINITY }]]);
  assert.match(svg, /d="M0\.0,360\.0 L0\.0,0\.0/);
  assert.doesNotMatch(svg, /<script|onload=/i);
});
