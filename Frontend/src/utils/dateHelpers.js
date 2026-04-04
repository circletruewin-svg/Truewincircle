export function toDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (typeof value?.seconds === "number") return new Date(value.seconds * 1000);

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateTime(value, locale = "en-IN") {
  const date = toDateValue(value);
  if (!date) return { date: "N/A", time: "N/A", dateTime: "N/A" };

  return {
    date: date.toLocaleDateString(locale),
    time: date.toLocaleTimeString(locale),
    dateTime: date.toLocaleString(locale),
  };
}

export function isDateInRange(value, startDate, endDate) {
  const date = toDateValue(value);
  if (!date) return false;

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  return date >= start && date <= end;
}

export function getPresetRange(preset) {
  const now = new Date();
  let start = new Date(now);
  let end = new Date(now);

  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (preset === "7days") {
    start.setDate(start.getDate() - 6);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}
