/**
 * Formatting utilities for displaying results
 */

/**
 * Syntax highlight JSON string
 */
export function syntaxHighlight(json: string): string {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return '<span class="' + cls + '">' + match + '</span>';
    }
  );
}

/**
 * Format tool execution result for display
 */
export function formatResult(result: any): string {
  if (!result) {
    return '<div class="no-result">No result</div>';
  }

  if (result.success) {
    const dataJson = JSON.stringify(result.data, null, 2);
    return `
      <div class="result-success">
        <div class="result-header">
          <span class="success-badge">✓ Success</span>
          <span class="duration">${result.duration}ms</span>
        </div>
        <pre class="json-display">${syntaxHighlight(dataJson)}</pre>
      </div>
    `;
  } else {
    const error = result.error;
    const detailsJson = error.details ? JSON.stringify(error.details, null, 2) : '';

    return `
      <div class="result-error">
        <div class="result-header">
          <span class="error-badge">✗ Error</span>
          <span class="duration">${result.duration}ms</span>
        </div>
        <div class="error-code">${error.code}</div>
        <div class="error-message">${error.message}</div>
        ${detailsJson ? `<pre class="json-display">${syntaxHighlight(detailsJson)}</pre>` : ''}
      </div>
    `;
  }
}

/**
 * Format tool parameter schema for display
 */
export function formatParameterSchema(schema: any): string {
  if (!schema || !schema.properties) {
    return '<div class="no-params">No parameters</div>';
  }

  const properties = schema.properties;
  const required = schema.required || [];

  let html = '<div class="param-list">';

  for (const [name, prop] of Object.entries(properties)) {
    const propSchema = prop as any;
    const isRequired = required.includes(name);
    const type = propSchema.type || 'any';

    html += `
      <div class="param-item">
        <div class="param-name">
          ${name}
          ${isRequired ? '<span class="required">*</span>' : ''}
        </div>
        <div class="param-type">${type}</div>
        ${propSchema.description ? `<div class="param-desc">${propSchema.description}</div>` : ''}
      </div>
    `;
  }

  html += '</div>';
  return html;
}
