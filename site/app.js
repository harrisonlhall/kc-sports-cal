const teamsEl = document.querySelector("#teams");
const toggleAll = document.querySelector("#toggle-all");
const webcal = document.querySelector("#webcal");
const copyButton = document.querySelector("#copy");
const urlEl = document.querySelector("#url");

const state = { teams: [], status: {}, selected: new Set() };

function baseHref() {
  const url = new URL(window.location.href);
  let path = url.pathname;
  if (path.endsWith("/index.html")) path = path.slice(0, -"/index.html".length);
  if (!path.endsWith("/")) path += "/";
  return `${url.origin}${path}`;
}

function feedPath() {
  const keys = state.teams.map((team) => team.key);
  const ordered = keys.filter((key) => state.selected.has(key));
  if (!ordered.length) return null;
  if (ordered.length === keys.length) return "calendar.ics";
  if (ordered.length === 1) return `teams/${ordered[0]}.ics`;
  return `feeds/${ordered.join("_")}.ics`;
}

function absolute(relative) {
  return new URL(relative, baseHref()).href;
}

function statusLine(team) {
  const entry = state.status.teams?.[team.key];
  if (!entry) return team.league;
  if (entry.upcoming > 0 && entry.next) {
    const when = new Date(entry.next).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const saved = entry.stale ? " · saved schedule" : "";
    return `${entry.upcoming} upcoming · ${when}${saved}`;
  }
  return "Schedule not published yet";
}

function render() {
  teamsEl.replaceChildren(
    ...state.teams.map((team) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "team";
      button.style.setProperty("--team", team.color);
      button.setAttribute("aria-pressed", String(state.selected.has(team.key)));
      button.innerHTML = `<span class="emoji" aria-hidden="true"></span><span><strong></strong><small></small></span><span class="mark" aria-hidden="true"></span>`;
      button.querySelector(".emoji").textContent = team.emoji;
      button.querySelector("strong").textContent = team.short;
      button.querySelector("small").textContent = statusLine(team);
      button.addEventListener("click", () => {
        if (state.selected.has(team.key)) state.selected.delete(team.key);
        else state.selected.add(team.key);
        render();
      });
      return button;
    }),
  );

  const allOn = state.selected.size === state.teams.length;
  toggleAll.textContent = allOn ? "Clear all" : "Select all";
  const relative = feedPath();
  const httpsUrl = relative ? absolute(relative) : "";
  urlEl.textContent = httpsUrl || "Select at least one team";
  if (httpsUrl) {
    webcal.href = httpsUrl.replace(/^https?:\/\//, "webcal://");
    webcal.removeAttribute("aria-disabled");
    copyButton.disabled = false;
  } else {
    webcal.href = "#";
    webcal.setAttribute("aria-disabled", "true");
    copyButton.disabled = true;
  }
}

toggleAll.addEventListener("click", () => {
  if (state.selected.size === state.teams.length) state.selected.clear();
  else state.teams.forEach((team) => state.selected.add(team.key));
  render();
});

function copyWithFallback(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

copyButton.addEventListener("click", async () => {
  const relative = feedPath();
  if (!relative) return;
  const text = absolute(relative);
  const write = navigator.clipboard?.writeText(text).catch(() => null);
  if (write) {
    await Promise.race([write, new Promise((resolve) => setTimeout(resolve, 400))]);
  }
  try {
    copyWithFallback(text);
  } catch {
    /* The label still confirms the click when the browser blocks the clipboard. */
  }
  copyButton.textContent = "Copied";
  setTimeout(() => {
    copyButton.textContent = "Copy feed URL";
  }, 2500);
});

async function load() {
  const [teamsResponse, statusResponse] = await Promise.all([
    fetch("teams.json"),
    fetch("status.json").catch(() => null),
  ]);
  state.teams = await teamsResponse.json();
  state.teams.forEach((team) => state.selected.add(team.key));
  if (statusResponse?.ok) state.status = await statusResponse.json();
  render();
}

load().catch(() => {
  teamsEl.textContent = "The team list could not be loaded.";
});
