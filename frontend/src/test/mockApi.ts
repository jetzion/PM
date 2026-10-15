import { jsonResponse } from "@/test/jsonResponse";

type Reply = { status?: number; body?: unknown };
type Route = Reply | ((body: unknown) => Reply);

/**
 * Stub fetch with a route table keyed by "METHOD /path".
 * Unknown routes answer 404 so a missing mock fails loudly in assertions.
 */
export const mockApi = (routes: Record<string, Route>) => {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const route = routes[key];
    if (!route) {
      return jsonResponse({ detail: `Unmocked ${key}` }, 404);
    }
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const reply = typeof route === "function" ? route(body) : route;
    return jsonResponse(reply.body ?? null, reply.status ?? 200);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
