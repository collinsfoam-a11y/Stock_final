/**
 * Web-only stub for @sentry-internal/replay.
 *
 * Session Replay is reachable from the @sentry/react-native entry purely by
 * static re-export (index.js does `export * from './integrations/exports'`,
 * which re-exports browserReplayIntegration -> @sentry/react replayIntegration
 * -> @sentry-internal/replay). Metro does not tree-shake, so ~300 kB of Replay
 * ships in the web common chunk.
 *
 * It is never instantiated: @sentry/react-native's default integration list
 * gates Replay on `replaysOnErrorSampleRate` / `replaysSessionSampleRate`
 * (dist/js/integrations/default.js), and Sentry.init() in app/_layout.tsx sets
 * neither, nor `_experiments`. So nothing here is ever called at runtime.
 *
 * IF YOU ENABLE SESSION REPLAY, REMOVE THIS STUB. Setting a replay sample rate
 * without removing the alias in metro.config.js would silently no-op instead of
 * recording. The factory below throws rather than returning a fake integration
 * so that misconfiguration fails loudly at startup instead of going unnoticed.
 */

function replayUnavailable() {
  throw new Error(
    "Session Replay is stubbed out of the web bundle (see " +
      "scripts/stubs/sentry-replay-web-stub.js). Remove the metro.config.js " +
      "alias to enable it.",
  );
}

const replayIntegration = replayUnavailable;
const getReplay = () => undefined;

module.exports = {
  replayIntegration,
  getReplay,
  // Named exports vary across @sentry/replay versions; anything else resolves
  // to undefined, which is correct for a module that is never exercised.
};
