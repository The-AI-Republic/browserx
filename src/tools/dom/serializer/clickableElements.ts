/**
 * Clickable element detection for browser-use DOM processing
 */

import { EnhancedDOMTreeNode, NodeType } from '../views';

export class ClickableElementDetector {
	static is_interactive(node: EnhancedDOMTreeNode): boolean {
		// Skip non-element nodes
		if (node.node_type !== NodeType.ELEMENT_NODE) {
			return false;
		}

		// remove html and body nodes
		if (node.tag_name === 'html' || node.tag_name === 'body') {
			return false;
		}

		// IFRAME elements should be interactive if they're large enough to potentially need scrolling
		// Small iframes (< 100px width or height) are unlikely to have scrollable content
		if (node.tag_name && (node.tag_name.toUpperCase() === 'IFRAME' || node.tag_name.toUpperCase() === 'FRAME')) {
			if (node.snapshot_node && node.snapshot_node.bounds) {
				const width = node.snapshot_node.bounds.width;
				const height = node.snapshot_node.bounds.height;
				// Only include iframes larger than 100x100px
				if (width > 100 && height > 100) {
					return true;
				}
			}
		}

		// RELAXED SIZE CHECK: Allow all elements including size 0 (they might be interactive overlays, etc.)
		// Note: Size 0 elements can still be interactive (e.g., invisible clickable overlays)
		// Visibility is determined separately by CSS styles, not just bounding box size

		// SEARCH ELEMENT DETECTION: Check for search-related classes and attributes
		if (node.attributes) {
			const search_indicators = [
				'search',
				'magnify',
				'glass',
				'lookup',
				'find',
				'query',
				'search-icon',
				'search-btn',
				'search-button',
				'searchbox'
			];

			// Check class names for search indicators
			const class_list = (node.attributes['class'] || '').toLowerCase().split(' ');
			if (search_indicators.some(indicator => class_list.join(' ').includes(indicator))) {
				return true;
			}

			// Check id for search indicators
			const element_id = (node.attributes['id'] || '').toLowerCase();
			if (search_indicators.some(indicator => element_id.includes(indicator))) {
				return true;
			}

			// Check data attributes for search functionality
			for (const [attr_name, attr_value] of Object.entries(node.attributes)) {
				if (attr_name.startsWith('data-') && search_indicators.some(indicator => attr_value.toLowerCase().includes(indicator))) {
					return true;
				}
			}
		}

		// Enhanced accessibility property checks - direct clear indicators only
		if (node.ax_node && node.ax_node.properties) {
			for (const prop of node.ax_node.properties) {
				try {
					// aria disabled
					if (prop.name === 'disabled' && prop.value) {
						return false;
					}

					// aria hidden
					if (prop.name === 'hidden' && prop.value) {
						return false;
					}

					// Direct interactiveness indicators
					if (['focusable', 'editable', 'settable'].includes(prop.name) && prop.value) {
						return true;
					}

					// Interactive state properties (presence indicates interactive widget)
					if (['checked', 'expanded', 'pressed', 'selected'].includes(prop.name)) {
						// These properties only exist on interactive elements
						return true;
					}

					// Form-related interactiveness
					if (['required', 'autocomplete'].includes(prop.name) && prop.value) {
						return true;
					}

					// Elements with keyboard shortcuts are interactive
					if (prop.name === 'keyshortcuts' && prop.value) {
						return true;
					}
				} catch (error) {
					// Skip properties we can't process
					continue;
				}
			}
		}

		// ENHANCED TAG CHECK: Include truly interactive elements
		// Note: 'label' removed - labels are handled by other attribute checks below
		const interactive_tags = [
			'button',
			'input',
			'select',
			'textarea',
			'a',
			'details',
			'summary',
			'option',
			'optgroup'
		];
		if (node.tag_name && interactive_tags.includes(node.tag_name)) {
			return true;
		}

		// Tertiary check: elements with interactive attributes
		if (node.attributes) {
			// Check for event handlers or interactive attributes
			const interactive_attributes = ['onclick', 'onmousedown', 'onmouseup', 'onkeydown', 'onkeyup', 'tabindex'];
			if (interactive_attributes.some(attr => attr in node.attributes!)) {
				return true;
			}

			// Check for interactive ARIA roles
			if ('role' in node.attributes) {
				const interactive_roles = [
					'button',
					'link',
					'menuitem',
					'option',
					'radio',
					'checkbox',
					'tab',
					'textbox',
					'combobox',
					'slider',
					'spinbutton',
					'search',
					'searchbox'
				];
				if (interactive_roles.includes(node.attributes['role'])) {
					return true;
				}
			}
		}

		// Quaternary check: accessibility tree roles
		if (node.ax_node && node.ax_node.role) {
			const interactive_ax_roles = [
				'button',
				'link',
				'menuitem',
				'option',
				'radio',
				'checkbox',
				'tab',
				'textbox',
				'combobox',
				'slider',
				'spinbutton',
				'listbox',
				'search',
				'searchbox'
			];
			if (interactive_ax_roles.includes(node.ax_node.role)) {
				return true;
			}
		}

		// ICON AND SMALL ELEMENT CHECK: Elements that might be icons
		if (
			node.snapshot_node &&
			node.snapshot_node.bounds &&
			10 <= node.snapshot_node.bounds.width && node.snapshot_node.bounds.width <= 50 &&  // Icon-sized elements
			10 <= node.snapshot_node.bounds.height && node.snapshot_node.bounds.height <= 50
		) {
			// Check if this small element has interactive properties
			if (node.attributes) {
				// Small elements with these attributes are likely interactive icons
				const icon_attributes = ['class', 'role', 'onclick', 'data-action', 'aria-label'];
				if (icon_attributes.some(attr => attr in node.attributes!)) {
					return true;
				}
			}
		}

		// Final fallback: cursor style indicates interactivity (for cases Chrome missed)
		if (node.snapshot_node && node.snapshot_node.cursor_style && node.snapshot_node.cursor_style === 'pointer') {
			return true;
		}

		return false;
	}
}