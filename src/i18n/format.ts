import i18n from "./index";

export function formatDate(date: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(i18n.language, options).format(new Date(date));
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(i18n.language, options).format(value);
}

export function formatRelativeDays(date: Date | string | number): string {
  const targetTime = new Date(date).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetTime);
  target.setHours(0, 0, 0, 0);
  const dayDifference = Math.round((target.getTime() - today.getTime()) / 86400000);

  return new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" }).format(dayDifference, "day");
}
