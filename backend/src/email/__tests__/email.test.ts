import { getEmailSender, setEmailSenderForTest } from "../index";
import { LogEmailSender } from "../logEmailSender";
import { SendGridEmailSender, sendGridFromEnv } from "../sendgridEmailSender";

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

describe("SendGridEmailSender", () => {
  it("sends through the client with the configured sender and the message fields", async () => {
    const client = { send: jest.fn().mockResolvedValue([{ statusCode: 202 }]) };
    await new SendGridEmailSender("alerts@tor.example", client).send({
      to: "ops@example.com",
      subject: "Run failed",
      text: "body",
    });

    expect(client.send).toHaveBeenCalledWith({
      to: "ops@example.com",
      from: "alerts@tor.example",
      subject: "Run failed",
      text: "body",
    });
  });

  it("passes html through only when the message has it", async () => {
    const client = { send: jest.fn().mockResolvedValue(undefined) };
    await new SendGridEmailSender("a@b.c", client).send({ to: "x@y.z", subject: "s", text: "t", html: "<p>t</p>" });
    expect(client.send.mock.calls[0]?.[0]).toMatchObject({ html: "<p>t</p>" });
  });

  it("lets a rejected send propagate so the caller can log it", async () => {
    const client = { send: jest.fn().mockRejectedValue(new Error("401 unauthorized")) };
    await expect(
      new SendGridEmailSender("a@b.c", client).send({ to: "x@y.z", subject: "s", text: "t" })
    ).rejects.toThrow("401 unauthorized");
  });

  it("refuses to build without an API key or a sender address", () => {
    process.env.EMAIL_DRIVER = "sendgrid";
    delete process.env.SENDGRID_API_KEY;
    process.env.EMAIL_FROM = "alerts@tor.example";
    expect(() => sendGridFromEnv()).toThrow("SENDGRID_API_KEY is required");

    process.env.SENDGRID_API_KEY = "SG.test";
    delete process.env.EMAIL_FROM;
    expect(() => sendGridFromEnv()).toThrow("EMAIL_FROM is required");
    delete process.env.SENDGRID_API_KEY;
  });

  it("is chosen by EMAIL_DRIVER=sendgrid", () => {
    process.env.EMAIL_DRIVER = "sendgrid";
    process.env.SENDGRID_API_KEY = "SG.test";
    process.env.EMAIL_FROM = "alerts@tor.example";
    setEmailSenderForTest(null);
    expect(getEmailSender()).toBeInstanceOf(SendGridEmailSender);
    delete process.env.SENDGRID_API_KEY;
    delete process.env.EMAIL_FROM;
  });
});
