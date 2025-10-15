/**
 * Main application controller for Codex Tool Test side panel
 */

import { getTools, executeTool } from '../utils/messaging';
import { formatResult, formatParameterSchema, syntaxHighlight } from '../utils/formatting';

// View state
let currentView: 'list' | 'detail' = 'list';
let selectedTool: any = null;
let allTools: any[] = [];

// DOM elements
const toolListView = document.getElementById('tool-list-view')!;
const toolDetailView = document.getElementById('tool-detail-view')!;
const toolList = document.getElementById('tool-list')!;
const loading = document.getElementById('loading')!;
const errorDisplay = document.getElementById('error-display')!;
const backBtn = document.getElementById('back-btn')!;
const executeForm = document.getElementById('execute-form') as HTMLFormElement;

/**
 * Initialize application
 */
async function init() {
  try {
    showLoading(true);

    // Load tools
    allTools = await getTools();

    // Sort tools alphabetically
    allTools.sort((a, b) => {
      const nameA = getToolName(a);
      const nameB = getToolName(b);
      return nameA.localeCompare(nameB);
    });

    // Render tool list
    renderToolList();

    // Setup event listeners
    setupEventListeners();

    showLoading(false);
  } catch (error: any) {
    showError(error.message);
    showLoading(false);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  backBtn.addEventListener('click', () => showToolList());

  executeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleExecute();
  });

  const errorCloseBtn = errorDisplay.querySelector('.close-btn')!;
  errorCloseBtn.addEventListener('click', () => hideError());
}

/**
 * Render tool list
 */
function renderToolList() {
  const toolCountEl = document.querySelector('.tool-count')!;
  toolCountEl.textContent = `${allTools.length} tools available`;

  toolList.innerHTML = '';

  if (allTools.length === 0) {
    toolList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-secondary);">No tools available</div>';
    return;
  }

  for (const tool of allTools) {
    const toolItem = createToolItem(tool);
    toolList.appendChild(toolItem);
  }
}

/**
 * Create tool list item element
 */
function createToolItem(tool: any): HTMLElement {
  const name = getToolName(tool);
  const description = getToolDescription(tool);
  const type = tool.type;

  const item = document.createElement('div');
  item.className = 'tool-item';
  item.innerHTML = `
    <div class="tool-item-name">${name}</div>
    <div class="tool-item-desc">${description}</div>
    <div class="tool-item-type">${type}</div>
  `;

  item.addEventListener('click', () => showToolDetail(tool));

  return item;
}

/**
 * Show tool detail view
 */
function showToolDetail(tool: any) {
  selectedTool = tool;
  currentView = 'detail';

  const name = getToolName(tool);
  const description = getToolDescription(tool);
  const parameters = getToolParameters(tool);

  // Update UI
  document.getElementById('tool-name')!.textContent = name;
  document.getElementById('tool-description')!.textContent = description;
  document.getElementById('tool-parameters')!.innerHTML = formatParameterSchema(parameters);

  // Generate example request
  const exampleRequest = {
    toolName: name,
    parameters: generateExampleParameters(parameters),
    sessionId: 'test-session',
    turnId: 'test-turn-1',
  };

  document.getElementById('example-request')!.innerHTML = syntaxHighlight(JSON.stringify(exampleRequest, null, 2));

  // Generate parameter input form
  renderParameterInputs(parameters);

  // Hide result section
  const resultSection = document.getElementById('result-section')!;
  resultSection.style.display = 'none';

  // Show detail view
  toolListView.classList.add('hidden');
  toolDetailView.classList.remove('hidden');
}

/**
 * Show tool list view
 */
function showToolList() {
  currentView = 'list';
  selectedTool = null;

  toolDetailView.classList.add('hidden');
  toolListView.classList.remove('hidden');
}

/**
 * Render parameter input form
 */
function renderParameterInputs(schema: any) {
  const container = document.getElementById('param-inputs')!;
  container.innerHTML = '';

  if (!schema || !schema.properties) {
    container.innerHTML = '<div style="color: var(--text-secondary); font-style: italic;">No parameters required</div>';
    return;
  }

  const properties = schema.properties;
  const required = schema.required || [];

  for (const [name, prop] of Object.entries(properties)) {
    const propSchema = prop as any;
    const isRequired = required.includes(name);
    const type = propSchema.type || 'string';

    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const label = document.createElement('label');
    label.className = 'form-label';
    label.textContent = name;
    if (isRequired) {
      label.innerHTML += ' <span style="color: var(--error-color);">*</span>';
    }

    const input = createInputForType(name, type, propSchema);

    formGroup.appendChild(label);
    formGroup.appendChild(input);
    container.appendChild(formGroup);
  }
}

/**
 * Create input element based on parameter type
 */
function createInputForType(name: string, type: string, schema: any): HTMLElement {
  let input: HTMLElement;

  switch (type) {
    case 'boolean':
      input = document.createElement('select');
      input.setAttribute('name', name);
      input.innerHTML = `
        <option value="true">true</option>
        <option value="false">false</option>
      `;
      break;

    case 'number':
    case 'integer':
      input = document.createElement('input');
      input.setAttribute('type', 'number');
      input.setAttribute('name', name);
      if (schema.description) {
        input.setAttribute('placeholder', schema.description);
      }
      break;

    case 'object':
    case 'array':
      input = document.createElement('textarea');
      input.setAttribute('name', name);
      input.setAttribute('placeholder', 'Enter JSON');
      break;

    default:
      input = document.createElement('input');
      input.setAttribute('type', 'text');
      input.setAttribute('name', name);
      if (schema.description) {
        input.setAttribute('placeholder', schema.description);
      }
  }

  return input;
}

/**
 * Handle tool execution
 */
async function handleExecute() {
  if (!selectedTool) return;

  try {
    showLoading(true);

    // Collect parameters from form
    const formData = new FormData(executeForm);
    const parameters: Record<string, any> = {};

    const schema = getToolParameters(selectedTool);

    for (const [name, value] of formData.entries()) {
      const propSchema = schema.properties?.[name];
      const type = propSchema?.type || 'string';

      // Convert value based on type
      if (type === 'boolean') {
        parameters[name] = value === 'true';
      } else if (type === 'number' || type === 'integer') {
        parameters[name] = Number(value);
      } else if (type === 'object' || type === 'array') {
        try {
          parameters[name] = JSON.parse(value as string);
        } catch {
          throw new Error(`Invalid JSON for parameter: ${name}`);
        }
      } else {
        parameters[name] = value;
      }
    }

    // Execute tool
    const toolName = getToolName(selectedTool);
    const result = await executeTool(toolName, parameters);

    // Display result
    displayResult(result);

    showLoading(false);
  } catch (error: any) {
    showError(error.message);
    showLoading(false);
  }
}

/**
 * Display execution result
 */
function displayResult(result: any) {
  const resultSection = document.getElementById('result-section')!;
  const resultEl = document.getElementById('execution-result')!;

  resultEl.innerHTML = formatResult(result);
  resultSection.style.display = 'block';

  // Scroll to result
  resultSection.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Helper: Get tool name
 */
function getToolName(tool: any): string {
  if (tool.type === 'function') return tool.function.name;
  if (tool.type === 'custom') return tool.custom.name;
  return tool.type;
}

/**
 * Helper: Get tool description
 */
function getToolDescription(tool: any): string {
  if (tool.type === 'function') return tool.function.description;
  if (tool.type === 'custom') return tool.custom.description;
  return `${tool.type} tool`;
}

/**
 * Helper: Get tool parameters
 */
function getToolParameters(tool: any): any {
  if (tool.type === 'function') return tool.function.parameters;
  return { type: 'object', properties: {} };
}

/**
 * Helper: Generate example parameters
 */
function generateExampleParameters(schema: any): Record<string, any> {
  if (!schema || !schema.properties) return {};

  const params: Record<string, any> = {};

  for (const [name, prop] of Object.entries(schema.properties)) {
    const propSchema = prop as any;
    const type = propSchema.type || 'string';

    switch (type) {
      case 'string':
        params[name] = 'example';
        break;
      case 'number':
      case 'integer':
        params[name] = 42;
        break;
      case 'boolean':
        params[name] = true;
        break;
      case 'array':
        params[name] = [];
        break;
      case 'object':
        params[name] = {};
        break;
    }
  }

  return params;
}

/**
 * Show/hide loading overlay
 */
function showLoading(show: boolean) {
  if (show) {
    loading.classList.remove('hidden');
  } else {
    loading.classList.add('hidden');
  }
}

/**
 * Show error message
 */
function showError(message: string) {
  const errorContent = errorDisplay.querySelector('.error-content')!;
  errorContent.textContent = message;
  errorDisplay.classList.remove('hidden');
}

/**
 * Hide error message
 */
function hideError() {
  errorDisplay.classList.add('hidden');
}

// Initialize on load
init();
