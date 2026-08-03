// Regression test for the captureDisabled module-global cache poisoning.
//
// History: checkIgnoreAsync() used to memoise its result in a module-global
// `cachedIgnore`, and captureDisabled() returned that cached value on every
// later call. So any caller that set CC_HABITS_DISABLE once and then called
// checkIgnoreAsync() poisoned captureDisabled() for the rest of the process —
// it kept returning true even after the env var was cleared. In production this
// was masked because hooks are short-lived single-shot processes, but it broke
// tests sharing a vitest worker (one test flipping the env var stuck the flag
// for every subsequent test). The fix removed the cache entirely: both
// checkIgnoreAsync() and captureDisabled() recompute fresh on every call, and a
// caller that wants to avoid recomputing within one invocation passes the value
// explicitly via captureDisabled(cached). This test locks that fix.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureDisabled, checkIgnoreAsync } from '../src/hook';

describe('captureDisabled env-poisoning regression', () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    // chdir into a clean temp dir so the .cc-habits-ignore file probe in
    // checkIgnoreAsync() never picks up a real repo's ignore file.
    origCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-habits-cache-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env['CC_HABITS_DISABLE'];
  });

  it('does not cache the ignore result: clearing CC_HABITS_DISABLE after checkIgnoreAsync() un-disables capture', async () => {
    // 1) Set the env var that opts out of capture.
    process.env['CC_HABITS_DISABLE'] = '1';

    // 2) checkIgnoreAsync() is the call that used to poison the module-global
    //    cache with `true`. It must still report disabled while the env is set.
    expect(await checkIgnoreAsync()).toBe(true);
    //    And captureDisabled() agrees while the env var is still in place.
    expect(captureDisabled()).toBe(true);

    // 3) Clear the env var. The OLD buggy code returned `true` here from the
    //    stale module-global cache; the fix recomputes fresh and must observe
    //    that capture is no longer disabled.
    delete process.env['CC_HABITS_DISABLE'];

    // 4) captureDisabled() with no cached argument re-reads the env and must
    //    now return false. This is the assertion the original cache broke.
    expect(captureDisabled()).toBe(false);
  });
});
