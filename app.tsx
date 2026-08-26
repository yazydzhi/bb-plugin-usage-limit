import { definePluginApp } from "@get-bb/plugin-sdk/app";

const REFRESH_INTERVAL_MS = 60_000;
const ROOT_ATTRIBUTE = "data-bb-usage-limit";
const ROOT_SELECTOR = `[${ROOT_ATTRIBUTE}]`;

type UsageWindow = {
  label: string;
  usedPercent: number;
  resetsAt: string | null;
};

type UsageResponse = {
  providerId: string | null;
  providerLabel: string | null;
  status:
    | "ok"
    | "not_installed"
    | "unauthenticated"
    | "expired"
    | "error"
    | "unsupported";
  planLabel: string | null;
  accountEmail: string | null;
  windows: UsageWindow[];
  message: string | null;
};

/**
 * Single-line layout: the row must never wrap, or it pushes BB's composer
 * around. Everything that can grow is `min-width: 0` + ellipsis instead.
 */
const STYLES = `
[${ROOT_ATTRIBUTE}] {
  margin: 4px 15px 0;
  color: var(--muted-foreground, #667085);
  font-size: 11px;
  line-height: 18px;
}
[${ROOT_ATTRIBUTE}] .bb-ul-shell { display: flex; min-width: 0; align-items: center; gap: 8px; }
[${ROOT_ATTRIBUTE}][data-busy] .bb-ul-shell { opacity: 0.55; }
[${ROOT_ATTRIBUTE}] .bb-ul-provider { flex: none; max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted-foreground, #667085); font-weight: 600; }
[${ROOT_ATTRIBUTE}] .bb-ul-items { display: flex; min-width: 0; flex: 1; align-items: center; flex-wrap: nowrap; gap: 12px; overflow: hidden; }
[${ROOT_ATTRIBUTE}] .bb-ul-item { display: inline-flex; min-width: 0; align-items: center; gap: 6px; white-space: nowrap; }
[${ROOT_ATTRIBUTE}] .bb-ul-name { overflow: hidden; text-overflow: ellipsis; color: var(--muted-foreground, #667085); }
[${ROOT_ATTRIBUTE}] .bb-ul-track { display: block; flex: none; width: 34px; height: 4px; overflow: hidden; border-radius: 999px; background: var(--muted, #e5e7eb); }
[${ROOT_ATTRIBUTE}] .bb-ul-fill { display: block; height: 100%; border-radius: inherit; background: var(--primary, #6366f1); }
[${ROOT_ATTRIBUTE}] .bb-ul-fill[data-level="warning"] { background: var(--warning, #d97706); }
[${ROOT_ATTRIBUTE}] .bb-ul-fill[data-level="danger"] { background: var(--destructive, #dc2626); }
[${ROOT_ATTRIBUTE}] .bb-ul-percent { color: var(--foreground, #111827); font-weight: 600; font-variant-numeric: tabular-nums; }
[${ROOT_ATTRIBUTE}] .bb-ul-reset { overflow: hidden; text-overflow: ellipsis; }
[${ROOT_ATTRIBUTE}] .bb-ul-message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted-foreground, #667085); }
[${ROOT_ATTRIBUTE}] .bb-ul-email { flex: 0 1 auto; min-width: 0; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted-foreground, #667085); opacity: 0.85; }
[${ROOT_ATTRIBUTE}] .bb-ul-refresh { flex: none; width: 18px; height: 18px; margin: 0; padding: 0; border: 0; border-radius: 5px; color: var(--muted-foreground, #667085); background: transparent; cursor: pointer; font: inherit; opacity: 0; transition: opacity 0.12s ease; }
[${ROOT_ATTRIBUTE}] .bb-ul-shell:hover .bb-ul-refresh,
[${ROOT_ATTRIBUTE}] .bb-ul-refresh:focus-visible { opacity: 1; }
[${ROOT_ATTRIBUTE}] .bb-ul-refresh:hover { color: var(--foreground, #111827); background: var(--muted, #e5e7eb); }
`;

/** Host-daemon window labels, shortened for the one-line row. */
const WINDOW_LABELS: Record<string, string> = {
  "Current session": "세션",
  "Weekly limit": "주간",
  "Plan usage": "플랜",
  "On-demand spend": "추가 사용",
};

function windowLabel(label: string): string {
  return WINDOW_LABELS[label] ?? label;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function resetLabel(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const resetAt = new Date(resetsAt).getTime();
  if (Number.isNaN(resetAt)) return null;

  const minutes = Math.round((resetAt - Date.now()) / 60_000);
  if (minutes <= 0) return "곧 초기화";
  if (minutes < 60) return `${minutes}분 후 초기화`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0
      ? `${hours}시간 ${remainingMinutes}분 후 초기화`
      : `${hours}시간 후 초기화`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0
    ? `${days}일 ${remainingHours}시간 후 초기화`
    : `${days}일 후 초기화`;
}

function statusMessage(usage: UsageResponse): string {
  const provider = usage.providerLabel ?? "현재 공급자";
  switch (usage.status) {
    case "unauthenticated":
      return `${provider} 계정에 로그인해 주세요.`;
    case "expired":
      return `${provider} 로그인이 만료되었습니다.`;
    case "not_installed":
      return `${provider} CLI가 설치되어 있지 않습니다.`;
    case "error":
      return usage.message ?? "사용량 정보를 불러올 수 없습니다.";
    case "unsupported":
      return usage.message ?? "현재 공급자는 사용량 한도를 제공하지 않습니다.";
    default:
      return "표시할 구독 한도가 없습니다.";
  }
}

function makeElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

type RenderState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; usage: UsageResponse };

function render(
  roots: ReadonlySet<HTMLElement>,
  state: RenderState,
  busy: boolean,
  onRefresh: () => void,
) {
  for (const root of roots) {
    root.replaceChildren();
    root.toggleAttribute("data-busy", busy);
    const shell = makeElement("div", "bb-ul-shell");

    const ready = state.kind === "ready" ? state.usage : null;
    const hasWindows = ready?.status === "ok" && ready.windows.length > 0;
    if (hasWindows && ready.providerLabel) {
      const provider = makeElement("span", "bb-ul-provider");
      provider.textContent = ready.providerLabel;
      shell.append(provider);
    }

    const content = makeElement("div", "bb-ul-items");
    if (state.kind === "loading") {
      const message = makeElement("span", "bb-ul-message");
      message.textContent = "사용량 불러오는 중…";
      content.append(message);
    } else if (state.kind === "error") {
      const message = makeElement("span", "bb-ul-message");
      message.textContent = "사용량 정보를 불러올 수 없습니다.";
      content.append(message);
    } else if (!ready || !hasWindows) {
      const message = makeElement("span", "bb-ul-message");
      message.textContent = statusMessage(state.usage);
      content.append(message);
    } else {
      for (const window of ready.windows) {
        const percent = clampPercent(window.usedPercent);
        const item = makeElement("span", "bb-ul-item");
        item.title = [
          ready.providerLabel,
          ready.planLabel,
          window.label,
          `${Math.round(percent)}% 사용`,
          resetLabel(window.resetsAt),
        ]
          .filter(Boolean)
          .join(" · ");

        const name = makeElement("span", "bb-ul-name");
        name.textContent = windowLabel(window.label);
        const track = makeElement("span", "bb-ul-track");
        const fill = makeElement("span", "bb-ul-fill");
        fill.style.width = `${Math.max(percent, 3)}%`;
        fill.dataset.level =
          percent >= 95 ? "danger" : percent >= 80 ? "warning" : "normal";
        track.append(fill);
        const percentLabel = makeElement("span", "bb-ul-percent");
        percentLabel.textContent = `${Math.round(percent)}%`;

        item.append(name, track, percentLabel);
        content.append(item);
      }

      // One reset hint for the whole row: the window that resets soonest.
      const reset = resetLabel(soonestReset(ready.windows));
      if (reset) {
        const resetElement = makeElement("span", "bb-ul-reset");
        resetElement.textContent = `· ${reset}`;
        content.append(resetElement);
      }
    }

    // `.bb-ul-items` takes the free space, so the email sits at the right edge
    // with the usage windows on the left.
    let email: HTMLSpanElement | null = null;
    if (ready?.accountEmail) {
      email = makeElement("span", "bb-ul-email");
      email.textContent = ready.accountEmail;
      email.title = [ready.providerLabel, ready.planLabel, ready.accountEmail]
        .filter(Boolean)
        .join(" · ");
    }

    const refresh = makeElement("button", "bb-ul-refresh");
    refresh.type = "button";
    refresh.title = "사용량 새로 고침";
    refresh.setAttribute("aria-label", "사용량 새로 고침");
    refresh.textContent = "↻";
    refresh.addEventListener("click", () => onRefresh());
    shell.append(content, ...(email ? [email] : []), refresh);
    root.append(shell);
  }
}

function soonestReset(windows: readonly UsageWindow[]): string | null {
  let soonest: { at: number; iso: string } | null = null;
  for (const window of windows) {
    if (!window.resetsAt) continue;
    const at = new Date(window.resetsAt).getTime();
    if (Number.isNaN(at)) continue;
    if (!soonest || at < soonest.at) soonest = { at, iso: window.resetsAt };
  }
  return soonest?.iso ?? null;
}

function currentThreadId(): string | null {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const threadsIndex = segments.lastIndexOf("threads");
  const threadId = threadsIndex >= 0 ? segments[threadsIndex + 1] : null;
  return threadId?.startsWith("thr_") ? threadId : null;
}

function selectedProviderId(): string | null {
  const triggerTitle = document
    .querySelector<HTMLElement>(
      '[data-app-composer-role="primary"] button[aria-label^="Provider, model and reasoning"] span[title]',
    )
    ?.getAttribute("title");
  if (triggerTitle?.startsWith("Codex:")) return "codex";
  if (triggerTitle?.startsWith("Claude Code:")) return "claude-code";
  if (triggerTitle?.startsWith("Cursor:")) return "acp-cursor";
  return null;
}

async function fetchUsage(
  signal: AbortSignal,
  providerId: string | null,
  threadId: string | null,
): Promise<UsageResponse> {
  const response = await fetch("/api/v1/plugins/usage-limit/rpc/usage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId, threadId }),
    signal,
  });
  const body = (await response.json()) as { ok?: unknown; result?: unknown };
  if (!response.ok || body.ok !== true || !body.result) {
    throw new Error("usage RPC failed");
  }
  return body.result as UsageResponse;
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "composer-footer",
    mount({ signal }) {
      const style = document.createElement("style");
      style.textContent = STYLES;
      document.head.append(style);

      // A previous mount that was torn down without its dispose running (hot
      // reload, aborted signal) leaves orphan rows behind. Start from a clean
      // document so those never stack up with ours.
      for (const orphan of Array.from(
        document.querySelectorAll<HTMLElement>(ROOT_SELECTOR),
      )) {
        orphan.remove();
      }

      const roots = new Set<HTMLElement>();
      let state: RenderState = { kind: "loading" };
      let busy = false;
      let inFlight: AbortController | null = null;
      let displayedProviderId: string | null = null;
      let stopped = false;

      const paint = () => render(roots, state, busy, refresh);

      const attachRoots = () => {
        const footers = document.querySelectorAll<HTMLElement>(
          "[data-follow-up-composer-footer]",
        );
        const wanted = new Set<HTMLElement>();
        let changed = false;

        for (const footer of Array.from(footers)) {
          const sibling = footer.nextElementSibling;
          let root =
            sibling instanceof HTMLElement && sibling.matches(ROOT_SELECTOR)
              ? sibling
              : null;
          if (!root) {
            root = document.createElement("div");
            root.setAttribute(ROOT_ATTRIBUTE, "");
            root.setAttribute("aria-live", "polite");
            footer.insertAdjacentElement("afterend", root);
            changed = true;
          }
          wanted.add(root);
        }

        // A composer re-render can splice a node between the footer and our row,
        // which used to make the next pass mint a second row while the old one
        // stayed connected. Anything that is no longer a footer's direct sibling
        // is a leftover, so drop it instead of letting rows accumulate.
        for (const stray of Array.from(
          document.querySelectorAll<HTMLElement>(ROOT_SELECTOR),
        )) {
          if (!wanted.has(stray)) {
            stray.remove();
            changed = true;
          }
        }
        for (const root of roots) {
          if (!wanted.has(root)) {
            roots.delete(root);
            changed = true;
          }
        }
        for (const root of wanted) {
          if (!roots.has(root)) {
            roots.add(root);
            changed = true;
          }
        }
        if (changed) paint();
      };

      /** `silent` keeps the last reading on screen so the row does not flicker
       * back to a loading message on every poll. */
      const refresh = (options?: { silent?: boolean }) => {
        if (stopped) return;
        inFlight?.abort();
        const controller = new AbortController();
        const providerId = selectedProviderId();
        displayedProviderId = providerId;
        inFlight = controller;
        if (options?.silent && state.kind === "ready") {
          busy = true;
        } else {
          state = { kind: "loading" };
          busy = false;
        }
        paint();
        void fetchUsage(controller.signal, providerId, currentThreadId())
          .then((usage) => {
            if (!controller.signal.aborted) {
              state = { kind: "ready", usage };
              busy = false;
              paint();
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              state = { kind: "error" };
              busy = false;
              paint();
            }
          })
          .finally(() => {
            if (inFlight === controller) inFlight = null;
          });
      };

      const observe = () => {
        attachRoots();
        if (selectedProviderId() !== displayedProviderId) refresh();
      };
      // Our own render writes into the observed subtree, so coalesce callbacks
      // into one pass per frame instead of reacting to every mutation record.
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (stopped || scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(() => {
          scheduled = false;
          if (!stopped) observe();
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
      attachRoots();
      refresh();
      const interval = window.setInterval(
        () => refresh({ silent: true }),
        REFRESH_INTERVAL_MS,
      );

      let disposed = false;
      const dispose = () => {
        if (disposed) return;
        disposed = true;
        stopped = true;
        window.clearInterval(interval);
        observer.disconnect();
        inFlight?.abort();
        style.remove();
        for (const root of roots) root.remove();
        roots.clear();
      };
      signal.addEventListener("abort", dispose, { once: true });
      return dispose;
    },
  });
});
