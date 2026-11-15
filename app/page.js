"use client";

import { useEffect, useRef, useState } from "react";

export default function HomePage() {
  const host = useRef(null);
  const deferredInstall = useRef(null);
  const playedMobileSeconds = useRef(0);
  const [loadError, setLoadError] = useState("");
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installMessage, setInstallMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const liveScripts = [];
    let flightStarted = false;

    const isMobile = () => matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const wasInstalled = () => {
      try { return localStorage.getItem("albartross-installed") === "1"; } catch { return false; }
    };
    const onFlightStart = () => { flightStarted = true; };
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredInstall.current = event;
    };
    const onAppInstalled = () => {
      deferredInstall.current = null;
      setInstallAvailable(false);
      setInstallMessage("Albartross SA is installed and ready for offline play.");
      try { localStorage.setItem("albartross-installed", "1"); } catch {}
    };
    const playTimer = setInterval(() => {
      if (!flightStarted || !isMobile() || document.visibilityState !== "visible" || isInstalled() || wasInstalled()) return;
      playedMobileSeconds.current += 1;
      if (playedMobileSeconds.current >= 240) setInstallAvailable(true);
    }, 1000);
    window.addEventListener("albatross:flight-start", onFlightStart);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    async function mountExistingExperience() {
      try {
        if ("serviceWorker" in navigator) {
          try {
            await navigator.serviceWorker.register("/sw.js");
            await navigator.serviceWorker.ready;
          } catch {
            // The game still runs online if this browser does not support offline storage.
          }
        }
        const response = await fetch("/albatross/index.html", { cache: "no-store" });
        if (!response.ok) throw new Error(`The local game files returned ${response.status}.`);
        const html = await response.text();
        const documentFragment = new DOMParser().parseFromString(html, "text/html");
        if (cancelled || !host.current) return;

        host.current.innerHTML = documentFragment.body.innerHTML;
        document.title = "Albartross SA";

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
      clearInterval(playTimer);
      window.removeEventListener("albatross:flight-start", onFlightStart);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      for (const script of liveScripts) script.remove();
      host.current?.replaceChildren();
    };
  }, []);

  async function installApp() {
    if (typeof navigator.install === "function") {
      await navigator.install();
      return;
    }
    const event = deferredInstall.current;
    if (event) {
      deferredInstall.current = null;
      await event.prompt();
      const choice = await event.userChoice;
      if (choice?.outcome === "accepted") setInstallMessage("Installing Albartross SA for offline play…");
      return;
    }
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setInstallMessage(ios
      ? "To install for offline play, tap Share, then choose Add to Home Screen."
      : "Open your browser menu ⋮ and choose Install app or Add to Home Screen. The installed game can then open offline.");
  }

  return (
    <>
      <div ref={host} style={{ display: "contents" }} />
      {installAvailable ? (
        <aside id="offline-install-prompt" aria-live="polite">
          <button id="offline-install-button" type="button" onClick={installApp}>Install for offline play</button>
          {installMessage ? <p>{installMessage}</p> : null}
        </aside>
      ) : null}
      {loadError ? (
        <div role="alert" style={{ position: "fixed", inset: "1rem auto auto 1rem", zIndex: 1000, color: "#fff", background: "#5a2323", padding: "0.8rem 1rem", fontFamily: "system-ui, sans-serif" }}>
          Could not load Albatross: {loadError}
        </div>
      ) : null}
    </>
  );
}
