export const metadata = {
  title: "Albartross SA",
  description: "Explore a quiet island world in a naturalistic albatross flight experience.",
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
  themeColor: "#172535",
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
        <meta name="google-site-verification" content="an8rV3cmmY3A4FEYYgX4TbErkZP5C_EiZTJ_-p4waC4" />
        <link rel="stylesheet" href="/albatross/fonts/google.css" />
        <link rel="stylesheet" href="/albatross/style.css" />
        <script type="importmap" dangerouslySetInnerHTML={{ __html: JSON.stringify(importMap) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
