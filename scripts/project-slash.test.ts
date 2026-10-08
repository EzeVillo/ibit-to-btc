import { describe, expect, it, vi } from 'vitest';
import projectSlash from '../netlify/edge-functions/project-slash';

describe('Project path normalization', () => {
  it('redirects the bare project path once without fetching the proxy', async () => {
    const next = vi.fn(async () => new Response('proxied'));
    const response = await projectSlash(new Request('https://ezevillo.com/git-review-workflow'), { next });
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://ezevillo.com/git-review-workflow/');
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves query parameters during normalization', async () => {
    const next = vi.fn(async () => new Response('proxied'));
    const response = await projectSlash(new Request('https://ezevillo.com/git-review-workflow?ref=readme&lang=es'), { next });
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('https://ezevillo.com/git-review-workflow/?ref=readme&lang=es');
    expect(next).not.toHaveBeenCalled();
  });

  it('serves the normalized URL without redirecting it again', async () => {
    const proxied = new Response('landing', { status: 200 });
    const next = vi.fn(async () => proxied);
    const response = await projectSlash(new Request('https://ezevillo.com/git-review-workflow/'), { next });
    expect(response).toBe(proxied);
    expect(await response.text()).toBe('landing');
    expect(response.headers.has('location')).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });

  it('leaves the converter and project assets untouched', async () => {
    for (const path of ['/ibit-to-btc/', '/ibit-to-btc/ar/', '/git-review-workflow/logo.svg']) {
      const untouched = new Response(path);
      const next = vi.fn(async () => untouched);
      expect(await projectSlash(new Request(`https://ezevillo.com${path}`), { next })).toBe(untouched);
      expect(next).toHaveBeenCalledOnce();
    }
  });
});
