/**
 * Dependency-free QR Code (Model 2) encoder — byte mode, error correction
 * level M, versions 1–40, automatic version selection and best-mask choice.
 *
 * The Class & Group Management module must be able to render invitation and
 * WhatsApp QR codes on a frozen offline cache with no third-party runtime, so
 * this is the module's own implementation of ISO/IEC 18004: the byte-mode bit
 * stream, Reed–Solomon error correction over GF(256), the function patterns,
 * the eight data masks with penalty scoring, and the BCH-protected format and
 * version information. The block/ecc tables below are the standard
 * (total codewords, error-correction codewords, RS block count) values for
 * level M; the encoder was differentially verified against an independent
 * reference implementation across versions 1–40.
 *
 * Only the module matrix is produced here — drawing (SVG/canvas/PNG) lives
 * with the UI so the encoder stays testable in plain Node.
 */

// Level-M tables (facts of the QR specification): [total codewords,
// error-correction codewords, Reed–Solomon block count] per version 1..40.
const TOTAL_CODEWORDS = [
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733,
  815, 901, 991, 1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051,
  2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
];
const ECC_CODEWORDS = [
  10, 16, 26, 36, 48, 64, 72, 88, 110, 130, 150, 176, 198, 216, 240, 280,
  308, 338, 364, 416, 442, 476, 504, 560, 588, 644, 700, 728, 784, 812, 868,
  924, 980, 1036, 1064, 1120, 1204, 1260, 1316, 1372,
];
const RS_BLOCKS = [
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10,
  11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33,
  35, 37, 38, 40, 43, 45, 47, 49,
];

// ---------------------------------------------------------------------------
// GF(256) arithmetic (field polynomial 0x11d) for Reed–Solomon
// ---------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

const gmul = (a: number, b: number): number =>
  a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];

/** Generator polynomial of the given degree, highest degree first. */
const rsGenerator = (degree: number): number[] => {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gmul(poly[j], 1);
      next[j + 1] ^= gmul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
};

/** Reed–Solomon remainder codewords for one data block. */
const rsEncode = (data: number[], generator: number[]): number[] => {
  const ecCount = generator.length - 1;
  const remainder = new Array<number>(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecCount; i++) remainder[i] ^= gmul(generator[i + 1], factor);
    }
  }
  return remainder;
};

// ---------------------------------------------------------------------------
// Bit buffer (MSB first)
// ---------------------------------------------------------------------------

class BitBuffer {
  bytes: number[] = [];
  private lengthBits = 0;
  put(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) this.putBit((value >>> i) & 1);
  }
  putBit(bit: number): void {
    const byteIndex = this.lengthBits >> 3;
    if (this.bytes.length <= byteIndex) this.bytes.push(0);
    if (bit) this.bytes[byteIndex] |= 0x80 >>> (this.lengthBits & 7);
    this.lengthBits++;
  }
  get length(): number {
    return this.lengthBits;
  }
}

// ---------------------------------------------------------------------------
// Matrix with reservation tracking
// ---------------------------------------------------------------------------

class ModuleMatrix {
  readonly size: number;
  readonly dark: boolean[][];
  private reserved: boolean[][];

  constructor(size: number) {
    this.size = size;
    this.dark = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    this.reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }
  set(row: number, col: number, value: boolean, isFunction = false): void {
    if (row < 0 || col < 0 || row >= this.size || col >= this.size) return;
    this.dark[row][col] = value;
    if (isFunction) this.reserved[row][col] = true;
  }
  isReserved(row: number, col: number): boolean {
    return this.reserved[row][col];
  }
  get(row: number, col: number): boolean {
    return this.dark[row][col];
  }
  xor(row: number, col: number, value: boolean): void {
    if (value) this.dark[row][col] = !this.dark[row][col];
  }
}

// Finder pattern centres (top-left, top-right, bottom-left).
const finderPositions = (size: number): Array<[number, number]> =>
  [[0, 0], [size - 7, 0], [0, size - 7]];

const setupFinderPattern = (matrix: ModuleMatrix): void => {
  const size = matrix.size;
  for (const [row, col] of finderPositions(size)) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || size <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || size <= col + c) continue;
        const isPattern =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        matrix.set(row + r, col + c, isPattern, true);
      }
    }
  }
};

const setupTimingPattern = (matrix: ModuleMatrix): void => {
  const size = matrix.size;
  for (let r = 8; r < size - 8; r++) {
    const value = r % 2 === 0;
    matrix.set(r, 6, value, true);
    matrix.set(6, r, value, true);
  }
};

/** Alignment pattern centre coordinates for the version. */
const alignmentCoords = (version: number): number[] => {
  if (version === 1) return [];
  const size = 17 + 4 * version;
  const count = Math.floor(version / 7) + 2;
  const interval = size === 145 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2;
  const positions = [size - 7];
  for (let i = 1; i < count - 1; i++) positions.push(positions[i - 1] - interval);
  positions.push(6);
  return positions.reverse();
};

const setupAlignmentPattern = (matrix: ModuleMatrix, version: number): void => {
  const coords = alignmentCoords(version);
  for (const row of coords) {
    for (const col of coords) {
      // The three finder corners never carry an alignment pattern.
      if ((row === 6 && col === 6) || (row === 6 && col === matrix.size - 7) || (row === matrix.size - 7 && col === 6)) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const isPattern = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
          matrix.set(row + r, col + c, isPattern, true);
        }
      }
    }
  }
};

// BCH(15,5) format information: G15 = 0b10100110111, XOR mask 0b101010000010010.
const G15 = 0x537;
const G15_MASK = 0x5412;

const formatBits = (maskPattern: number): number => {
  // Error-correction level M is the two-bit marker 00.
  const data = (0 << 3) | maskPattern;
  let d = data << 10;
  const bchDigit = (value: number): number => {
    let digit = 0;
    while (value !== 0) { digit++; value >>>= 1; }
    return digit;
  };
  while (bchDigit(d) - bchDigit(G15) >= 0) d ^= G15 << (bchDigit(d) - bchDigit(G15));
  return ((data << 10) | d) ^ G15_MASK;
};

const setupFormatInfo = (matrix: ModuleMatrix, maskPattern: number): void => {
  const size = matrix.size;
  const bits = formatBits(maskPattern);
  for (let i = 0; i < 15; i++) {
    const mod = ((bits >> i) & 1) === 1;
    // Vertical copy (left of the top-left finder, below it, then above the bottom-left finder).
    if (i < 6) matrix.set(i, 8, mod, true);
    else if (i < 8) matrix.set(i + 1, 8, mod, true);
    else matrix.set(size - 15 + i, 8, mod, true);
    // Horizontal copy (right of the top-left finder, then left of the top-right finder).
    if (i < 8) matrix.set(8, size - i - 1, mod, true);
    else if (i < 9) matrix.set(8, 15 - i - 1 + 1, mod, true);
    else matrix.set(8, 15 - i - 1, mod, true);
  }
  // The fixed dark module.
  matrix.set(size - 8, 8, true, true);
};

// BCH(18,6) version information for versions 7 and up.
const versionBits = (version: number): number => {
  const G18 = 0x1f25;
  let d = version << 12;
  const bchDigit = (value: number): number => {
    let digit = 0;
    while (value !== 0) { digit++; value >>>= 1; }
    return digit;
  };
  while (bchDigit(d) - bchDigit(G18) >= 0) d ^= G18 << (bchDigit(d) - bchDigit(G18));
  return (version << 12) | d;
};

const setupVersionInfo = (matrix: ModuleMatrix, version: number): void => {
  if (version < 7) return;
  const size = matrix.size;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const row = Math.floor(i / 3);
    const col = (i % 3) + size - 8 - 3;
    const mod = ((bits >> i) & 1) === 1;
    matrix.set(row, col, mod, true);
    matrix.set(col, row, mod, true);
  }
};

/** Zigzag placement of the codewords into the non-function modules. */
const placeData = (matrix: ModuleMatrix, codewords: number[], maskPattern: number): void => {
  const size = matrix.size;
  const maskValue = (row: number, col: number): boolean => {
    switch (maskPattern) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
      case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
      default: return (((row * col) % 3) + ((row + col) % 2)) % 2 === 0;
    }
  };
  let inc = -1;
  let row = size - 1;
  let bitIndex = 7;
  let byteIndex = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        if (!matrix.isReserved(row, col - c)) {
          let dark = false;
          if (byteIndex < codewords.length) dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
          if (maskValue(row, col - c)) dark = !dark;
          matrix.set(row, col - c, dark);
          bitIndex--;
          if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
        }
      }
      row += inc;
      if (row < 0 || size <= row) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Mask penalty scoring (the four ISO rules)
// ---------------------------------------------------------------------------

const penaltyN1 = (matrix: ModuleMatrix): number => {
  const size = matrix.size;
  let points = 0;
  for (let row = 0; row < size; row++) {
    let sameCol = 0;
    let sameRow = 0;
    let lastCol: boolean | null = null;
    let lastRow: boolean | null = null;
    for (let col = 0; col < size; col++) {
      const module = matrix.get(row, col);
      if (module === lastCol) sameCol++;
      else { if (sameCol >= 5) points += 3 + (sameCol - 5); lastCol = module; sameCol = 1; }
      const transposed = matrix.get(col, row);
      if (transposed === lastRow) sameRow++;
      else { if (sameRow >= 5) points += 3 + (sameRow - 5); lastRow = transposed; sameRow = 1; }
    }
    if (sameCol >= 5) points += 3 + (sameCol - 5);
    if (sameRow >= 5) points += 3 + (sameRow - 5);
  }
  return points;
};

const penaltyN2 = (matrix: ModuleMatrix): number => {
  const size = matrix.size;
  let points = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const sum =
        (matrix.get(row, col) ? 1 : 0) + (matrix.get(row, col + 1) ? 1 : 0) +
        (matrix.get(row + 1, col) ? 1 : 0) + (matrix.get(row + 1, col + 1) ? 1 : 0);
      if (sum === 4 || sum === 0) points++;
    }
  }
  return points * 3;
};

const penaltyN3 = (matrix: ModuleMatrix): number => {
  const size = matrix.size;
  let points = 0;
  for (let row = 0; row < size; row++) {
    let bitsCol = 0;
    let bitsRow = 0;
    for (let col = 0; col < size; col++) {
      bitsCol = ((bitsCol << 1) & 0x7ff) | (matrix.get(row, col) ? 1 : 0);
      if (col >= 10 && (bitsCol === 0x5d0 || bitsCol === 0x05d)) points++;
      bitsRow = ((bitsRow << 1) & 0x7ff) | (matrix.get(col, row) ? 1 : 0);
      if (col >= 10 && (bitsRow === 0x5d0 || bitsRow === 0x05d)) points++;
    }
  }
  return points * 40;
};

const penaltyN4 = (matrix: ModuleMatrix): number => {
  const size = matrix.size;
  let darkCount = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) darkCount += matrix.get(row, col) ? 1 : 0;
  }
  const total = size * size;
  const k = Math.abs(Math.ceil((darkCount * 100) / total / 5) - 10);
  return k * 10;
};

// ---------------------------------------------------------------------------
// Codeword assembly
// ---------------------------------------------------------------------------

const dataCodewordsFor = (version: number): number => TOTAL_CODEWORDS[version - 1] - ECC_CODEWORDS[version - 1];

const charCountBits = (version: number): number => (version < 10 ? 8 : 16);

const utf8Bytes = (text: string): number[] => {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
  // Ancient engines fall back to Latin-1; the app targets browsers with TextEncoder.
  return Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);
};

/** Build the interleaved data + error-correction codewords for the version. */
const buildCodewords = (version: number, payload: number[]): number[] => {
  const total = TOTAL_CODEWORDS[version - 1];
  const dataTotal = dataCodewordsFor(version);
  const buffer = new BitBuffer();
  buffer.put(0x4, 4); // byte mode
  buffer.put(payload.length, charCountBits(version));
  for (const byte of payload) buffer.put(byte, 8);

  const dataBits = dataTotal * 8;
  if (buffer.length + 4 <= dataBits) buffer.put(0, 4);
  while (buffer.length % 8 !== 0) buffer.putBit(0);
  const padBytes = (dataBits - buffer.length) / 8;
  for (let i = 0; i < padBytes; i++) buffer.put(i % 2 ? 0x11 : 0xec, 8);

  // Split into the specification's Reed–Solomon blocks and interleave.
  const blocks = RS_BLOCKS[version - 1];
  const ecCount = ECC_CODEWORDS[version - 1] / blocks;
  const blocksInGroup2 = total % blocks;
  const blocksInGroup1 = blocks - blocksInGroup2;
  const dataInGroup1 = Math.floor(dataTotal / blocks);
  const dataInGroup2 = dataInGroup1 + 1;

  const generator = rsGenerator(ecCount);
  const bufferBytes = buffer.bytes;
  const dcData: number[][] = [];
  const ecData: number[][] = [];
  let offset = 0;
  for (let b = 0; b < blocks; b++) {
    const size = b < blocksInGroup1 ? dataInGroup1 : dataInGroup2;
    const block = bufferBytes.slice(offset, offset + size);
    offset += size;
    dcData.push(block);
    ecData.push(rsEncode(block, generator));
  }

  const result: number[] = [];
  for (let i = 0; i < dataInGroup2; i++) {
    for (let b = 0; b < blocks; b++) {
      if (i < dcData[b].length) result.push(dcData[b][i]);
    }
  }
  for (let i = 0; i < ecCount; i++) {
    for (let b = 0; b < blocks; b++) result.push(ecData[b][i]);
  }
  return result;
};

export interface QrMatrix {
  /** Module size (size × size); dark[row][col]. Excludes the quiet zone. */
  size: number;
  version: number;
  mask: number;
  dark: boolean[][];
}

export const QR_EC_LEVEL = 'M';

/** Smallest version at level M that fits the byte payload, or null. */
export const qrVersionFor = (payloadLength: number): number | null => {
  for (let version = 1; version <= 40; version++) {
    const needed = 4 + charCountBits(version) + payloadLength * 8;
    if (needed <= dataCodewordsFor(version) * 8) return version;
  }
  return null;
};

/** Encode text into a QR Code module matrix (byte mode, level M, best mask). */
export const encodeQr = (text: string): QrMatrix => {
  if (!text) throw new Error('Nothing to encode.');
  const payload = utf8Bytes(text);
  const version = qrVersionFor(payload.length);
  if (!version) throw new Error('The text is too long for a QR code.');
  const size = 17 + 4 * version;

  const codewords = buildCodewords(version, payload);

  const buildForMask = (maskPattern: number): ModuleMatrix => {
    const matrix = new ModuleMatrix(size);
    setupFinderPattern(matrix);
    setupTimingPattern(matrix);
    setupAlignmentPattern(matrix, version);
    setupFormatInfo(matrix, 0); // dummy pass — reserves the format areas
    setupVersionInfo(matrix, version);
    placeData(matrix, codewords, maskPattern);
    return matrix;
  };

  let bestMask = 0;
  let lowestPenalty = Infinity;
  for (let maskPattern = 0; maskPattern < 8; maskPattern++) {
    const matrix = buildForMask(maskPattern);
    // The format bits depend on the mask and sit inside the penalty area, so
    // they are written for every candidate before scoring.
    setupFormatInfo(matrix, maskPattern);
    const penalty =
      penaltyN1(matrix) + penaltyN2(matrix) + penaltyN3(matrix) + penaltyN4(matrix);
    if (penalty < lowestPenalty) { lowestPenalty = penalty; bestMask = maskPattern; }
  }

  const matrix = buildForMask(bestMask);
  setupFormatInfo(matrix, bestMask);
  return { size, version, mask: bestMask, dark: matrix.dark };
};
