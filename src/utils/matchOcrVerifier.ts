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

  // In EA FC Mobile, the center FC logo occupies roughly [centerX - 0.048*h, centerX + 0.048*h]
  // Left score digit sits in [centerX - 0.20*h, centerX - 0.048*h], y in [0.11*h, 0.215*h]
  // Right score digit sits in [centerX + 0.048*h, centerX + 0.20*h], y in [0.11*h, 0.215*h]
  const innerOffset = Math.round(h * 0.048);
  const outerOffset = Math.round(h * 0.20);

  const sx = side === 'left'
    ? Math.max(0, Math.round(centerX - outerOffset))
    : Math.min(w - 1, Math.round(centerX + innerOffset));
  const ex = side === 'left'
    ? Math.max(sx + 1, Math.round(centerX - innerOffset))
    : Math.min(w, Math.round(centerX + outerOffset));

  const sy = Math.max(0, Math.round(h * 0.11));
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

    const out = isBrightWhiteGlyph ? 0 : 255; // Black ink (0) on White paper (255)
    d[i] = out;
    d[i + 1] = out;
    d[i + 2] = out;
    d[i + 3] = 255;
  }

  tempCtx.putImageData(imgData, 0, 0);

  // Place into a generously padded white canvas scaled to an optimal OCR height (~90px glyph height)
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
 * 2) Standard full-screen pass & top-header contrast pass for player names
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

    // Pass 3: Dedicated Scoreboard Left & Right Digit Boxes (PSM 10 / single token mode)
    const leftCropUrl = createScoreDigitCropDataUrl(img, 'left');
    const rightCropUrl = createScoreDigitCropDataUrl(img, 'right');

    let scoreboardTag = '';
    if (leftCropUrl && rightCropUrl) {
      await worker.setParameters({
        tessedit_pageseg_mode: '10' as any,
        tessedit_char_whitelist: '0123456789OoQD'
      });

      const leftRes = await worker.recognize(leftCropUrl);
      const rightRes = await worker.recognize(rightCropUrl);

      const leftScore = parseSingleScoreBoxText(leftRes.data.text);
      const rightScore = parseSingleScoreBoxText(rightRes.data.text);

      if (leftScore !== null && rightScore !== null) {
        scoreboardTag = `[SCOREBOARD_CROPPED: ${leftScore} - ${rightScore}]`;
      }
    }

    if (onProgress) onProgress(100);
    return `${scoreboardTag}\n${firstText}\n${secondText}`.trim();
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
 * Extracts all candidate scoreboard pairs [leftScore, rightScore] from the OCR output,
 * prioritizing:
 * 1) Dedicated cropped scoreboard digits ([SCOREBOARD_CROPPED: X - Y])
 * 2) EA FC Mobile center logo pattern right above "90:00" / "45:00" / "120:00" (e.g. "O70", "0V0", "O V O", "2 7 1")
 *    where Tesseract reads the middle FC triangle shield as '7', 'V', 'v', 'T', or '/' and '0' as 'O'.
 * 3) Clean scoreboard lines in the header (excluding match stats lines like SHOTS, POSSESSION, PASS ACCURACY, FOULS, OFFSIDES).
 */
function extractCandidateScorePairs(extractedText: string): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const addPair = (l: number, r: number) => {
    if (!Number.isNaN(l) && !Number.isNaN(r) && l >= 0 && l <= 30 && r >= 0 && r <= 30) {
      if (!pairs.some(([pl, pr]) => pl === l && pr === r)) {
        pairs.push([l, r]);
      }
    }
  };

  // 1. Check dedicated cropped scoreboard tag first
  const croppedMatch = extractedText.match(/\[SCOREBOARD_CROPPED:\s*(\d{1,2})\s*-\s*(\d{1,2})\]/);
  if (croppedMatch) {
    addPair(parseInt(croppedMatch[1], 10), parseInt(croppedMatch[2], 10));
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
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !statKeywords.test(l));

  // 2. Look for EA FC Mobile scoreboard pattern where the middle FC shield is read as 7, V, v, T, Y, / or -
  //    e.g. "O70", "070", "O V O", "0 V 0", "O-O", "2 7 1", "1 V 0" on lines near club badges or above 90:00
  for (const line of lines) {
    // Skip lines that are just the match timer like "90:00" or "45:00"
    const lineWithoutTimer = line.replace(/\b(?:90|45|120)\s*:\s*\d{2}\b/g, ' ');

    // Compact 3-char token like "O70", "O7O", "0V0", "OV0", "070" where middle char is the FC triangle logo (7/V/v/T)
    const fcCompactRegex = /(?:^|\s|\))([0-9OoQD])\s*[7VvTtYy/-]\s*([0-9OoQD])(?:\s|\(|$)/g;
    let m: RegExpExecArray | null;
    while ((m = fcCompactRegex.exec(lineWithoutTimer)) !== null) {
      const l = normalizeDigitChar(m[1]);
      const r = normalizeDigitChar(m[2]);
      addPair(l, r);
    }

    // Two standalone score characters separated by spaces on the scoreboard line: e.g. "O   O" or "0   0" or "2   1"
    const spacedScoreRegex = /(?:^|\s|\))([0-9Oo])\s{1,8}([0-9Oo])(?:\s|\(|$)/g;
    while ((m = spacedScoreRegex.exec(lineWithoutTimer)) !== null) {
      const l = normalizeDigitChar(m[1]);
      const r = normalizeDigitChar(m[2]);
      addPair(l, r);
    }
  }

  return pairs;
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

  const candidatePairs = extractCandidateScorePairs(extractedText);

  // Determine whether the Away player's name appears on the left side of the screenshot
  const isAwayListedFirst =
    homeIndex !== -1 && awayIndex !== -1 && awayIndex < homeIndex;

  for (const [leftScore, rightScore] of candidatePairs) {
    if (!isAwayListedFirst && leftScore === h && rightScore === a) {
      return { matched: true, detectedScoreText: `${h} - ${a}` };
    }
    if (isAwayListedFirst && leftScore === a && rightScore === h) {
      return { matched: true, detectedScoreText: `${h} - ${a}` };
    }
    // Also allow matching if one of the names wasn't indexed yet or order is symmetric
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
