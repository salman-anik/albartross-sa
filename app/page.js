"use client";

import { useEffect, useRef, useState } from "react";

export default function HomePage() {
  const host = useRef(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const liveScripts = [];

    async function mountExistingExperience() {
      try {
        const response = await fetch("/albatross/index.html", { cache: "no-store" });
        if (!response.ok) throw new Error(`The local game files returned ${response.status}.`);
        const html = await response.text();
        const documentFragment = new DOMParser().parseFromString(html, "text/html");
        if (cancelled || !host.current) return;

        host.current.innerHTML = documentFragment.body.innerHTML;
        document.title = "The Albatross";

        const inertScripts = Array.from(host.current.querySelectorAll("script"));
        for (const inert of inertScripts) {
          if (cancelled) return;
          const script = document.createElement("script");
          for (const attribute of inert.attributes) {
            if (attribute.name === "src") continue;
            script.setAttribute(attribute.name, attribute.value);
          }
          const source = inert.getAttribute("src");
          if (source) {
            script.src = new URL(source, `${window.location.origin}/albatross/`).href;
            script.async = false;
          } else {
            script.textContent = inert.textContent;
          }
          inert.remove();
          document.body.appendChild(script);
          liveScripts.push(script);
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      }
    }

    mountExistingExperience();
    return () => {
      cancelled = true;
      for (const script of liveScripts) script.remove();
      host.current?.replaceChildren();
    };
  }, []);

  return (
    <>
      <div ref={host} style={{ display: "contents" }} />
      {loadError ? (
        <div role="alert" style={{ position: "fixed", inset: "1rem auto auto 1rem", zIndex: 1000, color: "#fff", background: "#5a2323", padding: "0.8rem 1rem", fontFamily: "system-ui, sans-serif" }}>
          Could not load Albatross: {loadError}
        </div>
      ) : null}
    </>
  );
}
