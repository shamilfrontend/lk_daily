/** Экранирование текста для iCalendar (RFC 5545). */
export function icsEscapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function foldIcsLine(line: string): string {
  const max = 75;
  if (line.length <= max) {
    return line;
  }
  const parts: string[] = [];
  let rest = line;
  while (rest.length > max) {
    parts.push(rest.slice(0, max));
    rest = ` ${rest.slice(max)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}

export type IcsEventInput = {
  uid: string;
  /** YYYYMMDD */
  dateYmd: string;
  summary: string;
  description?: string;
};

export function buildIcsCalendar(
  prodid: string,
  events: IcsEventInput[],
): string {
  const stamp =
    new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z') || '19700101T000000Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${icsEscapeText(prodid)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const ev of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${icsEscapeText(ev.uid)}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${ev.dateYmd}`);
    lines.push(`SUMMARY:${foldIcsLine(icsEscapeText(ev.summary))}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${foldIcsLine(icsEscapeText(ev.description))}`);
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
