import { describe, it, expect } from 'vitest';
import { validateUsername } from '../src/validator.js';

describe('validateUsername', () => {
  it('returns valid with trimmed username for a valid input', () => {
    const result = validateUsername('testuser');
    expect(result).toEqual({ valid: true, username: 'testuser' });
  });

  it('returns invalid with usage error for undefined input', () => {
    const result = validateUsername(undefined);
    expect(result).toEqual({
      valid: false,
      error: 'Usage: edh-challenge <moxfield-username>',
    });
  });

  it('returns invalid for an empty string', () => {
    const result = validateUsername('');
    expect(result).toEqual({
      valid: false,
      error: 'Error: Username is invalid. Please provide a non-empty Moxfield username.',
    });
  });

  it('returns invalid for a whitespace-only string', () => {
    const result = validateUsername('   ');
    expect(result).toEqual({
      valid: false,
      error: 'Error: Username is invalid. Please provide a non-empty Moxfield username.',
    });
  });

  it('trims leading and trailing spaces from valid username', () => {
    const result = validateUsername('  myuser  ');
    expect(result).toEqual({ valid: true, username: 'myuser' });
  });
});
