import "./globals.css";

export const metadata = {
  title: "IronTracks - Alta Performance",
  description: "Track your workouts and progress with IronTracks.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IronTracks",
  },
  icons: {
    icon: [{ url: "/icone.png", type: "image/png" }],
    shortcut: ["/icone.png"],
    apple: [{ url: "/icone.png", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/icone.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icone.png" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(()=>{const ping=()=>{try{fetch('/api/auth/ping',{method:'GET',credentials:'include',cache:'no-store'}).catch(()=>{});}catch{}};document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')ping();});window.addEventListener('focus',ping);})();",
          }}
        />
      </head>
      <body
        className="antialiased bg-neutral-950 text-white"
      >
        {children}
      </body>
    </html>
  );
}
