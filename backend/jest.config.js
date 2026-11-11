/**
 * Run the tests with `npm test`, not `npx jest`. The script starts Node with `--experimental-vm-modules`:
 * mongodb driver 7.6 and later load the `os` module with a dynamic `import()`, which fails inside Jest's
 * sandbox without it. The driver then sends an incomplete handshake and every connection to the
 * in-memory MongoDB times out (the hooks fail with "Exceeded timeout of 5000 ms").
 *
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,
  setupFiles: ["<rootDir>/jest.setup.js"],
};
