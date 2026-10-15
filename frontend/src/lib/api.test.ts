import { ApiError, authApi, boardApi } from "@/lib/api";
import { mockApi } from "@/test/mockApi";

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("raises ApiError with the server detail", async () => {
    mockApi({ "POST /api/auth/login": { status: 401, body: { detail: "Invalid username or password" } } });

    const error = await authApi.login("a", "b").catch((err) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.message).toBe("Invalid username or password");
  });

  it("falls back to the status code when there is no detail", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("oops", { status: 500 }))));

    await expect(authApi.me()).rejects.toThrow("Request failed: 500");
  });

  it("resolves empty responses", async () => {
    mockApi({ "POST /api/auth/logout": { status: 204 } });

    await expect(authApi.logout()).resolves.toBeUndefined();
  });

  it("scopes board calls to the board id", async () => {
    const fetchMock = mockApi({ "POST /api/boards/4/cards/card-1/move": { body: {} } });

    await boardApi(4).moveCard("card-1", "col-done", 2);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/4/cards/card-1/move",
      expect.objectContaining({ body: JSON.stringify({ columnId: "col-done", position: 2 }) })
    );
  });
});
