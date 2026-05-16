import { describe, expect, it } from 'vitest';

import { avatarInitials, avatarSrc } from './userAvatar';

describe('userAvatar', () => {
  it('avatarSrc returns null for empty input', () => {
    expect(avatarSrc(null)).toBeNull();
    expect(avatarSrc('')).toBeNull();
  });

  it('avatarSrc keeps data URL as is', () => {
    const url = 'data:image/png;base64,abc';
    expect(avatarSrc(url)).toBe(url);
  });

  it('avatarSrc prefixes raw base64', () => {
    expect(avatarSrc('abc123')).toBe('data:image/jpeg;base64,abc123');
  });

  it('avatarInitials builds from full name', () => {
    expect(avatarInitials('Иван Петров')).toBe('ИП');
    expect(avatarInitials('Соло')).toBe('СО');
  });
});
