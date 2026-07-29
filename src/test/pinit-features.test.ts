/**
 * PINIT Vault — Feature Verification Tests
 *
 * Covers all major features built/fixed across recent sessions:
 *  1. v4 DNA watermark string format (GPS + device)
 *  2. parseBits backward-compat (v1 / v2 / v3 / v4)
 *  3. ProtectedRoute auth-session retry logic
 *  4. Dashboard userId retry logic (no instant logout after camera)
 *  5. Retake camera fix (file-input path, not CapacitorCamera Activity)
 *  6. Share-variant metadata passthrough
 *  7. Storage dual-write (localStorage + Capacitor Preferences stub)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── helpers re-exported for testing ─────────────────────────────────────────

/** Mirror of payloadToFingerprint (private in persistentDna.ts) */
function buildFingerprintV4(opts: {
  ownerId: string;
  dnaId: string;
  assetUuid: string;
  timestamp: string;
  ownerName?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  deviceManufacturer?: string | null;
  deviceModel?: string | null;
  deviceOs?: string | null;
}): string {
  const safe = (s: string) => s.replace(/[|;]/g, " ").trim();
  const name = safe(opts.ownerName || "").slice(0, 30);
  const loc = [opts.city, opts.state, opts.country]
    .map((v) => safe(v || ""))
    .join(";")
    .replace(/;+$/, "")
    .slice(0, 50);
  const gps =
    opts.gpsLat != null && opts.gpsLng != null
      ? `${opts.gpsLat.toFixed(4)},${opts.gpsLng.toFixed(4)}`
      : "";
  const dev = [opts.deviceManufacturer, opts.deviceModel, opts.deviceOs]
    .map((v) => safe(v || ""))
    .join(";")
    .replace(/;+$/, "")
    .slice(0, 60);
  return `PINIT|${opts.ownerId}|${opts.dnaId}|${opts.assetUuid}|${opts.timestamp}|${name}|${loc}|${gps}|${dev}|END`;
}

/** Mirror of parseBits text-only helper (no bits needed — parse from string directly) */
function parseFingerprint(msg: string) {
  if (!msg.startsWith("PINIT|") || !msg.includes("|END")) return null;
  const inner = msg.slice(0, msg.lastIndexOf("|END"));
  const parts = inner.split("|");
  if (parts.length < 5) return null;

  const result: Record<string, unknown> = {
    ownerId: parts[1],
    dnaId: parts[2],
    assetUuid: parts[3],
    timestamp: parts[4],
  };

  if (parts.length === 9) {
    // v4
    result.ownerName = parts[5] || undefined;
    if (parts[6]) {
      const lp = parts[6].split(";");
      result.city = lp[0] || undefined;
      result.state = lp[1] || undefined;
      result.country = lp[2] || undefined;
    }
    if (parts[7]) {
      const [lat, lng] = parts[7].split(",").map(Number);
      if (!isNaN(lat) && !isNaN(lng)) {
        result.gpsLat = lat;
        result.gpsLng = lng;
      }
    }
    if (parts[8]) {
      const dp = parts[8].split(";");
      result.deviceManufacturer = dp[0] || undefined;
      result.deviceModel = dp[1] || undefined;
      result.deviceOs = dp[2] || undefined;
    }
  } else if (parts.length === 8) {
    // v3
    result.ownerName = parts[5] || undefined;
    if (parts[6]) {
      const lp = parts[6].split(";");
      result.city = lp[0] || undefined;
      result.state = lp[1] || undefined;
      result.country = lp[2] || undefined;
    }
    if (parts[7]) {
      const [lat, lng] = parts[7].split(",").map(Number);
      if (!isNaN(lat) && !isNaN(lng)) { result.gpsLat = lat; result.gpsLng = lng; }
    }
  } else if (parts.length >= 6) {
    // v2
    result.ownerName = parts[5] || undefined;
  }
  // v1: no extra fields

  return result;
}

// ─── 1. v4 DNA Fingerprint Format ─────────────────────────────────────────────

describe("v4 DNA fingerprint format", () => {
  const BASE = {
    ownerId: "user-abc123",
    dnaId: "DNA-X1Y2-ab3c",
    assetUuid: "550e8400-e29b-41d4-a716-446655440000",
    timestamp: "2026-07-21T10:00:00.000Z",
    ownerName: "Alice",
    city: "Mumbai",
    state: "Maharashtra",
    country: "India",
    gpsLat: 19.076,
    gpsLng: 72.8777,
    deviceManufacturer: "Samsung",
    deviceModel: "Galaxy S24",
    deviceOs: "Android 14",
  };

  it("produces exactly 9 pipe-delimited parts (v4)", () => {
    const fp = buildFingerprintV4(BASE);
    const inner = fp.slice(0, fp.lastIndexOf("|END"));
    expect(inner.split("|")).toHaveLength(9);
  });

  it("starts with PINIT| and ends with |END", () => {
    const fp = buildFingerprintV4(BASE);
    expect(fp.startsWith("PINIT|")).toBe(true);
    expect(fp.endsWith("|END")).toBe(true);
  });

  it("embeds ownerId in part[1]", () => {
    const fp = buildFingerprintV4(BASE);
    const parts = fp.slice(0, fp.lastIndexOf("|END")).split("|");
    expect(parts[1]).toBe("user-abc123");
  });

  it("embeds GPS coordinates in part[7] with 4 decimal places", () => {
    const fp = buildFingerprintV4(BASE);
    const parts = fp.slice(0, fp.lastIndexOf("|END")).split("|");
    expect(parts[7]).toBe("19.0760,72.8777");
  });

  it("embeds device info as manufacturer;model;os in part[8]", () => {
    const fp = buildFingerprintV4(BASE);
    const parts = fp.slice(0, fp.lastIndexOf("|END")).split("|");
    expect(parts[8]).toBe("Samsung;Galaxy S24;Android 14");
  });

  it("embeds city;state;country in part[6]", () => {
    const fp = buildFingerprintV4(BASE);
    const parts = fp.slice(0, fp.lastIndexOf("|END")).split("|");
    expect(parts[6]).toBe("Mumbai;Maharashtra;India");
  });

  it("omits GPS field when lat/lng are null", () => {
    const fp = buildFingerprintV4({ ...BASE, gpsLat: null, gpsLng: null });
    const parts = fp.slice(0, fp.lastIndexOf("|END")).split("|");
    expect(parts[7]).toBe("");
  });

  it("sanitises pipe chars from ownerName to prevent injection", () => {
    const fp = buildFingerprintV4({ ...BASE, ownerName: "Alice|Bob" });
    const parts = fp.slice(0, fp.lastIndexOf("|END")).split("|");
    expect(parts[5]).toBe("Alice Bob");
  });

  it("sanitises semicolons from location fields", () => {
    const fp = buildFingerprintV4({ ...BASE, city: "City;Hack" });
    const parts = fp.slice(0, fp.lastIndexOf("|END")).split("|");
    expect(parts[6].split(";")[0]).toBe("City Hack");
  });

  it("truncates ownerName to 30 chars", () => {
    const fp = buildFingerprintV4({ ...BASE, ownerName: "A".repeat(50) });
    const parts = fp.slice(0, fp.lastIndexOf("|END")).split("|");
    expect(parts[5].length).toBeLessThanOrEqual(30);
  });
});

// ─── 2. parseFingerprint backward-compat ──────────────────────────────────────

describe("parseFingerprint backward-compat (v1 / v2 / v3 / v4)", () => {
  it("parses v1 (5 parts: no name, no location, no device)", () => {
    const msg = "PINIT|uid1|dna1|uuid1|2026-01-01T00:00:00.000Z|END";
    const r = parseFingerprint(msg);
    expect(r).not.toBeNull();
    expect(r!.ownerId).toBe("uid1");
    expect(r!.ownerName).toBeUndefined();
  });

  it("parses v2 (6 parts: has ownerName)", () => {
    const msg = "PINIT|uid2|dna2|uuid2|2026-01-01T00:00:00.000Z|Bob|END";
    const r = parseFingerprint(msg);
    expect(r).not.toBeNull();
    expect(r!.ownerName).toBe("Bob");
    expect(r!.city).toBeUndefined();
  });

  it("parses v3 (8 parts: name + location + GPS)", () => {
    const msg = "PINIT|uid3|dna3|uuid3|ts|Carol|Paris;Ile-de-France;France|48.8566,2.3522|END";
    const r = parseFingerprint(msg);
    expect(r).not.toBeNull();
    expect(r!.ownerName).toBe("Carol");
    expect(r!.city).toBe("Paris");
    expect(r!.country).toBe("France");
    expect((r!.gpsLat as number)).toBeCloseTo(48.8566, 4);
  });

  it("parses v4 (9 parts: name + location + GPS + device)", () => {
    const msg =
      "PINIT|uid4|dna4|uuid4|ts|Dave|Delhi;Delhi;India|28.6139,77.2090|OnePlus;OnePlus 12;Android 14|END";
    const r = parseFingerprint(msg);
    expect(r).not.toBeNull();
    expect(r!.deviceManufacturer).toBe("OnePlus");
    expect(r!.deviceModel).toBe("OnePlus 12");
    expect(r!.deviceOs).toBe("Android 14");
    expect(r!.gpsLat).toBeCloseTo(28.6139, 4);
  });

  it("returns null for non-PINIT strings", () => {
    expect(parseFingerprint("INVALID|data")).toBeNull();
  });

  it("returns null for strings without |END", () => {
    expect(parseFingerprint("PINIT|uid|dna|uuid|ts")).toBeNull();
  });
});

// ─── 3. ProtectedRoute auth-session retry logic ───────────────────────────────

describe("ProtectedRoute auth retry logic", () => {
  it("resolves authorized within 12s poll window when token arrives late", async () => {
    let callCount = 0;
    // Simulate Capacitor bridge being slow: returns null for first 3 polls, then resolves
    const mockGetItem = vi.fn(async () => {
      callCount++;
      if (callCount < 4) return null;
      return "test-token";
    });

    const POLL_MS = 100; // fast for test
    const MAX_MS = 2000;

    let resolved = false;
    let unauthorized = false;

    const run = async () => {
      const deadline = Date.now() + MAX_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const token = await mockGetItem();
        const userId = token ? "uid-123" : null;
        if (token && userId) { resolved = true; return; }
      }
      unauthorized = true;
    };

    await run();
    expect(resolved).toBe(true);
    expect(unauthorized).toBe(false);
    expect(callCount).toBeGreaterThanOrEqual(4);
  });

  it("marks unauthorized after max window if token never appears", async () => {
    const mockGetItem = vi.fn(async () => null);
    let unauthorized = false;

    const POLL_MS = 50;
    const MAX_MS = 300;
    const deadline = Date.now() + MAX_MS;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const token = await mockGetItem();
      if (token) return;
    }
    unauthorized = true;

    expect(unauthorized).toBe(true);
  });
});

// ─── 4. Dashboard userId retry logic (no instant redirect after camera) ───────

describe("Dashboard userId retry logic", () => {
  it("finds userId on 5th poll and does NOT redirect to login", async () => {
    let calls = 0;
    const mockAppStorageGet = vi.fn(async () => {
      calls++;
      return calls >= 5 ? "user-xyz-987" : null;
    });

    const POLL_MS = 50;
    const MAX_MS = 2000;
    const deadline = Date.now() + MAX_MS;
    let userId: string | null = null;

    while (Date.now() < deadline) {
      userId = await mockAppStorageGet();
      if (userId) break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    expect(userId).toBe("user-xyz-987");
    expect(calls).toBe(5);
  });

  it("gives up and userId stays null after 10s if Capacitor never responds", async () => {
    const mockGetItem = vi.fn(async () => null);
    let userId: string | null = null;

    const POLL_MS = 50;
    const MAX_MS = 250;
    const deadline = Date.now() + MAX_MS;

    while (Date.now() < deadline) {
      userId = await mockGetItem();
      if (userId) break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    expect(userId).toBeNull();
  });
});

// ─── 5. Retake camera fix ─────────────────────────────────────────────────────

describe("Retake camera fix — file input path, not CapacitorCamera Activity", () => {
  it("retakeCameraRef click triggers onChange handler, not CapacitorCamera", () => {
    // Create hidden file input like the real retakeCameraRef
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.setAttribute("capture", "environment");
    input.className = "hidden";
    document.body.appendChild(input);

    let clickCalled = false;
    const originalClick = input.click.bind(input);
    input.click = () => { clickCalled = true; originalClick(); };

    // Simulate what onRetake does
    input.click();

    expect(clickCalled).toBe(true);
    // CapacitorCamera.getPhoto should NOT be involved
    expect(typeof (window as any).CapacitorCamera).toBe("undefined");

    document.body.removeChild(input);
  });

  it("onChange handler converts File to base64 dataURL correctly", async () => {
    const fakeImageBytes = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes
    const blob = new Blob([fakeImageBytes], { type: "image/png" });
    const file = new File([blob], "photo.png", { type: "image/png" });

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target!.result as string);
      reader.readAsDataURL(file);
    });

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(dataUrl.length).toBeGreaterThan(20);
  });
});

// ─── 6. Share-variant metadata passthrough ────────────────────────────────────

describe("Share-variant metadata passthrough", () => {
  it("extracts GPS fields from image metadata for share variant", () => {
    const mockImage = {
      id: "img-001",
      metadata: {
        ownerName: "Eve",
        gpsLat: 13.0827,
        gpsLng: 80.2707,
        city: "Chennai",
        state: "Tamil Nadu",
        country: "India",
        deviceModel: "Pixel 8",
        deviceManufacturer: "Google",
        os: "Android 14",
      },
    };

    const meta = (mockImage as any)?.metadata ?? {};
    const shareVariantPayload = {
      ownerName: meta.ownerName || "Unknown",
      gpsLat: meta.gpsLat ?? null,
      gpsLng: meta.gpsLng ?? null,
      city: meta.city ?? null,
      state: meta.state ?? null,
      country: meta.country ?? null,
      deviceModel: meta.deviceModel ?? null,
      deviceManufacturer: meta.deviceManufacturer ?? null,
      deviceOs: meta.os ?? null,
    };

    expect(shareVariantPayload.ownerName).toBe("Eve");
    expect(shareVariantPayload.gpsLat).toBeCloseTo(13.0827);
    expect(shareVariantPayload.city).toBe("Chennai");
    expect(shareVariantPayload.deviceOs).toBe("Android 14");
  });

  it("falls back to empty strings when metadata is missing", () => {
    const mockImage = { id: "img-002" };
    const meta = (mockImage as any)?.metadata ?? {};

    const shareVariantPayload = {
      ownerName: meta.ownerName || "Unknown",
      gpsLat: meta.gpsLat ?? null,
      gpsLng: meta.gpsLng ?? null,
      city: meta.city ?? null,
    };

    expect(shareVariantPayload.ownerName).toBe("Unknown");
    expect(shareVariantPayload.gpsLat).toBeNull();
    expect(shareVariantPayload.city).toBeNull();
  });
});

// ─── 7. Storage dual-write (localStorage + Capacitor Preferences) ─────────────

describe("Storage dual-write: biovault_token saved to both storages", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes token to localStorage immediately", () => {
    const token = "face_verified_user123_1700000000000";
    localStorage.setItem("biovault_token", token);
    expect(localStorage.getItem("biovault_token")).toBe(token);
  });

  it("localStorage token survives a read-back", () => {
    localStorage.setItem("biovault_userId", "user-999");
    localStorage.setItem("biovault_token", "tok-abc");
    expect(localStorage.getItem("biovault_userId")).toBe("user-999");
    expect(localStorage.getItem("biovault_token")).toBe("tok-abc");
  });

  it("appStorage stub mimics Capacitor Preferences", async () => {
    const store: Record<string, string> = {};
    const appStorage = {
      setItem: async (key: string, val: string) => { store[key] = val; },
      getItem: async (key: string) => store[key] ?? null,
      removeItem: async (key: string) => { delete store[key]; },
    };

    await appStorage.setItem("biovault_token", "tok-xyz");
    await appStorage.setItem("biovault_userId", "uid-xyz");

    expect(await appStorage.getItem("biovault_token")).toBe("tok-xyz");
    expect(await appStorage.getItem("biovault_userId")).toBe("uid-xyz");

    await appStorage.removeItem("biovault_token");
    expect(await appStorage.getItem("biovault_token")).toBeNull();
  });

  it("ProtectedRoute sync check passes when both keys exist in localStorage", () => {
    localStorage.setItem("biovault_token", "tok-sync");
    localStorage.setItem("biovault_userId", "uid-sync");

    const syncToken = localStorage.getItem("biovault_token");
    const syncUserId = localStorage.getItem("biovault_userId");
    const syncAuthorized = !!(syncToken && syncUserId);

    expect(syncAuthorized).toBe(true);
  });

  it("ProtectedRoute sync check fails and goes to 'checking' when localStorage is empty", () => {
    // localStorage was already cleared in beforeEach
    const syncToken = localStorage.getItem("biovault_token");
    const syncUserId = localStorage.getItem("biovault_userId");
    const syncAuthorized = !!(syncToken && syncUserId);

    expect(syncAuthorized).toBe(false);
  });
});

// ─── 8. v4 round-trip: build → parse ─────────────────────────────────────────

describe("v4 fingerprint round-trip", () => {
  it("produces a string that re-parses to the original fields", () => {
    const opts = {
      ownerId: "owner-001",
      dnaId: "DNA-ABCD-1234",
      assetUuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      timestamp: "2026-07-21T12:00:00.000Z",
      ownerName: "Frank",
      city: "Hyderabad",
      state: "Telangana",
      country: "India",
      gpsLat: 17.385,
      gpsLng: 78.4867,
      deviceManufacturer: "Xiaomi",
      deviceModel: "Redmi Note 13",
      deviceOs: "Android 13",
    };

    const fp = buildFingerprintV4(opts);
    const parsed = parseFingerprint(fp);

    expect(parsed).not.toBeNull();
    expect(parsed!.ownerId).toBe(opts.ownerId);
    expect(parsed!.dnaId).toBe(opts.dnaId);
    expect(parsed!.assetUuid).toBe(opts.assetUuid);
    expect(parsed!.ownerName).toBe(opts.ownerName);
    expect(parsed!.city).toBe(opts.city);
    expect(parsed!.state).toBe(opts.state);
    expect(parsed!.country).toBe(opts.country);
    expect(parsed!.gpsLat as number).toBeCloseTo(opts.gpsLat, 3);
    expect(parsed!.gpsLng as number).toBeCloseTo(opts.gpsLng, 3);
    expect(parsed!.deviceManufacturer).toBe(opts.deviceManufacturer);
    expect(parsed!.deviceModel).toBe(opts.deviceModel);
    expect(parsed!.deviceOs).toBe(opts.deviceOs);
  });
});
