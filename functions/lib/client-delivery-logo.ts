/**
 * CODE Rx SOCIETY — the brand mark used by the client delivery pipeline.
 *
 * The mark is embedded here as a PNG rather than read from disk at delivery
 * time: workerd has no image decoder and no filesystem, the Pages asset binding
 * is not guaranteed on every route, and a delivery must never depend on a
 * network round trip to carry its branding. 96×96 keeps the header and the page
 * watermark crisp in print while staying small enough to inline.
 *
 * Source: `public/logo-small.png` (the same mark the portal itself uses),
 * resized to 96×96 and re-encoded as 8-bit RGBA.
 */

import { decodePng, type DecodedImage } from './client-delivery';

// prettier-ignore
const BRAND_MARK_PNG_BASE64 =
  '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' +
  'IijjkjDMO3NQAAAABJRU5ErkJggg==';

let cached: Promise<DecodedImage | null> | null = null;

/**
 * Decodes the brand mark once per isolate. A mark that somehow fails to decode
 * yields `null`: the wordmark, the metadata block and the footer are all drawn
 * as text, so the delivery stays branded and never falls back to the original.
 */
export const getBrandMark = (): Promise<DecodedImage | null> => {
  if (!cached) {
    cached = (async () => {
      try {
        const binary = atob(BRAND_MARK_PNG_BASE64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return await decodePng(bytes);
      } catch {
        return null;
      }
    })();
  }
  return cached;
};

/** Test seam: the raw bytes, so a test can assert the embedded mark is a PNG. */
export const brandMarkBytes = (): Uint8Array => {
  const binary = atob(BRAND_MARK_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};
