import { localeTag } from './index';

/** Datum in der aktiven Sprache formatieren (ersetzt hartkodiertes 'de-DE'). */
export const formatDate = (date: Date | number | string, options?: Intl.DateTimeFormatOptions): string =>
  new Date(date).toLocaleDateString(localeTag(), options);

/** Datum + Uhrzeit in der aktiven Sprache formatieren. */
export const formatDateTime = (date: Date | number | string, options?: Intl.DateTimeFormatOptions): string =>
  new Date(date).toLocaleString(localeTag(), options);
