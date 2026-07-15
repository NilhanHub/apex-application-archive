import { describe, expect, it } from 'vitest';
import { isValidApplicationCvPath, safeDispositionFileName } from './cv-access.js';

describe('CV access validation', () => {
  it('accepts only the CV path owned by the requested application', () => {
    expect(isValidApplicationCvPath('2989_182', 182, 'cvs/2989/182/candidate-cv.pdf')).toBe(true);
    expect(isValidApplicationCvPath('2989_183', 182, 'cvs/2989/182/candidate-cv.pdf')).toBe(false);
    expect(isValidApplicationCvPath('2989_182', 182, 'cvs/2989/181/candidate-cv.pdf')).toBe(false);
    expect(isValidApplicationCvPath('2989_182', 182, 'cvs/2989/182/../secret.pdf')).toBe(false);
    expect(isValidApplicationCvPath('3107_182', 182, 'cvs/2989/182/candidate-cv.pdf')).toBe(false);
  });

  it('removes response-header control characters from filenames', () => {
    expect(safeDispositionFileName('candidate\r\n".pdf')).toBe('candidate___.pdf');
    expect(safeDispositionFileName('')).toBe('candidate-cv');
  });
});
