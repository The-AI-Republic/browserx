import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
// Test component that uses all terminal components together
import TestApp from './TestApp.svelte';

describe('Theme Integration', () => {
  it('should apply terminal theme to entire application', () => {
    const { container } = render(TestApp);

    // Check container has terminal styling
    const terminalContainer = container.querySelector('.terminal-container');
    expect(terminalContainer).toBeTruthy();

    // Check all color classes are available
    expect(container.querySelector('.text-term-green')).toBeTruthy();
    expect(container.querySelector('.text-term-yellow')).toBeTruthy();
    expect(container.querySelector('.text-term-red')).toBeTruthy();
    expect(container.querySelector('.text-term-bright-green')).toBeTruthy();
    expect(container.querySelector('.text-term-dim-green')).toBeTruthy();
  });

  it('should maintain consistent font family throughout', () => {
    const { container } = render(TestApp);
    const elements = container.querySelectorAll('[class*="font-terminal"]');
    expect(elements.length).toBeGreaterThan(0);

    // All text elements should inherit terminal font
    const textElements = container.querySelectorAll('.terminal-message, .terminal-input');
    textElements.forEach(el => {
      const parent = el.closest('.terminal-container');
      expect(parent?.classList.contains('font-terminal')).toBe(true);
    });
  });

  it('should provide proper visual hierarchy with colors', () => {
    const { container } = render(TestApp);

    // Regular messages in green
    const defaultMsg = container.querySelector('.terminal-message.text-term-green');
    expect(defaultMsg).toBeTruthy();

    // Warnings more prominent
    const warningMsg = container.querySelector('.terminal-message.text-term-yellow');
    expect(warningMsg).toBeTruthy();

    // Errors most prominent
    const errorMsg = container.querySelector('.terminal-message.text-term-red');
    expect(errorMsg).toBeTruthy();
  });

  it('should handle dark theme properly with black background', () => {
    const { container } = render(TestApp);
    const terminalContainer = container.querySelector('.terminal-container');
    expect(terminalContainer?.classList.contains('bg-term-bg')).toBe(true);

    // All text should have sufficient contrast against black
    const textElements = container.querySelectorAll('[class*="text-term-"]');
    expect(textElements.length).toBeGreaterThan(0);
  });
});