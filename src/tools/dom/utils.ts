/**
 * Utility functions for DOM processing
 */

/**
 * Cap text length for display.
 */
export function cap_text_length(text: string, max_length: number): string {
	if (text.length <= max_length) {
		return text;
	}
	return text.substring(0, max_length) + '...';
}