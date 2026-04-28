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

// ──────────────────────────────────────────────────────────
//  IST helpers — markets are scheduled in India time, so
//  every "is the market open?" check has to evaluate in IST
//  regardless of the user's device timezone (otherwise a
//  user in Dubai sees the window 1.5 hours later than a user
//  in Delhi and can place bets after the IST cut-off).
// ──────────────────────────────────────────────────────────

const IST_HM_FORMATTER =
  typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function"
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;

// Returns the current minute-of-day in IST (0-1439). Uses Intl when
// available, otherwise falls back to a fixed +05:30 offset off UTC.
export function istMinutesNow() {
  const date = new Date();
  if (IST_HM_FORMATTER) {
    let h = 0;
    let m = 0;
    for (const part of IST_HM_FORMATTER.formatToParts(date)) {
      if (part.type === "hour") h = parseInt(part.value, 10);
      if (part.type === "minute") m = parseInt(part.value, 10);
    }
    // 24-hour formatter sometimes emits "24" for midnight on older
    // browsers — clamp it.
    if (h === 24) h = 0;
    return h * 60 + m;
  }
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return ((utcMinutes + 330) % 1440 + 1440) % 1440;
}

// "08:40 PM" / "08:40 pm" / "20:40" → minutes since midnight.
export function parseTimeStringToMinutes(timeString) {
  if (!timeString || typeof timeString !== "string") return null;
  const cleaned = timeString.trim();
  // 12-hour with AM/PM.
  const ampmMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]?$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const isPm = /^[Pp]/.test(ampmMatch[3]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (isPm && hours !== 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  // 24-hour fallback ("20:40").
  const hmMatch = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const hours = parseInt(hmMatch[1], 10);
    const minutes = parseInt(hmMatch[2], 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  return null;
}

// Open / close window check in IST. Handles windows that wrap past
// midnight (e.g. open 11:00 PM, close 05:40 AM next morning).
export function isWithinIstWindow(openTime, closeTime) {
  const openMin = parseTimeStringToMinutes(openTime);
  const closeMin = parseTimeStringToMinutes(closeTime);
  if (openMin === null || closeMin === null) return false;
  const nowMin = istMinutesNow();
  if (closeMin <= openMin) {
    // Window wraps over midnight.
    return nowMin >= openMin || nowMin < closeMin;
  }
  return nowMin >= openMin && nowMin < closeMin;
}
