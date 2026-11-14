import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const preferredPort = Number(process.env.PORT) || 3000;

async function availablePort(start) {
  for (let port = start; port < start + 100; port++) {
    const server = createServer();
    const free = await new Promise((resolve) => {
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error("No free port was found in the next 100 ports.");
}

async function runningAlbatross(start) {
  // Next.js holds one dev-server lock per project. Read its address first so
  // repeat launches reuse the actual Albatross server instead of guessing a
  // free port that Next.js will reject as a duplicate.
  try {
    const lock = JSON.parse(await readFile(join(root, ".next", "dev", "lock"), "utf8"));
    try {
      process.kill(lock.pid, 0);
    } catch (error) {
      if (error.code !== "EPERM") return null;
    }
    const base = lock.appUrl || `http://127.0.0.1:${lock.port || start}`;
    for (let attempt = 0; attempt < 24; attempt++) {
      try {
        // A static asset check avoids waiting for Next.js to compile `/` in dev.
        const response = await fetch(`${base}/albatross/favicon.svg`, { signal: AbortSignal.timeout(1200) });
        if (response.ok && (await response.text()).includes("<svg")) return lock.port || start;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } catch {}
  return null;
}

function openBrowser(url) {
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

const existingPort = await runningAlbatross(preferredPort);
if (existingPort) {
  const existingUrl = `http://127.0.0.1:${existingPort}`;
  console.log(`Albatross is already running at ${existingUrl}`);
  openBrowser(existingUrl);
  process.exit(0);
}

const port = await availablePort(preferredPort);
const url = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});

let browserOpened = false;
const startupDeadline = Date.now() + 120_000;
while (!browserOpened && Date.now() < startupDeadline) {
  if (child.exitCode !== null) process.exit(child.exitCode ?? 1);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      console.log(`Albatross is running at ${url}`);
      openBrowser(url);
      browserOpened = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}

if (!browserOpened) {
  child.kill();
  throw new Error("Next.js did not become ready within two minutes.");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
