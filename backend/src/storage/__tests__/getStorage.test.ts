import { LocalDiskStorage } from "../localDiskStorage";
import { GcsStorage } from "../gcsStorage";
import { getStorage, setStorageForTest } from "../index";

afterEach(() => {
  setStorageForTest(null);
  delete process.env.STORAGE_DRIVER;
});

describe("getStorage", () => {
  it("defaults to LocalDiskStorage", () => {
    expect(getStorage()).toBeInstanceOf(LocalDiskStorage);
  });

  it("returns GcsStorage when STORAGE_DRIVER=gcs", () => {
    process.env.STORAGE_DRIVER = "gcs";
    process.env.GCS_BUCKET = "test-bucket";
    expect(getStorage()).toBeInstanceOf(GcsStorage);
  });

  it("memoises the instance", () => {
    expect(getStorage()).toBe(getStorage());
  });

  it("setStorageForTest overrides the instance", () => {
    const fake = {} as never;
    setStorageForTest(fake);
    expect(getStorage()).toBe(fake);
  });

  it("throws for an unknown driver", () => {
    process.env.STORAGE_DRIVER = "s3";
    expect(() => getStorage()).toThrow(/unknown storage driver/i);
  });
});

