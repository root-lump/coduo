import { describe, expect, it } from "vitest";
import { FileRequestCoordinator } from "./fileRequestCoordinator";

describe("FileRequestCoordinator", () => {
  it("makes a cached request current and supersedes an in-flight request", () => {
    const coordinator = new FileRequestCoordinator<string>();
    const cachedRequest = coordinator.begin("repo::cached.ts");
    coordinator.complete(cachedRequest.id, "repo::cached.ts", "cached source");

    const inFlight = coordinator.begin("repo::slow.ts");
    const cacheHit = coordinator.begin("repo::cached.ts");

    expect(cacheHit.cached).toBe("cached source");
    expect(coordinator.isCurrent(cacheHit.id)).toBe(true);
    expect(coordinator.isCurrent(inFlight.id)).toBe(false);
  });

  it("invalidates all requests and cache when the repository changes", () => {
    const coordinator = new FileRequestCoordinator<string>();
    const request = coordinator.begin("old::file.ts");
    coordinator.complete(request.id, "old::file.ts", "source");

    coordinator.clear();

    expect(coordinator.isCurrent(request.id)).toBe(false);
    expect(coordinator.begin("old::file.ts").cached).toBeUndefined();
  });

  it("does not cache a stale result that completes after clear", () => {
    const coordinator = new FileRequestCoordinator<string>();
    const staleRequest = coordinator.begin("same::file.ts");

    coordinator.clear();

    expect(
      coordinator.complete(staleRequest.id, "same::file.ts", "stale source"),
    ).toBe(false);
    expect(coordinator.begin("same::file.ts").cached).toBeUndefined();
  });

  it("can bypass a cached value when a fresh read is required", () => {
    const coordinator = new FileRequestCoordinator<string>();
    const firstRequest = coordinator.begin("repo::file.ts");
    coordinator.complete(firstRequest.id, "repo::file.ts", "old source");

    const refreshedRequest = coordinator.begin("repo::file.ts", false);

    expect(refreshedRequest.cached).toBeUndefined();
    expect(
      coordinator.complete(refreshedRequest.id, "repo::file.ts", "new source"),
    ).toBe(true);
    expect(coordinator.begin("repo::file.ts").cached).toBe("new source");
  });
});
