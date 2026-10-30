import type { McpServer } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import type { AppServices } from '../app.js';
import registerAllTools from './register.js';

function captureTools(readOnly: boolean) {
  const tools = new Map<
    string,
    {
      inputSchema?: z.ZodType;
      annotations?: { readOnlyHint?: boolean };
      call: (params: Record<string, unknown>) => Promise<{ isError?: boolean }>;
    }
  >();
  const getEmail = vi.fn();
  const setFlags = vi.fn();
  const server = {
    registerTool(
      name: string,
      config: Omit<NonNullable<ReturnType<typeof tools.get>>, 'call'>,
      call: NonNullable<ReturnType<typeof tools.get>>['call'],
    ) {
      tools.set(name, { ...config, call });
    },
  };
  const services = {
    config: {
      settings: {
        readOnly,
        send: { maxAttachmentMb: 25 },
        attachments: { autoDownload: false },
        attachmentDownload: { allowedExtensions: ['pdf'], maxBytes: 1024 },
      },
      accounts: [],
    },
    mailReadService: { getEmail },
    imapService: { setFlags },
    hooksService: { getHooksConfig: () => ({}) },
  } as unknown as AppServices;
  registerAllTools(server as unknown as McpServer, services);
  return { tools, getEmail, setFlags };
}

describe('read-only tool surface', () => {
  it('keeps reads and excludes every mutating tool', () => {
    const { tools } = captureTools(true);
    for (const name of [
      'list_accounts',
      'list_mailboxes',
      'list_emails',
      'get_email',
      'search_emails',
      'extract_calendar',
      'list_events',
      'get_hooks_config',
    ]) {
      expect(tools.has(name), name).toBe(true);
    }
    for (const name of [
      'send_email',
      'delete_email',
      'mark_email',
      'add_to_calendar',
      'create_reminder',
      'configure_alerts',
      'test_notification',
      'configure_verification',
      'get_verification_code',
      'check_clipboard_setup',
    ]) {
      expect(tools.has(name), name).toBe(false);
    }
    for (const [name, tool] of tools) {
      expect(tool.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it('rejects markRead in both the schema and handler before reading mail', async () => {
    const { tools, getEmail, setFlags } = captureTools(true);
    const tool = tools.get('get_email');
    expect(tool).toBeDefined();
    const args = { account: 'test', emailId: '1', markRead: true };
    expect(tool?.inputSchema?.safeParse(args).success).toBe(false);
    expect(tool?.inputSchema?.safeParse({ ...args, markRead: false }).success).toBe(true);
    expect(tool?.inputSchema?.safeParse({ account: 'test', emailId: '1' }).success).toBe(true);
    expect(await tool?.call(args)).toMatchObject({ isError: true });
    expect(getEmail).not.toHaveBeenCalled();
    expect(setFlags).not.toHaveBeenCalled();
  });

  it('preserves the writable tool surface when readOnly is false', () => {
    const { tools } = captureTools(false);
    for (const name of [
      'send_email',
      'mark_email',
      'add_to_calendar',
      'create_reminder',
      'configure_alerts',
      'test_notification',
      'configure_verification',
      'get_verification_code',
    ]) {
      expect(tools.has(name), name).toBe(true);
    }
    expect(
      tools.get('get_email')?.inputSchema?.safeParse({
        account: 'test',
        emailId: '1',
        markRead: true,
      }).success,
    ).toBe(true);
  });

  it('rejects saving attachments to disk in read-only mode', async () => {
    const { tools } = captureTools(true);
    const tool = tools.get('download_attachment');
    const args = { account: 'test', id: '1', filename: 'test.pdf', saveToDownloadDir: true };
    expect(tool?.inputSchema?.safeParse(args).success).toBe(false);
    expect(tool?.inputSchema?.safeParse({ ...args, saveToDownloadDir: false }).success).toBe(true);
    expect(await tool?.call(args)).toMatchObject({ isError: true });
    expect(
      captureTools(false).tools.get('download_attachment')?.inputSchema?.safeParse(args).success,
    ).toBe(true);
  });
});
