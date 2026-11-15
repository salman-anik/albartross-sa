export const metadata = {
  metadataBase: new URL("https://albartross-sa.vercel.app"),
  title: "Albartross SA — Free 3D Albatross Flight Game",
  description: "Play Albartross SA, a free 3D albatross flight game. Explore a living archipelago with islands, waterfalls, changing weather, wildlife, and a companion bird.",
  applicationName: "Albartross SA",
  alternates: { canonical: "/" },
  verification: {
    google: "an8rV3cmmY3A4FEYYgX4TbErkZP5C_EiZTJ_-p4waC4",
  },
  openGraph: {
    title: "Albartross SA — Free 3D Albatross Flight Game",
    description: "Fly as an albatross through a living archipelago of islands, waterfalls, weather, and wildlife.",
    url: "/",
    siteName: "Albartross SA",
    type: "website",
    images: [{ url: "/albatross/og.jpg", width: 1198, height: 630, alt: "An albatross flying over a misty island" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Albartross SA — Free 3D Albatross Flight Game",
    description: "Fly as an albatross through a living archipelago of islands, waterfalls, weather, and wildlife.",
    images: ["/albatross/og.jpg"],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
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

const websiteStructuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Albartross SA",
  alternateName: "Albatross SA",
  url: "https://albartross-sa.vercel.app/",
}).replace(/</g, "\\u003c");

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <base href="/albatross/" />
        <link rel="stylesheet" href="/albatross/fonts/google.css" />
        <link rel="stylesheet" href="/albatross/style.css" />
        <link rel="apple-touch-icon" href="/app-icon.svg" />
        <script type="importmap" dangerouslySetInnerHTML={{ __html: JSON.stringify(importMap) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: websiteStructuredData }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
