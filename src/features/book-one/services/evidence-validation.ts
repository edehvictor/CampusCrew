export const evidenceLimit = 5 * 1024 * 1024;
export function evidenceMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  const ascii = (a: number, b: number) =>
    String.fromCharCode(...bytes.slice(a, b));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return "image/webp";
  if (bytes.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}
