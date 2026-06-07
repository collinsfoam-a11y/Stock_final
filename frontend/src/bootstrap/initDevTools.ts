import { logger } from '@/services/logging';
export function initMonitoringAndDevTools(isDev: boolean): void {
  import("../services/sentry")
    .then(({ initSentry }) => {
      initSentry();
    })
    .catch((e) => {
      if (isDev) {
        logger.warn("Sentry init failed", e);
      }
    });

  if (!isDev) {
    return;
  }

  import("../services/devtools/reactotron")
    .then(({ initReactotron }) => {
      initReactotron();
    })
    .catch((e) => {
      logger.warn("Reactotron init failed", e);
    });

}

