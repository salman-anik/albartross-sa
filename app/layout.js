export const metadata = {
  title: "Albartross SA",
  description: "A lone albatross makes first contact with a strange place.",
  icons: { icon: "/albatross/favicon.svg" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Albartross SA",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0e1118",
};

const importMap = {
  imports: {
    three: "/albatross/vendor/three/build/three.module.js",
    "three/addons/": "/albatross/vendor/three/examples/jsm/",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <base href="/albatross/" />
        <link rel="stylesheet" href="/albatross/fonts/google.css" />
        <link rel="stylesheet" href="/albatross/style.css" />
        <link rel="apple-touch-icon" href="/app-icon.svg" />
        <script type="importmap" dangerouslySetInnerHTML={{ __html: JSON.stringify(importMap) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
