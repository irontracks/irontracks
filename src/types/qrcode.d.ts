/**
 * Minimal type declaration for 'qrcode' package.
 * Overrides @types/qrcode which has an empty "main" field
 * that causes TypeScript resolution failures in CI (Node 20).
 */
declare module 'qrcode' {
  interface QRCodeToCanvasOptions {
    width?: number
    margin?: number
    color?: { dark?: string; light?: string }
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  }
  interface QRCodeToDataURLOptions {
    width?: number
    margin?: number
    color?: { dark?: string; light?: string }
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  }
  export function toCanvas(canvas: HTMLCanvasElement, text: string, options?: QRCodeToCanvasOptions): Promise<void>
  export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>
}
