import { describe, expect, it } from 'vitest';
import { buildIcsCalendar, icsEscapeText } from './ics.js';

describe('ics', () => {
  it('escapes special characters', () => {
    expect(icsEscapeText('a;b,c\\n')).toContain('\\;');
  });

  it('builds minimal calendar', () => {
    const cal = buildIcsCalendar('-//Test//EN', [
      {
        uid: 'evt-1@test',
        dateYmd: '20260413',
        summary: 'Hello',
        description: 'Desc',
      },
    ]);
    expect(cal).toContain('BEGIN:VCALENDAR');
    expect(cal).toContain('END:VCALENDAR');
    expect(cal).toContain('DTSTART;VALUE=DATE:20260413');
    expect(cal).toContain('SUMMARY:');
  });
});
