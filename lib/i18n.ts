export type Locale = "en" | "ru" | "ko";

export type LocaleSetting = Locale | "auto";

export type WindowLabelKey =
  | "Current session"
  | "Weekly limit"
  | "Plan usage"
  | "On-demand spend";

export type Messages = {
  windowLabels: Record<WindowLabelKey, string>;
  resetSoon: string;
  resetInMinutes: (minutes: number) => string;
  resetInHours: (hours: number) => string;
  resetInHoursMinutes: (hours: number, minutes: number) => string;
  resetInDays: (days: number) => string;
  resetInDaysHours: (days: number, hours: number) => string;
  currentProvider: string;
  signIn: (provider: string) => string;
  loginExpired: (provider: string) => string;
  cliNotInstalled: (provider: string) => string;
  usageLoadFailed: string;
  unsupportedProvider: string;
  noSubscriptionLimits: string;
  loadingUsage: string;
  refreshUsage: string;
  percentUsed: (percent: number) => string;
};

const EN: Messages = {
  windowLabels: {
    "Current session": "Session",
    "Weekly limit": "Weekly",
    "Plan usage": "Plan",
    "On-demand spend": "On-demand",
  },
  resetSoon: "resets soon",
  resetInMinutes: (minutes) => `resets in ${minutes}m`,
  resetInHours: (hours) => `resets in ${hours}h`,
  resetInHoursMinutes: (hours, minutes) => `resets in ${hours}h ${minutes}m`,
  resetInDays: (days) => `resets in ${days}d`,
  resetInDaysHours: (days, hours) => `resets in ${days}d ${hours}h`,
  currentProvider: "current provider",
  signIn: (provider) => `Sign in to ${provider}.`,
  loginExpired: (provider) => `${provider} login expired.`,
  cliNotInstalled: (provider) => `${provider} CLI is not installed.`,
  usageLoadFailed: "Could not load usage.",
  unsupportedProvider: "This provider does not expose subscription limits.",
  noSubscriptionLimits: "No subscription limits to show.",
  loadingUsage: "Loading usage…",
  refreshUsage: "Refresh usage",
  percentUsed: (percent) => `${percent}% used`,
};

const RU: Messages = {
  windowLabels: {
    "Current session": "Сессия",
    "Weekly limit": "Неделя",
    "Plan usage": "План",
    "On-demand spend": "Доп.",
  },
  resetSoon: "скоро сброс",
  resetInMinutes: (minutes) => `сброс через ${minutes} мин`,
  resetInHours: (hours) => `сброс через ${hours} ч`,
  resetInHoursMinutes: (hours, minutes) =>
    `сброс через ${hours} ч ${minutes} мин`,
  resetInDays: (days) => `сброс через ${days} д`,
  resetInDaysHours: (days, hours) => `сброс через ${days} д ${hours} ч`,
  currentProvider: "текущий провайдер",
  signIn: (provider) => `Войдите в аккаунт ${provider}.`,
  loginExpired: (provider) => `Сессия ${provider} истекла.`,
  cliNotInstalled: (provider) => `CLI ${provider} не установлен.`,
  usageLoadFailed: "Не удалось загрузить лимиты.",
  unsupportedProvider: "У этого провайдера нет данных о лимитах подписки.",
  noSubscriptionLimits: "Нет лимитов подписки для отображения.",
  loadingUsage: "Загрузка лимитов…",
  refreshUsage: "Обновить лимиты",
  percentUsed: (percent) => `${percent}% использовано`,
};

const KO: Messages = {
  windowLabels: {
    "Current session": "세션",
    "Weekly limit": "주간",
    "Plan usage": "플랜",
    "On-demand spend": "추가 사용",
  },
  resetSoon: "곧 초기화",
  resetInMinutes: (minutes) => `${minutes}분 후 초기화`,
  resetInHours: (hours) => `${hours}시간 후 초기화`,
  resetInHoursMinutes: (hours, minutes) =>
    `${hours}시간 ${minutes}분 후 초기화`,
  resetInDays: (days) => `${days}일 후 초기화`,
  resetInDaysHours: (days, hours) => `${days}일 ${hours}시간 후 초기화`,
  currentProvider: "현재 공급자",
  signIn: (provider) => `${provider} 계정에 로그인해 주세요.`,
  loginExpired: (provider) => `${provider} 로그인이 만료되었습니다.`,
  cliNotInstalled: (provider) => `${provider} CLI가 설치되어 있지 않습니다.`,
  usageLoadFailed: "사용량 정보를 불러올 수 없습니다.",
  unsupportedProvider: "현재 공급자는 사용량 한도를 제공하지 않습니다.",
  noSubscriptionLimits: "표시할 구독 한도가 없습니다.",
  loadingUsage: "사용량 불러오는 중…",
  refreshUsage: "사용량 새로 고침",
  percentUsed: (percent) => `${percent}% 사용`,
};

const CATALOG: Record<Locale, Messages> = {
  en: EN,
  ru: RU,
  ko: KO,
};

export const LOCALE_OPTIONS = ["auto", "en", "ru", "ko"] as const;

export function isLocale(value: string): value is Locale {
  return value === "en" || value === "ru" || value === "ko";
}

/** Resolve plugin locale setting; `auto` follows browser language when available. */
export function resolveLocale(
  setting: string | undefined,
  browserLanguage?: string,
): Locale {
  if (setting && isLocale(setting)) return setting;

  const lang = (browserLanguage ?? "en").toLowerCase();
  if (lang.startsWith("ru")) return "ru";
  if (lang.startsWith("ko")) return "ko";
  return "en";
}

export function getMessages(locale: Locale): Messages {
  return CATALOG[locale];
}

export function resetLabel(
  messages: Messages,
  resetsAt: string | null,
): string | null {
  if (!resetsAt) return null;
  const resetAt = new Date(resetsAt).getTime();
  if (Number.isNaN(resetAt)) return null;

  const minutes = Math.round((resetAt - Date.now()) / 60_000);
  if (minutes <= 0) return messages.resetSoon;
  if (minutes < 60) return messages.resetInMinutes(minutes);

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0
      ? messages.resetInHoursMinutes(hours, remainingMinutes)
      : messages.resetInHours(hours);
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0
    ? messages.resetInDaysHours(days, remainingHours)
    : messages.resetInDays(days);
}

export function windowLabel(messages: Messages, label: string): string {
  return (
    messages.windowLabels[label as WindowLabelKey] ??
    label
  );
}

export function statusMessage(
  messages: Messages,
  usage: {
    providerLabel: string | null;
    status: string;
    message: string | null;
  },
): string {
  const provider = usage.providerLabel ?? messages.currentProvider;
  switch (usage.status) {
    case "unauthenticated":
      return messages.signIn(provider);
    case "expired":
      return messages.loginExpired(provider);
    case "not_installed":
      return messages.cliNotInstalled(provider);
    case "error":
      return usage.message ?? messages.usageLoadFailed;
    case "unsupported":
      return usage.message ?? messages.unsupportedProvider;
    default:
      return messages.noSubscriptionLimits;
  }
}
