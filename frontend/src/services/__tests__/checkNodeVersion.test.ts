import { createRequire } from "module";

const requireFromHere = createRequire(__filename);

const loadChecker = () =>
  requireFromHere("../../../scripts/check-node-version.cjs") as {
    isSupportedNodeVersion: (version: string) => boolean;
  };

describe("check-node-version", () => {
  it("accepts supported node majors used by the repo", () => {
    const { isSupportedNodeVersion } = loadChecker();

    expect(isSupportedNodeVersion("20.19.0")).toBe(true);
    expect(isSupportedNodeVersion("22.17.1")).toBe(true);
  });

  it("rejects unsupported lower node majors", () => {
    const { isSupportedNodeVersion } = loadChecker();

    expect(isSupportedNodeVersion("19.9.0")).toBe(false);
  });

  it("rejects unsupported higher node majors", () => {
    const { isSupportedNodeVersion } = loadChecker();

    expect(isSupportedNodeVersion("25.0.0")).toBe(false);
  });
});
