import { ImageResponse } from 'next/og'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 72,
          background: '#0a0a0a',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 24,
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 38,
                fontWeight: 900,
                color: '#111111',
                letterSpacing: -2,
              }}
            >
              IT
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1 }}>
              IronTracks
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#a3a3a3', marginTop: 10 }}>
              Alta Performance
            </div>
          </div>
        </div>

        <div style={{ marginTop: 34, fontSize: 30, color: '#d4d4d4', fontWeight: 600 }}>
          Track your workouts and progress with IronTracks.
        </div>

        <div style={{ position: 'absolute', right: 72, bottom: 72, fontSize: 22, color: '#fbbf24', fontWeight: 900 }}>
          irontracks.com.br
        </div>
      </div>
    ),
    size,
  )
}
