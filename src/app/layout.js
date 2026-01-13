import "./globals.css";
import DeployBadge from './_components/DeployBadge'

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
    icon: "/icone.png",
    apple: "/icone.png",
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
      <body
        className="antialiased bg-neutral-950 text-white"
      >
        {children}
        <DeployBadge />
      </body>
    </html>
  );
}
