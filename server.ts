import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  getMessages,
  LOCALE_OPTIONS,
  resolveLocale,
  statusMessage as localizedStatusMessage,
} from "./lib/i18n";

const usageWindowSchema = z
  .object({
    label: z.string(),
    usedPercent: z.number(),
    resetsAt: z.string().nullable(),
  })
  .passthrough();

const selectedUsageSchema = z
  .object({
    providerId: z.string().nullable(),
    providerLabel: z.string().nullable(),
    status: z.enum([
      "ok",
      "not_installed",
      "unauthenticated",
      "expired",
      "error",
      "unsupported",
    ]),
    planLabel: z.string().nullable(),
    accountEmail: z.string().nullable(),
    windows: z.array(usageWindowSchema),
    message: z.string().nullable(),
  })
  .strict();

export const rpcContract = defineRpcContract({
  usage: {
    input: z
      .object({
        /** Current composer selection, when the DOM exposes it. */
        providerId: z.string().nullable(),
        /** Used to resolve the thread's execution host. */
        threadId: z.string().nullable(),
      })
      .strict(),
    output: selectedUsageSchema,
  },
});

/**
 * `windowLabels` keeps only the aggregate windows the host daemon emits first.
 * Claude also returns one weekly window per model (labelled with the model's
 * display name, e.g. "Fable"); those are noise in a one-line composer row.
 */
const PROVIDERS = {
  codex: {
    label: "Codex",
    usageKey: "codex",
    windowLabels: ["Current session", "Weekly limit"],
  },
  "claude-code": {
    label: "Claude Code",
    usageKey: "claude-code",
    windowLabels: ["Current session", "Weekly limit"],
  },
  "acp-cursor": {
    label: "Cursor",
    usageKey: "acp-cursor",
    windowLabels: ["Plan usage", "On-demand spend"],
  },
} as const;

type ProviderInfo = (typeof PROVIDERS)[keyof typeof PROVIDERS];

function providerInfo(providerId: string | null): ProviderInfo | null {
  if (providerId === null) return null;
  return PROVIDERS[providerId as keyof typeof PROVIDERS] ?? null;
}

/**
 * Falls back to the first two windows when the upstream labels change, so a
 * renamed window degrades to "possibly wrong subset" instead of an empty row.
 */
function aggregateWindows<T extends { label: string }>(
  windows: readonly T[],
  provider: ProviderInfo,
): T[] {
  const allowed = new Set<string>(provider.windowLabels);
  const matched = windows.filter((window) => allowed.has(window.label));
  return matched.length > 0 ? matched : windows.slice(0, 2);
}

/**
 * Reads only the usage belonging to the active composer provider. The browser
 * may provide the just-selected provider; otherwise the thread's committed
 * provider is the authoritative fallback. Usage is read from the thread host,
 * not blindly from the primary machine.
 */
export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    locale: {
      type: "select",
      label: "Language",
      description:
        "UI language for the usage row under the composer. auto follows your browser language (en / ru / ko).",
      options: [...LOCALE_OPTIONS],
      default: "auto",
    },
  });

  bb.rpc.register(rpcContract, {
    usage: async ({ providerId: selectedProviderId, threadId }) => {
      const { locale: localeSetting } = await settings.get();
      const locale = resolveLocale(localeSetting);
      const messages = getMessages(locale);

      const thread = threadId
        ? await bb.sdk.threads.get({ threadId })
        : null;
      const providerId = selectedProviderId ?? thread?.providerId ?? null;
      const provider = providerInfo(providerId);

      if (!provider) {
        return {
          providerId,
          providerLabel: providerId,
          status: "unsupported" as const,
          planLabel: null,
          accountEmail: null,
          windows: [],
          message: messages.unsupportedProvider,
        };
      }

      const environment = thread?.environmentId
        ? await bb.sdk.environments.get({ environmentId: thread.environmentId })
        : null;
      const allUsage = await bb.sdk.system.usageLimits(
        environment ? { hostId: environment.hostId } : undefined,
      );
      const usage = allUsage[provider.usageKey];

      if (!usage) {
        return {
          providerId,
          providerLabel: provider.label,
          status: "error" as const,
          planLabel: null,
          accountEmail: null,
          windows: [],
          message: messages.usageLoadFailed,
        };
      }

      return {
        providerId,
        providerLabel: provider.label,
        status: usage.status,
        planLabel:
          usage.status === "ok" || usage.status === "error"
            ? (usage.planLabel ?? null)
            : null,
        accountEmail:
          usage.status === "ok" || usage.status === "error"
            ? (usage.accountEmail ?? null)
            : null,
        windows:
          usage.status === "ok"
            ? aggregateWindows(usage.windows, provider)
            : [],
        message:
          usage.status === "error"
            ? (usage.message ??
              localizedStatusMessage(messages, {
                providerLabel: provider.label,
                status: "error",
                message: null,
              }))
            : null,
      };
    },
  });
}
