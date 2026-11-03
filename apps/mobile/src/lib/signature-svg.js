/**
 * @typedef {{x: number, y: number}} SignaturePoint
 * @typedef {SignaturePoint[]} SignatureStroke
 */

/** @param {SignatureStroke[]} strokes */
export function signatureSvg(strokes) {
  const paths = strokes.filter(stroke => stroke.length > 0).map(stroke => {
    const [first, ...rest] = stroke;
    const points = [first, ...rest].map(point => ({
      x: Math.min(1200, Math.max(0, Number.isFinite(point.x) ? point.x : 0)),
      y: Math.min(360, Math.max(0, Number.isFinite(point.y) ? point.y : 0)),
    }));
    const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const dot = points.length === 1 ? `L${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}` : '';
    return `<path d="${d} ${dot}" fill="none" stroke="#17141a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360" viewBox="0 0 1200 360">${paths}</svg>`;
}
