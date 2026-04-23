const { expect } = require('chai');
const child_process = require('child_process');
const builtinTools = require('../src/tools/builtin');

describe('run_bash timeout validation', () => {
  let lastTimeout;
  const originalExec = child_process.exec;

  before(() => {
    child_process.exec = (command, options, callback) => {
      lastTimeout = options.timeout;
      // Simulate successful execution
      setImmediate(() => callback(null, 'done', ''));
    };
  });

  after(() => {
    child_process.exec = originalExec;
  });

  it('should use default timeout of 120000 when timeout_ms is not provided', async () => {
    await builtinTools.run_bash.execute({ command: 'echo hello' });
    expect(lastTimeout).to.equal(120000);
  });

  it('should honor valid timeout_ms', async () => {
    await builtinTools.run_bash.execute({ command: 'echo hello', timeout_ms: 5000 });
    expect(lastTimeout).to.equal(5000);
  });

  it('should clamp timeout_ms to 600000', async () => {
    await builtinTools.run_bash.execute({ command: 'echo hello', timeout_ms: 1000000 });
    expect(lastTimeout).to.equal(600000);
  });

  it('should use default timeout for NaN', async () => {
    await builtinTools.run_bash.execute({ command: 'echo hello', timeout_ms: NaN });
    expect(lastTimeout).to.equal(120000);
  });

  it('should use default timeout for negative values', async () => {
    await builtinTools.run_bash.execute({ command: 'echo hello', timeout_ms: -100 });
    expect(lastTimeout).to.equal(120000);
  });

  it('should use default timeout for 0', async () => {
    await builtinTools.run_bash.execute({ command: 'echo hello', timeout_ms: 0 });
    expect(lastTimeout).to.equal(120000);
  });

  it('should use default timeout for non-numeric strings that result in NaN', async () => {
    await builtinTools.run_bash.execute({ command: 'echo hello', timeout_ms: 'invalid' });
    expect(lastTimeout).to.equal(120000);
  });

  it('should parse numeric strings', async () => {
    await builtinTools.run_bash.execute({ command: 'echo hello', timeout_ms: '5000' });
    expect(lastTimeout).to.equal(5000);
  });
});
