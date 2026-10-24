import { generateKeyPairSync } from "node:crypto";

/** In-memory GitHub REST fake for the endpoints the site kickoff uses (TASK-039 tests). */
export function fakeGithub(owner = "owner") {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const repos = new Map<string, { private: boolean; branches: Map<string, Map<string, Buffer>> }>();
  const calls: string[] = [];
  const failNext: { match: RegExp; status: number }[] = [];

  // Template repo with both branches and the files the kickoff expects.
  const tpl = new Map<string, Buffer>([
    ["CLAUDE.md", Buffer.from("# CLAUDE.md\n\nintro\n\n## Architecture in one minute\n\nbody\n")],
    ["editor.config.json", Buffer.from(JSON.stringify({ siteId: "primer", enabled: false }))],
    ["BRIEF.md", Buffer.from("# BRIEF\n")],
  ]);
  repos.set("inzenirji-site-template", { private: true, branches: new Map([["main", new Map(tpl)], ["dev", new Map(tpl)]]) });
  repos.set("inzenirji-editor-config", { private: true, branches: new Map([["main", new Map()]]) });

  const res = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname;
    calls.push(`${method} ${path}`);
    const f = failNext.findIndex((x) => x.match.test(`${method} ${path}`));
    if (f >= 0) return res(failNext.splice(f, 1)[0]!.status, { message: "forced failure" });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    let m: RegExpMatchArray | null;
    if ((m = path.match(/^\/app\/installations\/(\d+)\/access_tokens$/))) return res(201, { token: "inst-token", expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    if (path === "/app") return res(200, { name: "Inzenirji CRM" });
    if (path === "/installation/repositories") return res(200, { total_count: repos.size, repositories: [] });
    if ((m = path.match(new RegExp(`^/repos/${owner}/([^/]+)/generate$`))) && method === "POST") {
      const t = repos.get(m[1]!);
      if (!t) return res(404, {});
      if (repos.has(body.name)) return res(422, { message: "name already exists" });
      repos.set(body.name, { private: body.private, branches: new Map([...t.branches].map(([b, files]) => [b, new Map(files)])) });
      return res(201, { full_name: `${owner}/${body.name}` });
    }
    if ((m = path.match(new RegExp(`^/repos/${owner}/([^/]+)/git/ref/heads/(.+)$`)))) {
      const r = repos.get(m[1]!);
      return r?.branches.has(decodeURIComponent(m[2]!)) ? res(200, { object: { sha: "sha-" + m[2] } }) : res(404, {});
    }
    if ((m = path.match(new RegExp(`^/repos/${owner}/([^/]+)/git/refs$`))) && method === "POST") {
      const r = repos.get(m[1]!)!;
      const name = String(body.ref).replace("refs/heads/", "");
      r.branches.set(name, new Map(r.branches.get("main")!));
      return res(201, {});
    }
    if ((m = path.match(new RegExp(`^/repos/${owner}/([^/]+)/contents/(.+)$`)))) {
      const r = repos.get(m[1]!);
      if (!r) return res(404, {});
      const file = decodeURIComponent(m[2]!);
      if (method === "GET") {
        const br = r.branches.get(url.searchParams.get("ref") ?? "main");
        const c = br?.get(file);
        return c ? res(200, { sha: "blob-" + c.length, content: c.toString("base64"), encoding: "base64" }) : res(404, {});
      }
      if (method === "PUT") {
        const br = r.branches.get(body.branch);
        if (!br) return res(404, {});
        br.set(file, Buffer.from(body.content, "base64"));
        return res(200, { content: { sha: "x" } });
      }
    }
    if ((m = path.match(new RegExp(`^/repos/${owner}/([^/]+)$`)))) return repos.has(m[1]!) ? res(200, { full_name: `${owner}/${m[1]}` }) : res(404, {});
    return res(404, { message: `unhandled ${method} ${path}` });
  }) as unknown as typeof fetch;

  return {
    privateKey,
    fetchImpl,
    repos,
    calls,
    failOnce: (match: RegExp, status = 500) => failNext.push({ match, status }),
    file: (repo: string, path: string, branch = "dev") => repos.get(repo)?.branches.get(branch)?.get(path)?.toString("utf8") ?? null,
    puts: () => calls.filter((c) => c.startsWith("PUT ")).length,
  };
}
