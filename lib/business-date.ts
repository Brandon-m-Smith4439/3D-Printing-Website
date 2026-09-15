import { site } from "@/lib/site";

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function canonicalDate(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null;
  return parsed.toISOString().slice(0, 10);
}

export function businessToday() {
  return datePartsInTimeZone(new Date(), site.businessTimeZone);
}

export function minimumRequestDate() {
  const [year, month, day] = businessToday().split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  return tomorrow.toISOString().slice(0, 10);
}

/** Accept common US date entry and normalize it to YYYY-MM-DD. */
export function normalizeBusinessDate(value: string) {
  const input = value.trim();
  if (!input) return "";

  const iso = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return canonicalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const us = input.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (!us) return null;

  const month = Number(us[1]);
  const day = Number(us[2]);
  const rawYear = Number(us[3]);
  const year = us[3].length === 2 ? 2000 + rawYear : rawYear;
  return canonicalDate(year, month, day);
}

export function isFutureBusinessDate(value: string) {
  const normalized = normalizeBusinessDate(value);
  return Boolean(normalized && normalized > businessToday());
}

export function daysUntilBusinessDate(value: string) {
  const normalized = normalizeBusinessDate(value);
  if (!normalized) return null;
  const start = Date.parse(`${businessToday()}T00:00:00Z`);
  const end = Date.parse(`${normalized}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

export function isRushRequestDate(value: string) {
  const days = daysUntilBusinessDate(value);
  return days !== null && days > 0 && days < 3;
}

export function formatBusinessDate(value: string) {
  const normalized = normalizeBusinessDate(value);
  if (!normalized) return value;
  const [year, month, day] = normalized.split("-").map(Number);
  return `${month}/${day}/${year}`;
}
