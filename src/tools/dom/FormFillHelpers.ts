import type { FillFormFieldInstruction } from '../../types/domTool';

type SupportedFieldType = NonNullable<FillFormFieldInstruction['type']>;
type CommitMode = NonNullable<FillFormFieldInstruction['commit']>;

const BUTTON_TYPES: SupportedFieldType[] = ['submit', 'button'];

/**
 * Infer the most appropriate logical form field type using attribute heuristics.
 */
export function inferFieldType(element: Element): SupportedFieldType {
  const tagName = element.tagName?.toUpperCase?.() ?? '';

  if (tagName === 'SELECT') {
    return 'select';
  }

  if (tagName === 'TEXTAREA') {
    return 'textarea';
  }

  const input = element as HTMLInputElement;
  const normalizedType = input.type?.toLowerCase() || '';
  const name = input.name?.toLowerCase() || '';
  const id = input.id?.toLowerCase() || '';
  const placeholder = (input.placeholder || '').toLowerCase();

  if (normalizedType === 'email' || name.includes('email') || id.includes('email')) return 'email';
  if (normalizedType === 'password' || name.includes('password') || id.includes('password')) return 'password';
  if (normalizedType === 'tel' || name.includes('phone') || id.includes('phone')) return 'tel';
  if (normalizedType === 'number' || name.includes('number') || name.includes('amount')) return 'number';
  if (normalizedType === 'date' || name.includes('date')) return 'date';
  if (normalizedType === 'checkbox') return 'checkbox';
  if (normalizedType === 'radio') return 'radio';
  if (normalizedType === 'file') return 'file';
  if (BUTTON_TYPES.includes(normalizedType as SupportedFieldType)) {
    return normalizedType as SupportedFieldType;
  }

  if (placeholder.includes('email')) return 'email';
  if (placeholder.includes('phone') || placeholder.includes('tel')) return 'tel';

  return 'text';
}

/**
 * Locate a human-friendly label for a field element.
 */
export function findFieldLabel(element: HTMLElement): string | undefined {
  const ownerDocument = element.ownerDocument || (typeof document !== 'undefined' ? document : undefined);

  if (element.id && ownerDocument) {
    const label = ownerDocument.querySelector(`label[for="${element.id}"]`);
    if (label?.textContent) {
      return label.textContent.trim();
    }
  }

  if (typeof element.closest === 'function') {
    const parentLabel = element.closest('label');
    if (parentLabel?.textContent) {
      return parentLabel.textContent.trim();
    }
  }

  const previousSibling = element.previousElementSibling;
  if (previousSibling?.tagName === 'LABEL' && previousSibling.textContent) {
    return previousSibling.textContent.trim();
  }

  if ('placeholder' in element && (element as HTMLInputElement).placeholder) {
    return (element as HTMLInputElement).placeholder;
  }

  return element.getAttribute?.('name') || undefined;
}

/**
 * Generate a deterministic selector when node identifiers are unavailable.
 */
export function buildFallbackSelector(element: HTMLElement): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const name = element.getAttribute?.('name');
  if (name) {
    return `[name="${name}"]`;
  }

  const path: string[] = [];
  let current: HTMLElement | null = element;
  const ownerDocument = element.ownerDocument;
  const root = ownerDocument?.body || null;

  while (current && current !== root && current.tagName) {
    let selector = current.tagName.toLowerCase();

    if (current.className) {
      selector += '.' + current.className.split(' ').filter(Boolean).join('.');
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(child => child.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    current = parent;
  }

  return path.join(' > ') || element.tagName?.toLowerCase() || 'unknown';
}

/**
 * Normalise commit mode strings to the supported union.
 */
export function normaliseCommitMode(value: string | undefined): CommitMode | undefined {
  if (!value) return undefined;
  if (value === 'enter') return 'enter';
  return 'none';
}

/**
 * Produce a stable identifier string for logging and responses.
 */
export function resolveFieldIdentifier(field: FillFormFieldInstruction): string {
  if (typeof field.nodeId === 'number') {
    return `node:${field.nodeId}`;
  }

  if (field.selector) {
    return field.selector;
  }

  if (field.name) {
    return `name:${field.name}`;
  }

  if (field.label) {
    return `label:${field.label}`;
  }

  return 'unknown-field';
}
