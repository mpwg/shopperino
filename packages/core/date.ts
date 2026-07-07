const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type IsoDate = string;

export function requireIsoDate(value: string, fieldName: string): IsoDate {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be an ISO date in YYYY-MM-DD format`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${fieldName} must be a valid calendar date`);
  }

  return value;
}

export function dateDeltaDays(left: IsoDate, right: IsoDate): number {
  const leftTime = Date.parse(`${left}T00:00:00.000Z`);
  const rightTime = Date.parse(`${right}T00:00:00.000Z`);

  return Math.round((leftTime - rightTime) / DAY_MS);
}
