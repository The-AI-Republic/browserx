import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DOMTool } from '../../../src/tools/DOMTool';
import { DomService } from '../../../src/tools/dom/DomService';
import type { FillFormResult } from '../../../src/types/domTool';

vi.mock('../../../src/tools/dom/DomService');

describe('DOMTool fill_form integration', () => {
  let domTool: DOMTool;
  let fillFormMock: ReturnType<typeof vi.fn>;
  let typeMock: ReturnType<typeof vi.fn>;
  const mockFillResult: FillFormResult = {
    success: true,
    status: 'ok',
    filledFields: ['node:101', 'node:102', 'node:103', 'node:104', 'node:105'],
    outcomes: [
      { target: 'node:101', status: 'filled', appliedValue: 'Alex Example' },
      { target: 'node:102', status: 'filled', appliedValue: 'alex@example.com' },
      { target: 'node:103', status: 'filled', appliedValue: '+1 555 0100' },
      { target: 'node:104', status: 'filled', appliedValue: 'developer' },
      { target: 'node:105', status: 'filled', appliedValue: true },
    ],
    warnings: [],
    durationMs: 42,
  };

  beforeEach(() => {
    domTool = new DOMTool();
    fillFormMock = vi.fn().mockResolvedValue(mockFillResult);
    typeMock = vi.fn().mockResolvedValue({
      success: true,
      duration: 5,
      changes: {
        navigationOccurred: false,
        domMutations: 1,
        scrollChanged: false,
        valueChanged: true,
        newValue: 'override',
      },
      nodeId: 101,
      actionType: 'type',
      timestamp: new Date().toISOString(),
    });

    vi.spyOn(domTool as any, 'validateChromeContext').mockImplementation(() => {});
    vi.spyOn(domTool as any, 'validatePermissions').mockResolvedValue(undefined);
    vi.spyOn(domTool as any, 'validateTabId').mockResolvedValue({ id: 321 });

    vi.mocked(DomService.forTab).mockResolvedValue({
      fillForm: fillFormMock,
      type: typeMock,
    } as unknown as DomService);
  });

  it('routes fill_form requests to DomService with normalized payload', async () => {
    const request = {
      action: 'fill_form' as const,
      tab_id: 321,
      form_selector: '#profile-form',
      fields: [
        { node_id: 101, value: 'Alex Example', trigger: 'change' },
        { node_id: 102, value: 'alex@example.com' },
        { node_id: 103, value: '+1 555 0100', trigger: 'blur' },
        { selector: '#role', value: 'developer' },
        { selector: '#newsletter', value: true, type: 'checkbox' },
      ],
      metadata: { runId: 'integration-test' },
    };

    const result = await (domTool as any).executeImpl(request, {});

    expect(result).toEqual(mockFillResult);
    expect(DomService.forTab).toHaveBeenCalledWith(321);
    expect(fillFormMock).toHaveBeenCalledWith({
      fields: [
        { node_id: 101, value: 'Alex Example', trigger: 'change' },
        { node_id: 102, value: 'alex@example.com' },
        { node_id: 103, value: '+1 555 0100', trigger: 'blur' },
        { selector: '#role', value: 'developer' },
        { selector: '#newsletter', value: true, type: 'checkbox' },
      ],
      formSelector: '#profile-form',
      submit: undefined,
      metadata: { runId: 'integration-test' },
    });
  });

  it('surfaces fill_form results unchanged from DomService', async () => {
    const request = {
      action: 'fill_form' as const,
      tab_id: 321,
      fields: [{ node_id: 999, value: 'Sample' }],
    };

    const response = await (domTool as any).executeImpl(request, {});

    expect(response.success).toBe(true);
    expect(response.status).toBe('ok');
    expect(response.filledFields).toHaveLength(5);
  });

  it('propagates partial failure outcomes for fill_form', async () => {
    fillFormMock.mockResolvedValueOnce({
      success: false,
      status: 'attention_required',
      filledFields: ['node:42'],
      outcomes: [
        { target: 'node:42', status: 'filled', appliedValue: 'ok' },
        { target: 'name:email', status: 'failed', message: 'Field not found' },
      ],
      warnings: ['email field missing'],
      durationMs: 30,
    });

    const request = {
      action: 'fill_form' as const,
      tab_id: 321,
      fields: [
        { node_id: 42, value: 'ok' },
        { name: 'email', value: 'missing@example.com' },
      ],
    };

    const response = await (domTool as any).executeImpl(request, {});

    expect(response.success).toBe(false);
    expect(response.status).toBe('attention_required');
    expect(response.outcomes.some(outcome => outcome.status === 'failed')).toBe(true);
    expect(response.warnings).toContain('email field missing');
  });

  it('allows follow-up single-field actions after fill_form', async () => {
    const fillRequest = {
      action: 'fill_form' as const,
      tab_id: 321,
      fields: [{ node_id: 101, value: 'Alex Example' }],
    };

    await (domTool as any).executeImpl(fillRequest, {});

    const typeRequest = {
      action: 'type' as const,
      tab_id: 321,
      node_id: 101,
      text: 'override',
      options: {},
    };

    const typeResult = await (domTool as any).executeImpl(typeRequest, {});

    expect(fillFormMock).toHaveBeenCalledTimes(1);
    expect(typeMock).toHaveBeenCalledWith(101, 'override');
    expect(typeResult.success).toBe(true);
  });

  it('throws when fill_form validation fails', async () => {
    const invalidRequest = {
      action: 'fill_form' as const,
      tab_id: 321,
    };

    await expect((domTool as any).executeImpl(invalidRequest, {})).rejects.toThrow(
      /fields is required/
    );
  });
});
