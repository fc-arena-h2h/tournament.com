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
 * Pre-processes the full image (or top half containing player names & scoreboard)
 * for accurate player name extraction.
 */
function createFullPassCanvasDataUrl(
  img: HTMLImageElement,
  mode: 'standard' | 'top-header-contrast'
): string {
  const maxDim = 1800;
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  // For top-header-contrast, we focus on the top 40% of the screen where player names and scoreboards live
  const cropHeight = mode === 'top-header-contrast' ? Math.round(srcHeight * 0.42) : srcHeight;

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
 * Extracts a dedicated binary (black text on white background) canvas for a single
 * scoreboard digit box (left score or right score) in EA FC Mobile / eFootball screenshots.
 *
 * Uses height-relative coordinates anchored to horizontal center (w / 2) so it works
 * across 16:9, 18:9, 19.5:9, and 20:9 mobile screens, and filters for pure bright white
 * scoreboard pixels so colored annotations (like red circles) or dark stadium backgrounds are ignored.
 */
function createScoreDigitCropDataUrl(
  img: HTMLImageElement,
  side: 'left' | 'right'
): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const centerX = w / 2;

  // Main score digits sit between 0.042*h and 0.155*h from centerX
  // (keeping clear of the outer penalty score parentheses at 0.16*h..0.25*h)
  const innerOffset = Math.round(h * 0.042);
  const outerOffset = Math.round(h * 0.155);

  const sx = side === 'left'
    ? Math.max(0, Math.round(centerX - outerOffset))
    : Math.min(w - 1, Math.round(centerX + innerOffset));
  const ex = side === 'left'
    ? Math.max(sx + 1, Math.round(centerX - innerOffset))
    : Math.min(w, Math.round(centerX + outerOffset));

  const sy = Math.max(0, Math.round(h * 0.085));
  const ey = Math.min(h, Math.round(h * 0.215));

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

  let whitePixelCount = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturationDelta = maxC - minC;

    // Pure bright white scoreboard font pixel: high luminance + low color saturation
    // (ignores red/colored pen circles and dark background)
    const isBrightWhiteGlyph = r >= 185 && g >= 185 && b >= 185 && saturationDelta <= 45;
    if (isBrightWhiteGlyph) whitePixelCount++;

    const out = isBrightWhiteGlyph ? 0 : 255; // Black ink (0) on White paper (255)
    d[i] = out;
    d[i + 1] = out;
    d[i + 2] = out;
    d[i + 3] = 255;
  }

  if (whitePixelCount < 15) return '';

  tempCtx.putImageData(imgData, 0, 0);

  // Place into a generously padded white canvas
  const pad = 36;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = cropW + pad * 2;
  outCanvas.height = cropH + pad * 2;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return '';

  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(tempCanvas, pad, pad);

  return outCanvas.toDataURL('image/png');
}

/**
 * Extracts a dedicated binary canvas for the penalty shootout score inside parentheses, e.g. "(4)" or "(3)".
 * In EA FC Mobile penalty results, penalty scores appear at [centerX - 0.25*h, centerX - 0.145*h] (left)
 * and [centerX + 0.145*h, centerX + 0.25*h] (right), y in [0.095*h, 0.185*h].
 *
 * Because the parentheses '(' and ')' hug the digit closely (causing raw OCR to misread "(3)" as "(€))" or "131"),
 * this function detects horizontal ink column segments:
 * - Requires at least 3 segments: '(' + digit(s) + ')'
 * - Strips the first segment '(' and last segment ')' so only the clean inner penalty digit(s) remain!
 */
function createPenaltyDigitCropDataUrl(
  img: HTMLImageElement,
  side: 'left' | 'right'
): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const centerX = w / 2;

  const innerOffset = Math.round(h * 0.145);
  const outerOffset = Math.round(h * 0.255);

  const sx = side === 'left'
    ? Math.max(0, Math.round(centerX - outerOffset))
    : Math.min(w - 1, Math.round(centerX + innerOffset));
  const ex = side === 'left'
    ? Math.max(sx + 1, Math.round(centerX - innerOffset))
    : Math.min(w, Math.round(centerX + outerOffset));

  const sy = Math.max(0, Math.round(h * 0.095));
  const ey = Math.min(h, Math.round(h * 0.185));

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

  // A parenthesized penalty score "(4)" or "(3)" typically has 3 segments: '(', digit(s), ')'
  // If parentheses touch the digit (1 or 2 segments), fall back to the inner digit window [0.170*h, 0.216*h]
  let innerStartX = 0;
  let innerEndX = cropW - 1;

  if (segments.length >= 3) {
    innerStartX = segments[1].startX;
    innerEndX = segments[segments.length - 2].endX;
  } else {
    // Fallback to exact inner window between '(' and ')' (0.170*h .. 0.216*h from centerX)
    const fallbackStartOffset = Math.round(h * 0.170);
    const fallbackEndOffset = Math.round(h * 0.216);
    const absStart = side === 'left'
      ? Math.max(sx, Math.round(centerX - fallbackEndOffset))
      : Math.max(sx, Math.round(centerX + fallbackStartOffset));
    const absEnd = side === 'left'
      ? Math.min(ex - 1, Math.round(centerX - fallbackStartOffset))
      : Math.min(ex - 1, Math.round(centerX + fallbackEndOffset));

    innerStartX = Math.max(0, absStart - sx);
    innerEndX = Math.min(cropW - 1, absEnd - sx);

    // Ensure there are actual white glyph pixels inside the inner window
    let innerWhitePixels = 0;
    for (let x = innerStartX; x <= innerEndX; x++) {
      innerWhitePixels += colCounts[x];
    }
    if (innerWhitePixels < 12) {
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
 * Runs local OCR on the selected screenshot file in the browser.
 * Performs:
 * 1) Dedicated left & right scoreboard digit crops (eliminating the middle FC logo & bottom match stats)
 * 2) Dedicated left & right penalty score crops (stripping parentheses around '(4)' and '(3)')
 * 3) Standard full-screen pass & top-header contrast pass for player names
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
    // Pass 1: Standard full image (captures player names and layout context)
    const standardDataUrl = createFullPassCanvasDataUrl(img, 'standard');
    const firstPass = await worker.recognize(standardDataUrl);
    const firstText = firstPass.data.text || '';

    // Pass 2: High-contrast top header (captures white player names on dark/colored banners)
    const headerDataUrl = createFullPassCanvasDataUrl(img, 'top-header-contrast');
    const secondPass = await worker.recognize(headerDataUrl);
    const secondText = secondPass.data.text || '';

    // Pass 3: Dedicated Scoreboard Left & Right Main Digit Boxes (PSM 10 / single token mode)
    const leftCropUrl = createScoreDigitCropDataUrl(img, 'left');
    const rightCropUrl = createScoreDigitCropDataUrl(img, 'right');

    await worker.setParameters({
      tessedit_pageseg_mode: '10' as any,
      tessedit_char_whitelist: '0123456789OoQD'
    });

    let scoreboardTag = '';
    if (leftCropUrl && rightCropUrl) {
      const leftRes = await worker.recognize(leftCropUrl);
      const rightRes = await worker.recognize(rightCropUrl);

      const leftScore = parseSingleScoreBoxText(leftRes.data.text);
      const rightScore = parseSingleScoreBoxText(rightRes.data.text);

      if (leftScore !== null && rightScore !== null) {
        scoreboardTag = `[SCOREBOARD_CROPPED: ${leftScore} - ${rightScore}]`;
      }
    }

    // Pass 4: Dedicated Penalty Shootout Left & Right Digit Boxes (inside parentheses '(4)' / '(3)')
    const leftPenUrl = createPenaltyDigitCropDataUrl(img, 'left');
    const rightPenUrl = createPenaltyDigitCropDataUrl(img, 'right');

    let penaltyTag = '';
    if (leftPenUrl && rightPenUrl) {
      await worker.setParameters({
        tessedit_pageseg_mode: '10' as any,
        tessedit_char_whitelist: '0123456789'
      });

      const leftPenRes = await worker.recognize(leftPenUrl);
      const rightPenRes = await worker.recognize(rightPenUrl);

      const leftPenScore = parseSingleScoreBoxText(leftPenRes.data.text);
      const rightPenScore = parseSingleScoreBoxText(rightPenRes.data.text);

      if (leftPenScore !== null && rightPenScore !== null) {
        penaltyTag = `[PENALTY_SCORE_CROPPED: ${leftPenScore} - ${rightPenScore}]`;
      }
    }

    if (onProgress) onProgress(100);
    return `${scoreboardTag}\n${penaltyTag}\n${firstText}\n${secondText}`.trim();
  } finally {
    revoke();
    await worker.terminate();
  }
}

function normalizeForStrictMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompact(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function checkStrictPlayerNameMatch(
  extractedText: string,
  primaryName: string,
  alternateNames: string[] = []
): { matched: boolean; index: number } {
  const candidates = [primaryName, ...alternateNames]
    .map((n) => (n || '').trim())
    .filter((n) => n.length > 0);

  const normalizedExtracted = normalizeForStrictMatch(extractedText);
  const compactExtracted = normalizeCompact(extractedText);

  for (const candidate of candidates) {
    const normCandidate = normalizeForStrictMatch(candidate);
    if (!normCandidate) continue;

    // 1. Direct exact substring match (normalized whitespace, case-insensitive)
    const directIdx = normalizedExtracted.indexOf(normCandidate);
    if (directIdx !== -1) {
      return { matched: true, index: directIdx };
    }

    // 2. Exact compact alphanumeric sequence match (in case OCR inserts/omits a space or underscore)
    const compactCandidate = normalizeCompact(candidate);
    if (compactCandidate.length >= 2) {
      const compactIdx = compactExtracted.indexOf(compactCandidate);
      if (compactIdx !== -1) {
        return { matched: true, index: compactIdx };
      }
    }
  }

  return { matched: false, index: -1 };
}

/**
 * Extracts scoreboard pairs from the OCR output.
 * If a penalty shootout score is present (e.g. [PENALTY_SCORE_CROPPED: 4 - 3] or "(4) 1 - 1 (3)"),
 * penaltyPair is returned and checkStrictScoreMatch will strictly require ONLY the penalty score.
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

  // 1. Check dedicated cropped main scoreboard tag
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
    penaltyPair = [pl, pr];
  }

  const normalizeDigitChar = (ch: string): number => {
    if (/[OoQDC]/.test(ch)) return 0;
    if (/[Il|]/.test(ch)) return 1;
    return parseInt(ch, 10);
  };

  // Filter out match statistics lines (SHOTS, POSSESSION, PASS ACCURACY, FOULS, OFFSIDES, etc.)
  const statKeywords = /SHOTS|POSSESSION|PASS|ACCURACY|FOULS|OFFSIDES|CORNERS|TACKLES|SAVES|HIGHLIGHTS|CONTINUE|FRIEND|%/i;
  const lines = extractedText
    .replace(/\[SCOREBOARD_CROPPED:[^\]]+\]/g, '')
    .replace(/\[PENALTY_SCORE_CROPPED:[^\]]+\]/g, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !statKeywords.test(l));

  for (const line of lines) {
    // Skip lines that are just the match timer like "90:00", "45:00", or "120:00"
    const lineWithoutTimer = line.replace(/\b(?:90|45|120)\s*:\s*\d{2}\b/g, ' ');

    // Check inline parenthesized penalty pattern: e.g. "(4) 1 - 1 (3)"
    const inlinePenRegex = /\((\d{1,2})\)\s*([0-9OoQD])\s*[-=7VvTtYy/]\s*([0-9OoQD])\s*\((\d{1,2})\)/g;
    let pm: RegExpExecArray | null;
    while ((pm = inlinePenRegex.exec(lineWithoutTimer)) !== null) {
      const penL = parseInt(pm[1], 10);
      const mainL = normalizeDigitChar(pm[2]);
      const mainR = normalizeDigitChar(pm[3]);
      const penR = parseInt(pm[4], 10);
      if (!penaltyPair) penaltyPair = [penL, penR];
      if (!mainPair) mainPair = [mainL, mainR];
    }

    // Compact 3-char token like "O70", "O7O", "0V0", "OV0", "070", "1 = 1", "1 - 1"
    const fcCompactRegex = /(?:^|\s|\)|“|@)([0-9OoQD])\s*[=7VvTtYy/-]\s*([0-9OoQD])(?:\s|\(|$)/g;
    let m: RegExpExecArray | null;
    while ((m = fcCompactRegex.exec(lineWithoutTimer)) !== null) {
      const l = normalizeDigitChar(m[1]);
      const r = normalizeDigitChar(m[2]);
      if (!mainPair) mainPair = [l, r];
      addPair(l, r);
    }

    // Two standalone score characters separated by spaces on the scoreboard line: e.g. "O   O" or "0   0" or "2   1"
    const spacedScoreRegex = /(?:^|\s|\))([0-9Oo])\s{1,8}([0-9Oo])(?:\s|\(|$)/g;
    while ((m = spacedScoreRegex.exec(lineWithoutTimer)) !== null) {
      const l = normalizeDigitChar(m[1]);
      const r = normalizeDigitChar(m[2]);
      if (!mainPair) mainPair = [l, r];
      addPair(l, r);
    }
  }

  return { pairs, mainPair, penaltyPair };
}

function checkStrictScoreMatch(
  extractedText: string,
  homeScore: number,
  awayScore: number,
  homeIndex: number,
  awayIndex: number
): { matched: boolean; detectedScoreText: string | null } {
  const h = Number(homeScore);
  const a = Number(awayScore);

  if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
    return { matched: false, detectedScoreText: null };
  }

  const { pairs: candidatePairs, penaltyPair } = extractCandidateScorePairs(extractedText);

  // Determine whether the Away player's name appears on the left side of the screenshot
  const isAwayListedFirst =
    homeIndex !== -1 && awayIndex !== -1 && awayIndex < homeIndex;

  // If the screenshot contains a Penalty Shootout score, ONLY accept the penalty score!
  if (penaltyPair) {
    const [penLeft, penRight] = penaltyPair;
    if (!isAwayListedFirst && penLeft === h && penRight === a) {
      return { matched: true, detectedScoreText: `${h} - ${a}` };
    }
    if (isAwayListedFirst && penLeft === a && penRight === h) {
      return { matched: true, detectedScoreText: `${h} - ${a}` };
    }
    if ((penLeft === h && penRight === a) || (penLeft === a && penRight === h)) {
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
    if ((leftScore === h && rightScore === a) || (leftScore === a && rightScore === h)) {
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
 * Requires strict exact match of BOTH player names and the entered scoreline.
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

  const homeCheck = checkStrictPlayerNameMatch(
    extractedText,
    params.expectedHomeName,
    params.alternateHomeNames
  );

  const awayCheck = checkStrictPlayerNameMatch(
    extractedText,
    params.expectedAwayName,
    params.alternateAwayNames
  );

  const scoreCheck = checkStrictScoreMatch(
    extractedText,
    params.enteredHomeScore,
    params.enteredAwayScore,
    homeCheck.index,
    awayCheck.index
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
