import { createWorker } from 'tesseract.js';

export interface OcrVerificationParams {
  expectedHomeName: string;
  expectedAwayName: string;
  alternateHomeNames?: string[];
  alternateAwayNames?: string[];
  enteredHomeScore: number;
  enteredAwayScore: number;
}

export interface OcrVerificationResult {
  isVerified: boolean;
  homeNameMatched: boolean;
  awayNameMatched: boolean;
  scoreMatched: boolean;
  extractedText: string;
  detectedScoreText: string | null;
  feedbackMessage: string;
}

const LEFT_BANNER_MARKER = '<<<OCR_LEFT_BANNER_SECTION>>>';
const RIGHT_BANNER_MARKER = '<<<OCR_RIGHT_BANNER_SECTION>>>';
const HEADER_PASS_MARKER = '<<<OCR_HEADER_PASS_SECTION>>>';

/**
 * Loads an image File into an HTMLImageElement in browser memory.
 */
function loadImageElement(file: File): Promise<{ img: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        img,
        revoke: () => URL.revokeObjectURL(objectUrl)
      });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
    img.src = objectUrl;
  });
}

/**
 * Pre-processes the top header region (top 38% of screen containing player names & scoreboard)
 * in either standard high-contrast grayscale or inverted grayscale.
 */
function createHeaderPassCanvasDataUrl(
  img: HTMLImageElement,
  mode: 'standard' | 'inverted-contrast'
): string {
  const maxDim = 1800;
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  // Focus on the top 38% of the screen where player names and scoreboards live
  const cropHeight = Math.round(srcHeight * 0.38);

  let targetWidth = srcWidth;
  let targetHeight = cropHeight;

  if (targetWidth > maxDim || targetHeight > maxDim) {
    const scale = maxDim / Math.max(targetWidth, targetHeight);
    targetWidth = Math.round(targetWidth * scale);
    targetHeight = Math.round(targetHeight * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(img, 0, 0, srcWidth, cropHeight, 0, 0, targetWidth, targetHeight);

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;

    if (mode === 'standard') {
      const contrast = 1.35;
      gray = contrast * (gray - 128) + 128;
    } else {
      // Invert dark game header banners so bright white player names become crisp dark text on white background
      gray = 255 - gray;
      const contrast = 1.75;
      gray = contrast * (gray - 128) + 128;
    }

    const clamped = Math.max(0, Math.min(255, Math.round(gray)));
    data[i] = clamped;
    data[i + 1] = clamped;
    data[i + 2] = clamped;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Extracts a dedicated binary (black text on white background) 2x-upscaled canvas for a single
 * scoreboard digit box (left score or right score) in EA FC Mobile / eFootball screenshots.
 *
 * Uses height-relative coordinates anchored to horizontal center (w / 2) so it works
 * across 16:9, 18:9, 19.5:9, and 20:9 mobile screens, and filters for pure bright white
 * scoreboard pixels so colored annotations or dark stadium backgrounds are ignored.
 */
function createScoreDigitCropDataUrl(
  img: HTMLImageElement,
  side: 'left' | 'right'
): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const centerX = w / 2;

  // Main score digits sit between 0.052*h and 0.152*h from centerX, and vertically at 0.110*h..0.212*h
  const innerOffset = Math.round(h * 0.052);
  const outerOffset = Math.round(h * 0.152);

  const sx = side === 'left'
    ? Math.max(0, Math.round(centerX - outerOffset))
    : Math.min(w - 1, Math.round(centerX + innerOffset));
  const ex = side === 'left'
    ? Math.max(sx + 1, Math.round(centerX - innerOffset))
    : Math.min(w, Math.round(centerX + outerOffset));

  const sy = Math.max(0, Math.round(h * 0.110));
  const ey = Math.min(h, Math.round(h * 0.212));

  const cropW = Math.max(1, ex - sx);
  const cropH = Math.max(1, ey - sy);

  const scale = 2;
  const scaledW = cropW * scale;
  const scaledH = cropH * scale;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = scaledW;
  tempCanvas.height = scaledH;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return '';

  tempCtx.imageSmoothingEnabled = true;
  tempCtx.drawImage(img, sx, sy, cropW, cropH, 0, 0, scaledW, scaledH);
  const imgData = tempCtx.getImageData(0, 0, scaledW, scaledH);
  const d = imgData.data;

  let whitePixelCount = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturationDelta = maxC - minC;

    // Pure bright white scoreboard font pixel: high luminance + low color saturation
    const isBrightWhiteGlyph = r >= 180 && g >= 180 && b >= 180 && saturationDelta <= 48;
    if (isBrightWhiteGlyph) whitePixelCount++;

    const out = isBrightWhiteGlyph ? 0 : 255; // Black ink (0) on White paper (255)
    d[i] = out;
    d[i + 1] = out;
    d[i + 2] = out;
    d[i + 3] = 255;
  }

  if (whitePixelCount < 40) return '';

  tempCtx.putImageData(imgData, 0, 0);

  // Place into a generously padded white canvas
  const pad = 48;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = scaledW + pad * 2;
  outCanvas.height = scaledH + pad * 2;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return '';

  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(tempCanvas, pad, pad);

  return outCanvas.toDataURL('image/png');
}

/**
 * Extracts a dedicated binary canvas for the penalty shootout score inside parentheses, e.g. "(4)" or "(3)".
 * Only valid when the main regulation/extra-time score is a draw AND parentheses segments '(' + digit + ')' exist.
 */
function createPenaltyDigitCropDataUrl(
  img: HTMLImageElement,
  side: 'left' | 'right'
): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const centerX = w / 2;

  const innerOffset = Math.round(h * 0.155);
  const outerOffset = Math.round(h * 0.255);

  const sx = side === 'left'
    ? Math.max(0, Math.round(centerX - outerOffset))
    : Math.min(w - 1, Math.round(centerX + innerOffset));
  const ex = side === 'left'
    ? Math.max(sx + 1, Math.round(centerX - innerOffset))
    : Math.min(w, Math.round(centerX + outerOffset));

  const sy = Math.max(0, Math.round(h * 0.108));
  const ey = Math.min(h, Math.round(h * 0.188));

  const cropW = Math.max(1, ex - sx);
  const cropH = Math.max(1, ey - sy);

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = cropW;
  tempCanvas.height = cropH;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return '';

  tempCtx.drawImage(img, sx, sy, cropW, cropH, 0, 0, cropW, cropH);
  const imgData = tempCtx.getImageData(0, 0, cropW, cropH);
  const d = imgData.data;

  // Track vertical column ink counts to isolate '(' + digit(s) + ')'
  const colCounts = new Int32Array(cropW);

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const idx = (y * cropW + x) * 4;
      const r = d[idx];
      const g = d[idx + 1];
      const b = d[idx + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const saturationDelta = maxC - minC;

      const isBrightWhiteGlyph = r >= 185 && g >= 185 && b >= 185 && saturationDelta <= 45;
      if (isBrightWhiteGlyph) {
        colCounts[x]++;
      }

      const out = isBrightWhiteGlyph ? 0 : 255;
      d[idx] = out;
      d[idx + 1] = out;
      d[idx + 2] = out;
      d[idx + 3] = 255;
    }
  }

  // Group contiguous columns containing white glyph pixels into segments
  const segments: Array<{ startX: number; endX: number; totalPixels: number }> = [];
  let inSeg = false;
  let segStart = 0;
  let segPixels = 0;

  for (let x = 0; x < cropW; x++) {
    if (colCounts[x] >= 2) {
      if (!inSeg) {
        inSeg = true;
        segStart = x;
        segPixels = 0;
      }
      segPixels += colCounts[x];
    } else if (inSeg) {
      if (segPixels >= 8) {
        segments.push({ startX: segStart, endX: x - 1, totalPixels: segPixels });
      }
      inSeg = false;
    }
  }
  if (inSeg && segPixels >= 8) {
    segments.push({ startX: segStart, endX: cropW - 1, totalPixels: segPixels });
  }

  let innerStartX = 0;
  let innerEndX = cropW - 1;

  if (segments.length >= 3) {
    innerStartX = segments[1].startX;
    innerEndX = segments[segments.length - 2].endX;
  } else {
    const fallbackStartOffset = Math.round(h * 0.172);
    const fallbackEndOffset = Math.round(h * 0.214);
    const absStart = side === 'left'
      ? Math.max(sx, Math.round(centerX - fallbackEndOffset))
      : Math.max(sx, Math.round(centerX + fallbackStartOffset));
    const absEnd = side === 'left'
      ? Math.min(ex - 1, Math.round(centerX - fallbackStartOffset))
      : Math.min(ex - 1, Math.round(centerX + fallbackEndOffset));

    innerStartX = Math.max(0, absStart - sx);
    innerEndX = Math.min(cropW - 1, absEnd - sx);

    let innerWhitePixels = 0;
    for (let x = innerStartX; x <= innerEndX; x++) {
      innerWhitePixels += colCounts[x];
    }
    if (innerWhitePixels < 20) {
      return '';
    }
  }

  const innerW = Math.max(1, innerEndX - innerStartX + 1);
  tempCtx.putImageData(imgData, 0, 0);

  const pad = 36;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = innerW + pad * 2;
  outCanvas.height = cropH + pad * 2;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return '';

  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(tempCanvas, innerStartX, 0, innerW, cropH, pad, pad, innerW, cropH);

  return outCanvas.toDataURL('image/png');
}

/**
 * Normalizes a raw OCR string from a single-score-digit box into a valid integer score (if any).
 * Handles common scoreboard font confusions where wide '0' is read as 'O', 'o', 'Q', 'D', 'C'.
 */
function parseSingleScoreBoxText(raw: string): number | null {
  const cleaned = (raw || '')
    .trim()
    .replace(/[OoQDCU]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Zz]/g, '2')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8');

  const match = cleaned.match(/\b(\d{1,2})\b/) || cleaned.match(/(\d{1,2})/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (Number.isNaN(num) || num < 0 || num > 30) return null;
  return num;
}

/**
 * Helper to recognize a single cropped score digit image with PSM 6 and automatic fallback to PSM 8 / PSM 13.
 * (PSM 10 often drops bold angular digits like '4' in EA FC Mobile's scoreboard font, whereas PSM 6/8 read them cleanly.)
 */
async function recognizeScoreDigitWithFallback(worker: any, cropDataUrl: string): Promise<number | null> {
  if (!cropDataUrl) return null;

  for (const psm of ['6', '8', '13', '10']) {
    await worker.setParameters({
      tessedit_pageseg_mode: psm as any,
      tessedit_char_whitelist: '0123456789OoQDIl|'
    });
    const res = await worker.recognize(cropDataUrl);
    const parsed = parseSingleScoreBoxText(res?.data?.text || '');
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

/**
 * Creates a dedicated 3x-upscaled crop of the Left or Right player name banner at the top of the screen.
 * Stacks three complementary strips:
 * 1: Inverted high-contrast grayscale
 * 2: Smooth achromatic whiteness (min(R,G,B)) grayscale — cleanly eliminates pink/magenta/purple/blue/red neon banner backgrounds
 * 3: Crisp binary white-glyph threshold
 */
function createPlayerNameBannerCropDataUrl(
  img: HTMLImageElement,
  side: 'left' | 'right'
): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const centerX = w / 2;

  const innerOffset = Math.round(h * 0.135);
  const outerOffset = Math.round(h * 0.76);

  const sx = side === 'left'
    ? Math.max(0, Math.round(centerX - outerOffset))
    : Math.min(w - 1, Math.round(centerX + innerOffset));
  const ex = side === 'left'
    ? Math.max(sx + 1, Math.round(centerX - innerOffset))
    : Math.min(w, Math.round(centerX + outerOffset));

  const sy = 0;
  const ey = Math.min(h, Math.round(h * 0.105));

  const cropW = Math.max(1, ex - sx);
  const cropH = Math.max(1, ey - sy);

  const scale = 3;
  const scaledW = cropW * scale;
  const scaledH = cropH * scale;

  // Strip 1: Inverted high-contrast grayscale (3x upscaled)
  const strip1 = document.createElement('canvas');
  strip1.width = scaledW;
  strip1.height = scaledH;
  const ctx1 = strip1.getContext('2d');
  if (!ctx1) return '';
  ctx1.imageSmoothingEnabled = true;
  ctx1.drawImage(img, sx, sy, cropW, cropH, 0, 0, scaledW, scaledH);

  const imgData1 = ctx1.getImageData(0, 0, scaledW, scaledH);
  const d1 = imgData1.data;

  // Strip 2: Smooth achromatic whiteness (min(R,G,B)) isolation (removes neon pink/magenta/cyan diagonal banners)
  const strip2 = document.createElement('canvas');
  strip2.width = scaledW;
  strip2.height = scaledH;
  const ctx2 = strip2.getContext('2d');
  if (!ctx2) return '';
  const imgData2 = ctx2.createImageData(scaledW, scaledH);
  const d2 = imgData2.data;

  // Strip 3: Binary white-text isolation
  const strip3 = document.createElement('canvas');
  strip3.width = scaledW;
  strip3.height = scaledH;
  const ctx3 = strip3.getContext('2d');
  if (!ctx3) return '';
  const imgData3 = ctx3.createImageData(scaledW, scaledH);
  const d3 = imgData3.data;

  for (let i = 0; i < d1.length; i += 4) {
    const r = d1[i];
    const g = d1[i + 1];
    const b = d1[i + 2];

    // Strip 1 calculation: inverted high-contrast grayscale
    let invGray = 255 - (0.299 * r + 0.587 * g + 0.114 * b);
    invGray = 1.85 * (invGray - 128) + 128;
    const c1 = Math.max(0, Math.min(255, Math.round(invGray)));
    d1[i] = c1;
    d1[i + 1] = c1;
    d1[i + 2] = c1;
    d1[i + 3] = 255;

    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC;

    // Strip 2 calculation: smooth min(R,G,B) whiteness mapping (145..225 -> 255..0)
    let c2 = 255;
    if (minC >= 145 && sat <= 90) {
      const norm = Math.max(0, Math.min(1, (minC - 145) / (225 - 145)));
      c2 = Math.round(255 * (1 - norm));
    }
    d2[i] = c2;
    d2[i + 1] = c2;
    d2[i + 2] = c2;
    d2[i + 3] = 255;

    // Strip 3 calculation: crisp binary white-text threshold (tolerates anti-aliased pink/magenta edge bleed)
    const isWhiteText = minC >= 170 && sat <= 85;
    const c3 = isWhiteText ? 0 : 255;
    d3[i] = c3;
    d3[i + 1] = c3;
    d3[i + 2] = c3;
    d3[i + 3] = 255;
  }

  ctx1.putImageData(imgData1, 0, 0);
  ctx2.putImageData(imgData2, 0, 0);
  ctx3.putImageData(imgData3, 0, 0);

  const pad = 28;
  const gap = 32;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = scaledW + pad * 2;
  outCanvas.height = scaledH * 3 + gap * 2 + pad * 2;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return '';

  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(strip1, pad, pad);
  outCtx.drawImage(strip2, pad, pad + scaledH + gap);
  outCtx.drawImage(strip3, pad, pad + (scaledH + gap) * 2);

  return outCanvas.toDataURL('image/png');
}

/**
 * Runs local OCR on the selected screenshot file in the browser.
 * Performs:
 * 1) Dedicated 3x-upscaled Left & Right player name banner crops (for accurate mixed-case & stylized name detection)
 * 2) Top-header standard & inverted contrast passes (focused on top 38% of image, excluding bottom match stats noise)
 * 3) Dedicated 2x-upscaled left & right scoreboard digit crops with multi-PSM fallback
 * 4) Dedicated left & right penalty score crops (only when regulation score is tied)
 */
export async function extractTextFromMatchScreenshot(
  file: File,
  onProgress?: (progressPercent: number) => void
): Promise<string> {
  const { img, revoke } = await loadImageElement(file);

  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number' && onProgress) {
        onProgress(Math.min(95, Math.round(m.progress * 90)));
      }
    }
  });

  try {
    // Pass 1: Dedicated 3x-upscaled Left & Right Player Name Banners
    const leftBannerUrl = createPlayerNameBannerCropDataUrl(img, 'left');
    const rightBannerUrl = createPlayerNameBannerCropDataUrl(img, 'right');

    let leftBannerText = '';
    let rightBannerText = '';
    if (leftBannerUrl) {
      const lRes = await worker.recognize(leftBannerUrl);
      leftBannerText = lRes.data.text || '';
    }
    if (rightBannerUrl) {
      const rRes = await worker.recognize(rightBannerUrl);
      rightBannerText = rRes.data.text || '';
    }

    // Pass 2: Standard top-header pass (captures player names & scoreboard row without bottom match stats noise)
    const standardHeaderUrl = createHeaderPassCanvasDataUrl(img, 'standard');
    const firstPass = await worker.recognize(standardHeaderUrl);
    const firstText = firstPass.data.text || '';

    // Pass 3: High-contrast inverted top-header pass (captures white player names on dark/colored banners)
    const invertedHeaderUrl = createHeaderPassCanvasDataUrl(img, 'inverted-contrast');
    const secondPass = await worker.recognize(invertedHeaderUrl);
    const secondText = secondPass.data.text || '';

    // Pass 4: Dedicated Scoreboard Left & Right Main Digit Boxes (multi-PSM fallback)
    const leftCropUrl = createScoreDigitCropDataUrl(img, 'left');
    const rightCropUrl = createScoreDigitCropDataUrl(img, 'right');

    let scoreboardTag = '';
    let mainLeftScore: number | null = null;
    let mainRightScore: number | null = null;

    if (leftCropUrl && rightCropUrl) {
      mainLeftScore = await recognizeScoreDigitWithFallback(worker, leftCropUrl);
      mainRightScore = await recognizeScoreDigitWithFallback(worker, rightCropUrl);

      if (mainLeftScore !== null && mainRightScore !== null) {
        scoreboardTag = `[SCOREBOARD_CROPPED: ${mainLeftScore} - ${mainRightScore}]`;
      }
    }

    // Pass 5: Dedicated Penalty Shootout Left & Right Digit Boxes
    // A penalty shootout ONLY occurs when the main regulation/extra-time score is a draw (mainLeftScore === mainRightScore)
    let penaltyTag = '';
    const isRegulationDraw =
      mainLeftScore !== null && mainRightScore !== null && mainLeftScore === mainRightScore;

    if (isRegulationDraw) {
      const leftPenUrl = createPenaltyDigitCropDataUrl(img, 'left');
      const rightPenUrl = createPenaltyDigitCropDataUrl(img, 'right');

      if (leftPenUrl && rightPenUrl) {
        const leftPenScore = await recognizeScoreDigitWithFallback(worker, leftPenUrl);
        const rightPenScore = await recognizeScoreDigitWithFallback(worker, rightPenUrl);

        if (
          leftPenScore !== null &&
          rightPenScore !== null &&
          leftPenScore !== rightPenScore
        ) {
          penaltyTag = `[PENALTY_SCORE_CROPPED: ${leftPenScore} - ${rightPenScore}]`;
        }
      }
    }

    if (onProgress) onProgress(100);
    return [
      scoreboardTag,
      penaltyTag,
      LEFT_BANNER_MARKER,
      leftBannerText,
      RIGHT_BANNER_MARKER,
      rightBannerText,
      HEADER_PASS_MARKER,
      firstText,
      secondText
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
  } finally {
    revoke();
    await worker.terminate();
  }
}

/**
 * Normalizes stylized / fancy Unicode fonts commonly used in gamer tags
 * (e.g. Mathematical Bold/Italic/Sans-Serif "𝘎𝘈𝘔𝘌𝘙乂𝘚𝘏𝘜𝘝𝘖彡", Fullwidth, Small Caps,
 * Cyrillic/Greek lookalikes) into standard ASCII characters so OCR can match them accurately.
 */
const FANCY_UNICODE_LOOKALIKE_MAP: Record<string, string> = {
  // Small Caps & Latin extensions
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h',
  'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p',
  'ǫ': 'q', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
  'ł': 'l', 'Ł': 'l', 'ø': 'o', 'Ø': 'o', 'đ': 'd', 'Đ': 'd', 'ß': 'ss', 'æ': 'ae', 'Æ': 'ae',
  // Greek / Cyrillic / Symbol lookalikes often used in stylized gamer names
  'α': 'a', 'а': 'a', 'А': 'a', '∆': 'a', 'Δ': 'a', 'Λ': 'a',
  'в': 'b', 'В': 'b', 'β': 'b',
  'с': 'c', 'С': 'c', '¢': 'c',
  '∂': 'd', 'ԁ': 'd',
  'є': 'e', 'е': 'e', 'Е': 'e', 'Σ': 'e', '£': 'e',
  'ƒ': 'f',
  'ǥ': 'g',
  'н': 'h', 'Н': 'h', 'ћ': 'h',
  'і': 'i', 'І': 'i', 'ї': 'i', 'ι': 'i',
  'ј': 'j', 'Ј': 'j',
  'к': 'k', 'К': 'k', 'κ': 'k',
  'ℓ': 'l',
  'м': 'm', 'М': 'm',
  'и': 'n', 'й': 'n', 'η': 'n', 'П': 'n',
  'о': 'o', 'О': 'o', 'σ': 'o', 'θ': 'o', 'Θ': 'o',
  'р': 'p', 'Р': 'p', 'ρ': 'p',
  'я': 'r', 'Я': 'r', 'г': 'r',
  'ѕ': 's', 'Ѕ': 's', '$': 's',
  'т': 't', 'Т': 't', 'τ': 't',
  'υ': 'u', 'ц': 'u', 'µ': 'u',
  'ν': 'v', 'ѵ': 'v',
  'ω': 'w', 'ш': 'w', 'щ': 'w', 'Ш': 'w',
  'х': 'x', 'Х': 'x', 'χ': 'x', '×': 'x',
  'у': 'y', 'У': 'y', 'γ': 'y', '¥': 'y',
  'ž': 'z', 'Ž': 'z'
};

function normalizeFancyUnicodeToAscii(value: string): string {
  if (!value) return '';
  const decomposed = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  let out = '';
  for (const ch of decomposed) {
    out += FANCY_UNICODE_LOOKALIKE_MAP[ch] ?? ch;
  }
  return out;
}

function normalizeForStrictMatch(value: string): string {
  return normalizeFancyUnicodeToAscii(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompact(value: string): string {
  return normalizeFancyUnicodeToAscii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Normalizes ONLY true sans-serif vertical-bar homoglyphs ('l', 'I', '1', '|') -> 'i'
 * and '0' -> 'o' when comparing letter-based gamer tags (e.g. "AlFHA-WALID" vs "ALFHA-WALID").
 * IMPORTANT: Never converts digits 2..9 into letters (so "88" or "77" never matches "BB" or "TT").
 */
function normalizeHomoglyphChar(ch: string): string {
  const lower = ch.toLowerCase();
  if (lower === 'l' || lower === 'i' || lower === '1' || lower === '|') return 'i';
  if (lower === '0' || lower === 'o') return 'o';
  return lower;
}

function normalizeHomoglyphsCompact(value: string): string {
  const ascii = normalizeFancyUnicodeToAscii(value);
  let out = '';
  for (let i = 0; i < ascii.length; i++) {
    const ch = ascii[i];
    if (/[a-zA-Z0-9|]/.test(ch)) {
      const mapped = normalizeHomoglyphChar(ch);
      if (/[a-z0-9]/.test(mapped)) {
        out += mapped;
      }
    }
  }
  return out;
}

function computeEditDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = new Int32Array((m + 1) * (n + 1));
  for (let i = 0; i <= m; i++) dp[i * (n + 1)] = i;
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = dp[(i - 1) * (n + 1) + j] + 1;
      const ins = dp[i * (n + 1) + (j - 1)] + 1;
      const sub = dp[(i - 1) * (n + 1) + (j - 1)] + cost;
      dp[i * (n + 1) + j] = Math.min(del, ins, sub);
    }
  }
  return dp[m * (n + 1) + n];
}

function findFuzzyTokenInLine(
  lineHomoglyph: string,
  lineCompact: string,
  rawToken: string,
  startFrom: number
): { found: boolean; index: number; endIndex: number } {
  const isPureNumericToken = /^\d+$/.test(rawToken);
  if (isPureNumericToken) {
    // Pure number tokens (like "88" or "77" in "Player 88") MUST match exact digits, no fuzzy edit distance!
    const exactNumIdx = lineCompact.indexOf(rawToken, startFrom);
    if (exactNumIdx !== -1) {
      return { found: true, index: exactNumIdx, endIndex: exactNumIdx + rawToken.length };
    }
    return { found: false, index: -1, endIndex: -1 };
  }

  const homoToken = normalizeHomoglyphsCompact(rawToken);
  const exactIdx = lineHomoglyph.indexOf(homoToken, startFrom);
  if (exactIdx !== -1) {
    return { found: true, index: exactIdx, endIndex: exactIdx + homoToken.length };
  }

  // Allow at most 1 character OCR noise ONLY on alphabetic tokens of length >= 5
  const maxDist = homoToken.length >= 5 ? 1 : 0;
  if (maxDist <= 0 || lineHomoglyph.length < homoToken.length) {
    return { found: false, index: -1, endIndex: -1 };
  }

  for (let i = startFrom; i <= lineHomoglyph.length - homoToken.length; i++) {
    const sub = lineHomoglyph.slice(i, i + homoToken.length);
    if (sub[0] !== homoToken[0] && sub[sub.length - 1] !== homoToken[homoToken.length - 1]) {
      continue;
    }
    if (computeEditDistance(homoToken, sub) <= maxDist) {
      return { found: true, index: i, endIndex: i + homoToken.length };
    }
  }
  return { found: false, index: -1, endIndex: -1 };
}

/**
 * Strips internal OCR metadata tags and bottom match-stats noise lines so player names
 * are strictly verified only against valid top-banner / header lines.
 */
function extractCleanLinesForPlayerCheck(textBlock: string): string[] {
  const cleanedBlock = (textBlock || '')
    .replace(/\[SCOREBOARD_CROPPED:[^\]]*\]/g, '')
    .replace(/\[PENALTY_SCORE_CROPPED:[^\]]*\]/g, '')
    .replace(/\[LEFT_PLAYER_BANNER\]/gi, '')
    .replace(/\[RIGHT_PLAYER_BANNER\]/gi, '')
    .replaceAll(LEFT_BANNER_MARKER, '')
    .replaceAll(RIGHT_BANNER_MARKER, '')
    .replaceAll(HEADER_PASS_MARKER, '');

  const statsNoiseRegex = /\b(?:SHOTS|POSSESSION|PASS\s*ACCURACY|FOULS|OFFSIDES|MATCH\s*HIGHLIGHTS|ADD\s*FRIEND|CONTINUE)\b/i;

  return cleanedBlock
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && !statsNoiseRegex.test(l));
}

/**
 * Checks whether a single candidate player name matches on any single OCR line in `lines`.
 */
function checkCandidateOnLines(
  lines: string[],
  candidate: string
): { matched: boolean; lineIndex: number; charIndex: number } {
  const normCandidate = normalizeForStrictMatch(candidate);
  if (!normCandidate) return { matched: false, lineIndex: -1, charIndex: -1 };

  const compactCandidate = normalizeCompact(candidate);
  const homoglyphCandidate = normalizeHomoglyphsCompact(candidate);
  const asciiCandidate = normalizeFancyUnicodeToAscii(candidate);

  // Extract any pure numeric tokens (e.g. "88" in "Player 88") — these MUST match exact digits on the same line
  const numericTokens = asciiCandidate
    .split(/[^a-zA-Z0-9]+/)
    .filter((t) => /^\d+$/.test(t));

  const rawTokens = asciiCandidate
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const normLine = normalizeForStrictMatch(rawLine);
    const compactLine = normalizeCompact(rawLine);
    const homoLine = normalizeHomoglyphsCompact(rawLine);

    // If the candidate name contains pure numbers (like "88" or "77"), the line MUST contain those exact digits
    if (numericTokens.length > 0) {
      const allNumbersPresent = numericTokens.every((numTok) => compactLine.includes(numTok));
      if (!allNumbersPresent) {
        continue;
      }
    }

    // 1. Direct case-insensitive substring match on the line
    const directIdx = normLine.indexOf(normCandidate);
    if (directIdx !== -1) {
      return { matched: true, lineIndex: lineIdx, charIndex: directIdx };
    }

    // 2. Compact alphanumeric match on the line (ignores spaces, dots, underscores, hyphens)
    if (compactCandidate.length >= 3) {
      const compactIdx = compactLine.indexOf(compactCandidate);
      if (compactIdx !== -1) {
        return { matched: true, lineIndex: lineIdx, charIndex: compactIdx };
      }
    }

    // 3. Homoglyph-normalized compact match on the line (only when candidate has no pure numeric tokens or numbers already verified)
    if (homoglyphCandidate.length >= 3) {
      const homoIdx = homoLine.indexOf(homoglyphCandidate);
      if (homoIdx !== -1) {
        return { matched: true, lineIndex: lineIdx, charIndex: homoIdx };
      }
    }

    // 4. Multi-token in-order match on the SAME line (e.g. "M.H_Bashar", "YOUR.AYMAN", "ALFHA-WALID", "GAMER SHUVO")
    if (rawTokens.length >= 2) {
      let searchStart = 0;
      let firstIdx = -1;
      let allFound = true;

      for (const tok of rawTokens) {
        const res = findFuzzyTokenInLine(homoLine, compactLine, tok, searchStart);
        if (!res.found || (firstIdx !== -1 && res.index - searchStart > 6)) {
          allFound = false;
          break;
        }
        if (firstIdx === -1) firstIdx = res.index;
        searchStart = res.endIndex;
      }

      if (allFound && firstIdx !== -1) {
        return { matched: true, lineIndex: lineIdx, charIndex: firstIdx };
      }
    }

    // 5. Bounded single-line Levenshtein match for long names (>= 6 chars) without numeric tokens
    // Tolerates 1 char OCR noise on 6..9 char names (e.g. "vburAYMAN" -> "YOUR.AYMAN"), or 2 chars on >= 10 char names
    const targetLen = homoglyphCandidate.length;
    if (numericTokens.length === 0 && targetLen >= 6 && homoLine.length >= targetLen - 1) {
      const maxAllowedDist = targetLen >= 10 ? 2 : 1;
      const minWin = Math.max(5, targetLen - 1);
      const maxWin = Math.min(homoLine.length, targetLen + 1);

      for (let winLen = minWin; winLen <= maxWin; winLen++) {
        for (let i = 0; i <= homoLine.length - winLen; i++) {
          const sub = homoLine.slice(i, i + winLen);
          // Require at least the ending character or starting character to match
          if (
            sub[0] !== homoglyphCandidate[0] &&
            sub[sub.length - 1] !== homoglyphCandidate[targetLen - 1]
          ) {
            continue;
          }
          if (computeEditDistance(homoglyphCandidate, sub) <= maxAllowedDist) {
            return { matched: true, lineIndex: lineIdx, charIndex: i };
          }
        }
      }
    }
  }

  return { matched: false, lineIndex: -1, charIndex: -1 };
}

/**
 * Splits `extractedText` into Left Banner, Right Banner, and Header sections (if structured markers exist)
 * and checks whether a player name matches and on which side ('left' | 'right' | 'unknown').
 */
function checkStrictPlayerNameMatchWithSide(
  extractedText: string,
  primaryName: string,
  alternateNames: string[] = []
): { matched: boolean; side: 'left' | 'right' | 'unknown'; index: number } {
  const candidates = [primaryName, ...alternateNames]
    .map((n) => (n || '').trim())
    .filter((n) => n.length > 0);

  const leftIdx = extractedText.indexOf(LEFT_BANNER_MARKER);
  const rightIdx = extractedText.indexOf(RIGHT_BANNER_MARKER);
  const headerIdx = extractedText.indexOf(HEADER_PASS_MARKER);

  if (leftIdx !== -1 && rightIdx !== -1) {
    const leftBlock = extractedText.slice(leftIdx + LEFT_BANNER_MARKER.length, rightIdx);
    const rightBlock = headerIdx !== -1
      ? extractedText.slice(rightIdx + RIGHT_BANNER_MARKER.length, headerIdx)
      : extractedText.slice(rightIdx + RIGHT_BANNER_MARKER.length);
    const headerBlock = headerIdx !== -1
      ? extractedText.slice(headerIdx + HEADER_PASS_MARKER.length)
      : '';

    const leftLines = extractCleanLinesForPlayerCheck(leftBlock);
    const rightLines = extractCleanLinesForPlayerCheck(rightBlock);
    const headerLines = extractCleanLinesForPlayerCheck(headerBlock);

    for (const candidate of candidates) {
      const leftMatch = checkCandidateOnLines(leftLines, candidate);
      if (leftMatch.matched) {
        return { matched: true, side: 'left', index: 0 };
      }
      const rightMatch = checkCandidateOnLines(rightLines, candidate);
      if (rightMatch.matched) {
        return { matched: true, side: 'right', index: 1000 };
      }
      const headerMatch = checkCandidateOnLines(headerLines, candidate);
      if (headerMatch.matched) {
        // Determine left vs right by character position on the header line
        const lineLen = Math.max(1, (headerLines[headerMatch.lineIndex] || '').length);
        const side = headerMatch.charIndex <= lineLen / 2 ? 'left' : 'right';
        return {
          matched: true,
          side,
          index: side === 'left' ? headerMatch.charIndex : 1000 + headerMatch.charIndex
        };
      }
    }

    return { matched: false, side: 'unknown', index: -1 };
  }

  // Fallback for raw text without section markers
  const allCleanLines = extractCleanLinesForPlayerCheck(extractedText);
  for (const candidate of candidates) {
    const res = checkCandidateOnLines(allCleanLines, candidate);
    if (res.matched) {
      const lineLen = Math.max(1, (allCleanLines[res.lineIndex] || '').length);
      const side = res.charIndex <= lineLen / 2 ? 'left' : 'right';
      return {
        matched: true,
        side,
        index: res.lineIndex * 100 + res.charIndex
      };
    }
  }

  return { matched: false, side: 'unknown', index: -1 };
}

/**
 * Extracts scoreboard pairs from the OCR output.
 * Trusts `[SCOREBOARD_CROPPED: L - R]` as authoritative when present so noisy full-screen OCR
 * (where the middle EA FC triangular logo is often misread as '7' or '4') never pollutes the score.
 */
function extractCandidateScorePairs(extractedText: string): {
  pairs: Array<[number, number]>;
  mainPair: [number, number] | null;
  penaltyPair: [number, number] | null;
} {
  const pairs: Array<[number, number]> = [];
  let mainPair: [number, number] | null = null;
  let penaltyPair: [number, number] | null = null;

  const addPair = (l: number, r: number) => {
    if (!Number.isNaN(l) && !Number.isNaN(r) && l >= 0 && l <= 30 && r >= 0 && r <= 30) {
      if (!pairs.some(([pl, pr]) => pl === l && pr === r)) {
        pairs.push([l, r]);
      }
    }
  };

  // 1. Check dedicated cropped main scoreboard tag (authoritative!)
  const croppedMatch = extractedText.match(/\[SCOREBOARD_CROPPED:\s*(\d{1,2})\s*-\s*(\d{1,2})\]/);
  if (croppedMatch) {
    const l = parseInt(croppedMatch[1], 10);
    const r = parseInt(croppedMatch[2], 10);
    mainPair = [l, r];
    addPair(l, r);
  }

  // 2. Check dedicated cropped penalty score tag
  const penaltyMatch = extractedText.match(/\[PENALTY_SCORE_CROPPED:\s*(\d{1,2})\s*-\s*(\d{1,2})\]/);
  if (penaltyMatch) {
    const pl = parseInt(penaltyMatch[1], 10);
    const pr = parseInt(penaltyMatch[2], 10);
    if (!mainPair || mainPair[0] === mainPair[1]) {
      penaltyPair = [pl, pr];
    }
  }

  // If the dedicated scoreboard crop succeeded, return immediately without parsing noisy full-screen text
  if (mainPair) {
    return { pairs, mainPair, penaltyPair };
  }

  const normalizeDigitChar = (ch: string): number => {
    if (/[OoQDC]/.test(ch)) return 0;
    if (/[Il|]/.test(ch)) return 1;
    return parseInt(ch, 10);
  };

  // Filter out match statistics lines and banner sections
  const statKeywords = /SHOTS|POSSESSION|PASS|ACCURACY|FOULS|OFFSIDES|CORNERS|TACKLES|SAVES|HIGHLIGHTS|CONTINUE|FRIEND|VANGUARD|FALCON|%/i;
  const headerStartIdx = extractedText.indexOf(HEADER_PASS_MARKER);
  const textForScoreFallback = headerStartIdx !== -1
    ? extractedText.slice(headerStartIdx + HEADER_PASS_MARKER.length)
    : extractedText;

  const lines = textForScoreFallback
    .replace(/\[SCOREBOARD_CROPPED:[^\]]+\]/g, '')
    .replace(/\[PENALTY_SCORE_CROPPED:[^\]]+\]/g, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !statKeywords.test(l));

  for (const line of lines) {
    const lineWithoutTimer = line.replace(/\b(?:90|45|120)\s*:\s*\d{2}\b/g, ' ');

    // Check inline parenthesized penalty pattern: e.g. "(4) 1 - 1 (3)" (only valid if main scores are equal)
    const inlinePenRegex = /\((\d{1,2})\)\s*([0-9OoQD])\s*[-=7VvTtYy/]\s*([0-9OoQD])\s*\((\d{1,2})\)/g;
    let pm: RegExpExecArray | null;
    while ((pm = inlinePenRegex.exec(lineWithoutTimer)) !== null) {
      const penL = parseInt(pm[1], 10);
      const mainL = normalizeDigitChar(pm[2]);
      const mainR = normalizeDigitChar(pm[3]);
      const penR = parseInt(pm[4], 10);
      if (!mainPair) mainPair = [mainL, mainR];
      if (mainL === mainR && !penaltyPair) {
        penaltyPair = [penL, penR];
      }
      addPair(mainL, mainR);
    }

    // Unwrap wide oval '0' when Tesseract wraps it in parentheses/brackets like "(0)" or "[0]" next to the middle FC icon (e.g. "PSG 4 7 (0) FC Barcelona" -> "PSG 4 7 0 FC Barcelona")
    const lineNormalizedZero = lineWithoutTimer
      .replace(/[\(\[\{]\s*([0OoQD])\s*[\)\]\}]/g, ' 0 ')
      .replace(/\bLe\)/g, ' 0 ');

    // Compact 3-char token where the middle EA FC triangular icon is read as 7/V/v/T/Y/4/-/= between two scores:
    // e.g. "4 7 0", "1 7 1", "2 7 1", "O70", "0V0", "1 - 1"
    const fcCompactRegex = /(?:^|\s|\)|“|@)([0-9OoQDIl|])\s*[=74VvTtYy/-]\s*([0-9OoQDIl|])(?:\s|\(|$)/g;
    let m: RegExpExecArray | null;
    let matchedThreeTokenScoreLine = false;
    while ((m = fcCompactRegex.exec(lineNormalizedZero)) !== null) {
      const l = normalizeDigitChar(m[1]);
      const r = normalizeDigitChar(m[2]);
      if (!mainPair) mainPair = [l, r];
      addPair(l, r);
      matchedThreeTokenScoreLine = true;
    }

    if (!matchedThreeTokenScoreLine) {
      const spacedScoreRegex = /(?:^|\s|\))([0-9Oo])\s{1,8}([0-9Oo])(?:\s|\(|$)/g;
      while ((m = spacedScoreRegex.exec(lineNormalizedZero)) !== null) {
        const l = normalizeDigitChar(m[1]);
        const r = normalizeDigitChar(m[2]);
        if (!mainPair) mainPair = [l, r];
        addPair(l, r);
      }
    }
  }

  return { pairs, mainPair, penaltyPair };
}

function checkStrictScoreMatch(
  extractedText: string,
  homeScore: number,
  awayScore: number,
  homeSide: 'left' | 'right' | 'unknown',
  awaySide: 'left' | 'right' | 'unknown'
): { matched: boolean; detectedScoreText: string | null } {
  const h = Number(homeScore);
  const a = Number(awayScore);

  if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
    return { matched: false, detectedScoreText: null };
  }

  const { pairs: candidatePairs, penaltyPair } = extractCandidateScorePairs(extractedText);

  // Determine whether the Away player's name is on the Left and Home player's name is on the Right
  const isAwayListedFirst =
    (awaySide === 'left' && homeSide !== 'left') ||
    (homeSide === 'right' && awaySide !== 'right');

  // If the screenshot contains a Penalty Shootout score, ONLY accept the penalty score!
  if (penaltyPair) {
    const [penLeft, penRight] = penaltyPair;
    if (!isAwayListedFirst && penLeft === h && penRight === a) {
      return { matched: true, detectedScoreText: `${h} - ${a}` };
    }
    if (isAwayListedFirst && penLeft === a && penRight === h) {
      return { matched: true, detectedScoreText: `${h} - ${a}` };
    }
    if (homeSide === 'unknown' && awaySide === 'unknown' && ((penLeft === h && penRight === a) || (penLeft === a && penRight === h))) {
      return { matched: true, detectedScoreText: `${h} - ${a}` };
    }

    const [expectedPenH, expectedPenA] = isAwayListedFirst
      ? [penRight, penLeft]
      : [penLeft, penRight];
    return {
      matched: false,
      detectedScoreText: `${expectedPenH} - ${expectedPenA}`
    };
  }

  // Otherwise (no penalty score in screenshot), match against regular scoreboard pairs
  for (const [leftScore, rightScore] of candidatePairs) {
    if (!isAwayListedFirst && leftScore === h && rightScore === a) {
      return { matched: true, detectedScoreText: `${h} - ${a}` };
    }
    if (isAwayListedFirst && leftScore === a && rightScore === h) {
      return { matched: true, detectedScoreText: `${h} - ${a}` };
    }
    if (homeSide === 'unknown' && awaySide === 'unknown' && ((leftScore === h && rightScore === a) || (leftScore === a && rightScore === h))) {
      return { matched: true, detectedScoreText: `${h} - ${a}` };
    }
  }

  if (candidatePairs.length > 0) {
    const [firstLeft, firstRight] = candidatePairs[0];
    const displayDetected = isAwayListedFirst
      ? `${firstRight} - ${firstLeft}`
      : `${firstLeft} - ${firstRight}`;
    return { matched: false, detectedScoreText: displayDetected };
  }

  return { matched: false, detectedScoreText: null };
}

/**
 * Evaluates already-extracted OCR text against the match's expected player names and typed scores.
 * Requires strict exact match of BOTH player names (in distinct top banner positions) and the entered scoreline.
 */
export function evaluateMatchOcrVerification(
  extractedText: string,
  params: OcrVerificationParams
): OcrVerificationResult {
  if (!extractedText || !extractedText.trim()) {
    return {
      isVerified: false,
      homeNameMatched: false,
      awayNameMatched: false,
      scoreMatched: false,
      extractedText: '',
      detectedScoreText: null,
      feedbackMessage: 'No readable text was found in the screenshot. Please upload a clear match result screenshot.'
    };
  }

  const homeCheck = checkStrictPlayerNameMatchWithSide(
    extractedText,
    params.expectedHomeName,
    params.alternateHomeNames
  );

  const awayCheck = checkStrictPlayerNameMatchWithSide(
    extractedText,
    params.expectedAwayName,
    params.alternateAwayNames
  );

  const scoreCheck = checkStrictScoreMatch(
    extractedText,
    params.enteredHomeScore,
    params.enteredAwayScore,
    homeCheck.side,
    awayCheck.side
  );

  const isVerified = homeCheck.matched && awayCheck.matched && scoreCheck.matched;

  if (isVerified) {
    return {
      isVerified: true,
      homeNameMatched: true,
      awayNameMatched: true,
      scoreMatched: true,
      extractedText,
      detectedScoreText: scoreCheck.detectedScoreText,
      feedbackMessage: 'Screenshot verified! Both player names and match scores match 100%.'
    };
  }

  const missingParts: string[] = [];
  if (!homeCheck.matched) {
    missingParts.push(`Home player "${params.expectedHomeName}" not found`);
  }
  if (!awayCheck.matched) {
    missingParts.push(`Away player "${params.expectedAwayName}" not found`);
  }
  if (!scoreCheck.matched) {
    const scoreDetail = scoreCheck.detectedScoreText
      ? `Typed score (${params.enteredHomeScore} - ${params.enteredAwayScore}) does not match screenshot (${scoreCheck.detectedScoreText})`
      : `Typed score (${params.enteredHomeScore} - ${params.enteredAwayScore}) not found in screenshot`;
    missingParts.push(scoreDetail);
  }

  return {
    isVerified: false,
    homeNameMatched: homeCheck.matched,
    awayNameMatched: awayCheck.matched,
    scoreMatched: scoreCheck.matched,
    extractedText,
    detectedScoreText: scoreCheck.detectedScoreText,
    feedbackMessage: `Verification Failed: ${missingParts.join(' · ')}.`
  };
}
