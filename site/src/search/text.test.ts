import { describe, expect, it } from 'vitest';
import { MAX_QUERY_CHARS, normalize, prepareQuery, stem, transpositions } from './text.ts';

describe('prepareQuery', () => {
  it('AC-32: drops filler words and stems the rest', () => {
    expect(prepareQuery('I need a skill for reviewing pull requests')).toEqual(['skill', 'review', 'pull', 'request']);
  });

  it('a query of filler words only is empty', () => {
    expect(prepareQuery('I need a')).toEqual([]);
    expect(prepareQuery('   ')).toEqual([]);
  });

  it('uses only the first 200 characters', () => {
    const long = `${'a'.repeat(MAX_QUERY_CHARS - 1)} zebra`;
    expect(prepareQuery(long)).toEqual(['a'.repeat(MAX_QUERY_CHARS - 1)]);
    expect(prepareQuery(`${'x '.repeat(97)}zebra`)).toContain('zebra');
  });

  it('treats HTML, quotes and regex characters as plain text', () => {
    expect(prepareQuery('<img src=x onerror=alert(1)>')).toEqual(['img', 'src', 'x', 'onerror', 'alert', '1']);
    expect(prepareQuery('"security" .* (a|b) [x] \\d+')).toEqual(['security', 'b', 'x', 'd']);
  });

  it('dedupes words that stem the same', () => {
    expect(prepareQuery('review reviews reviewing')).toEqual(['review']);
  });
});

describe('stem and normalize', () => {
  it('strips common suffixes and keeps short stems', () => {
    expect(stem('reviewing')).toBe('review');
    expect(stem('reviewed')).toBe('review');
    expect(stem('matches')).toBe('match');
    expect(stem('requests')).toBe('request');
    expect(stem('class')).toBe('class');
    expect(stem('thing')).toBe('thing');
    expect(stem('status')).toBe('status');
  });

  it('splits on anything that is not a letter or digit, Unicode aware', () => {
    expect(normalize('Код-рев’ю, v2!')).toEqual(['код', 'рев', 'ю', 'v2']);
  });
});

describe('transpositions', () => {
  it('lists adjacent swaps for words of 5+ letters only', () => {
    expect(transpositions('secuirty')).toContain('security');
    expect(transpositions('abcd')).toEqual([]);
    expect(transpositions('abcde')).toEqual(['bacde', 'acbde', 'abdce', 'abced']);
  });
});
