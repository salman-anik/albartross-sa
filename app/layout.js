export const metadata = {
  title: "The Albatross",
  description: "A lone albatross makes first contact with a strange place.",
  icons: { icon: "/albatross/favicon.svg" },
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
        <script type="importmap" dangerouslySetInnerHTML={{ __html: JSON.stringify(importMap) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
