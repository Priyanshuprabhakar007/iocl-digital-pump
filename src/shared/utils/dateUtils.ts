/**
 * Local business date & time utility helpers.
 *
 * Direct use of `new Date().toISOString().substring(0, 10)` converts local time to UTC first,
 * which produces the previous day/month in positive timezones like IST (UTC+5:30)
 * when accessed during early morning hours.
 *
 * These helpers use local calendar fields (getFullYear, getMonth, getDate, getHours, getMinutes)
 * to ensure input values reflect the user's actual local business date/month.
 */

/**
 * Returns local date string in YYYY-MM-DD format.
 */
export function getLocalDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns local month string in YYYY-MM format.
 */
export function getLocalMonthInputValue(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns local date-time string in YYYY-MM-DDTHH:mm format for datetime-local inputs.
 */
export function getLocalDateTimeInputValue(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
