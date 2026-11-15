const SITE_URL = "https://albartross-sa.vercel.app";

export default function sitemap() {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
