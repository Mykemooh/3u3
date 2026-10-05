/**
 * A tiny cookie-keeping HTTP client for end-to-end checks against a
 * running server (npm run e2e). Signs in exactly the way the browser does:
 * CSRF token, then the credentials callback.
 */
export class Browser {
  cookies = new Map<string, string>();
  constructor(public base: string) {}

  private cookieHeader() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private keep(res: Response) {
    const raw = (res.headers as any).getSetCookie?.() as string[] | undefined;
    for (const line of raw ?? []) {
      const [pair, ...attrs] = line.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a)) || value === '';
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async req(path: string, init: RequestInit = {}) {
    const res = await fetch(this.base + path, {
      ...init,
      redirect: 'manual',
      headers: { ...(init.headers as any), cookie: this.cookieHeader() },
    });
    this.keep(res);
    return res;
  }

  async json(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    const res = await this.req(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, location: res.headers.get('location') };
  }

  async signIn(identifier: string, password: string) {
    const csrf = (await this.json('/api/auth/csrf')).data.csrfToken;
    const res = await this.req('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrfToken: csrf, identifier, password, json: 'true' }).toString(),
    });
    return res.status;
  }

  /** The same call next-auth/react's update() makes. */
  async updateSession(data: Record<string, unknown>) {
    const csrf = (await this.json('/api/auth/csrf')).data.csrfToken;
    return this.json('/api/auth/session', { csrfToken: csrf, data });
  }

  session() {
    return this.json('/api/auth/session');
  }
}
