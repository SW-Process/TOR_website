import { getEmailSender, setEmailSenderForTest } from "../index";
import { LogEmailSender } from "../logEmailSender";

const ORIGINAL_DRIVER = process.env.EMAIL_DRIVER;

afterEach(() => {
  setEmailSenderForTest(null);
  if (ORIGINAL_DRIVER === undefined) delete process.env.EMAIL_DRIVER;
  else process.env.EMAIL_DRIVER = ORIGINAL_DRIVER;
  jest.restoreAllMocks();
});

describe("getEmailSender", () => {
  it("defaults to the log driver", () => {
    delete process.env.EMAIL_DRIVER;
    expect(getEmailSender()).toBeInstanceOf(LogEmailSender);
  });

  it("throws on an unknown driver", () => {
    process.env.EMAIL_DRIVER = "carrier-pigeon";
    setEmailSenderForTest(null);
    expect(() => getEmailSender()).toThrow("unknown email driver: carrier-pigeon");
  });

  it("returns the test override until reset", () => {
    const fake = { send: jest.fn().mockResolvedValue(undefined) };
    setEmailSenderForTest(fake);
    expect(getEmailSender()).toBe(fake);
  });
});

describe("LogEmailSender", () => {
  it("logs the recipient and subject but not the body", async () => {
    const log = jest.spyOn(console, "info").mockImplementation(() => {});
    await new LogEmailSender().send({ to: "admin@example.com", subject: "Run failed", text: "secret body" });

    expect(log).toHaveBeenCalledWith('[email:log] to=admin@example.com subject="Run failed"');
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret body");
  });
});
