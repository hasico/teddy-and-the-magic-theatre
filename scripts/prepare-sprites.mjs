// One-off sprite prep for the Act I vertical slice (tech-spec Decision 23).
// Crops Teddy and Ogonyok out of the local artbook model sheets
// (artbook/*.png — not in git) and removes the cream paper background with
// luminance/colour-distance alpha masking, NOT a binary colour key:
//   1. estimate the paper colour from the crop's border band;
//   2. flood-fill "paper-like" pixels from the borders (connectivity keeps
//      light interior art opaque while removing the textured ground);
//   3. soft alpha ramp over the transition ring + colour unmixing (despill)
//      so no cream halo survives on the dark Act I stage;
//   4. drop the hatched cast shadow together with the ground.
// Run once: `node scripts/prepare-sprites.mjs`; commit the PNG results.
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');

// Crop regions verified against the sheets (code-research.md §3):
// Teddy = top-left front-facing standing pose, Ogonyok = top-left idle glow.
const SPRITES = [
  {
    name: 'teddy',
    // Wide enough that the right ear clears the frame (it was clipped at 240px).
    src: 'artbook/character-art-teddy.png',
    region: { left: 185, top: 40, width: 275, height: 430 },
    // The scribbled cast shadow between/under the feet tints the paper well
    // past the normal threshold, leaving a cream patch. Inside the bottom
    // strip classify far more aggressively: measured distances put the hatch
    // and tinted paper at <=170 from the paper tone while the brown fur
    // itself sits around 180. The head/torso keep the safe global threshold
    // so light knit highlights there can never go translucent.
    aggressiveBelowY: 300,
    aggressiveEdgeFull: 170,
  },
  {
    name: 'ogonek',
    src: 'artbook/character-art-ogonek.png',
    region: { left: 70, top: 140, width: 220, height: 220 },
  },
];

// Colour-distance thresholds (RGB units). Below EDGE_START the pixel is
// definitely paper; above EDGE_FULL it is definitely art; between them the
// alpha ramps smoothly — that ramp is what preserves Ogonyok's feathered glow.
const EDGE_START = 25;
const EDGE_FULL = 110;
// Enclosed paper pockets (between the teddy's legs, under ribbon tails) are
// unreachable from the border flood fill; anything unvisited but still this
// close to the paper colour is such a pocket and gets cut too. Real art is
// never this close to the paper tone.
const HOLE_MAX = 60;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/** Average colour of an 8px border band = the paper the art sits on. */
function estimatePaperColour(data, width, height, channels) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const band = 8;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= band && x < width - band && y >= band && y < height - band) continue;
      const i = (y * width + x) * channels;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  }
  return [r / count, g / count, b / count];
}

function colourDistance(data, i, paper) {
  const dr = data[i] - paper[0];
  const dg = data[i + 1] - paper[1];
  const db = data[i + 2] - paper[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Removes the paper background and writes an RGBA PNG buffer.
 * Returns edge-alpha stats so the caller can verify the soft edge survived.
 */
async function cutSprite({ src, region, aggressiveBelowY, aggressiveEdgeFull }) {
  const { data, info } = await sharp(path.join(ROOT, src))
    .extract(region)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const paper = estimatePaperColour(data, width, height, channels);

  // Per-pixel "definitely art" threshold: the optional aggressive zone
  // (bottom strip) treats shadow-tinted paper as background.
  const edgeFullAt = (p) => {
    if (aggressiveBelowY === undefined || aggressiveEdgeFull === undefined) return EDGE_FULL;
    return Math.floor(p / width) >= aggressiveBelowY ? aggressiveEdgeFull : EDGE_FULL;
  };

  // Flood fill from every border pixel whose colour is close to the paper.
  // The fill may creep into the slightly-darker transition ring, but never
  // into art (interior light pixels are not connected to the border).
  const isPaperish = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    isPaperish[p] = colourDistance(data, p * channels, paper) < edgeFullAt(p) ? 1 : 0;
  }
  const visited = new Uint8Array(width * height);
  const stack = [];
  const pushIfPaperish = (x, y) => {
    const p = y * width + x;
    if (!visited[p] && isPaperish[p]) {
      visited[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    pushIfPaperish(x, 0);
    pushIfPaperish(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfPaperish(0, y);
    pushIfPaperish(width - 1, y);
  }
  while (stack.length > 0) {
    const p = stack.pop();
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) pushIfPaperish(x - 1, y);
    if (x < width - 1) pushIfPaperish(x + 1, y);
    if (y > 0) pushIfPaperish(x, y - 1);
    if (y < height - 1) pushIfPaperish(x, y + 1);
  }

  const rgba = Buffer.allocUnsafe(width * height * 4);
  let partialEdgePixels = 0;
  let holePixels = 0;
  for (let p = 0; p < width * height; p++) {
    const i = p * channels;
    const o = p * 4;
    const dist = colourDistance(data, i, paper);
    const edgeFull = edgeFullAt(p);
    let alpha = 1;
    if (!visited[p] && dist < HOLE_MAX) {
      holePixels += 1; // enclosed paper pocket — cut it
      alpha = 0;
    } else if (visited[p]) {
      alpha = clamp01((dist - EDGE_START) / (edgeFull - EDGE_START));
      if (alpha > 0 && alpha < 1) partialEdgePixels += 1;
    }
    // Colour unmixing: subtract the paper's contribution from semi-transparent
    // pixels so the composited edge does not glow cream on the dark stage.
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (alpha > 0 && alpha < 1) {
      r = (r - paper[0] * (1 - alpha)) / alpha;
      g = (g - paper[1] * (1 - alpha)) / alpha;
      b = (b - paper[2] * (1 - alpha)) / alpha;
    }
    rgba[o] = Math.max(0, Math.min(255, Math.round(r)));
    rgba[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
    rgba[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
    rgba[o + 3] = Math.round(alpha * 255);
  }

  const png = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  return { png, width, height, paper, partialEdgePixels, holePixels };
}

const outDir = path.join(ROOT, 'public', 'assets');
await mkdir(outDir, { recursive: true });

for (const sprite of SPRITES) {
  const { png, width, height, paper, partialEdgePixels, holePixels } = await cutSprite(sprite);
  const out = path.join(outDir, `${sprite.name}.png`);
  await sharp(png).toFile(out);
  const { size } = await stat(out);
  console.log(
    `${sprite.name}.png: ${width}x${height}, ${(size / 1024).toFixed(1)} KB, ` +
      `paper≈rgb(${paper.map((c) => Math.round(c)).join(',')}), ` +
      `${partialEdgePixels} soft-edge pixels, ${holePixels} hole pixels`,
  );
}
console.log('done');
