/**
 * Fetches /icone.png and converts it to a base64 data: URL so the
 * PDF HTML can embed the logo without any network dependency
 * (works in blob: context, iOS WKWebView, iframe, etc.).
 */
let _cachedLogoDataUrl: string | null = null

export async function fetchLogoDataUrl(): Promise<string | null> {
  if (_cachedLogoDataUrl) return _cachedLogoDataUrl
  try {
    const res = await fetch('/icone.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        _cachedLogoDataUrl = result
        resolve(result)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
