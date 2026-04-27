import React from "react";

const getRemainingSeconds = (cooldownUntil: number | null) => {
  if (!cooldownUntil) {
    return 0;
  }

  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
};

export function useAuthRetryCooldown() {
  const [cooldownUntil, setCooldownUntil] = React.useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = React.useState(0);

  React.useEffect(() => {
    if (!cooldownUntil) {
      setRemainingSeconds(0);
      return;
    }

    const syncCountdown = () => {
      const nextRemaining = getRemainingSeconds(cooldownUntil);
      setRemainingSeconds(nextRemaining);

      if (nextRemaining <= 0) {
        setCooldownUntil(null);
      }
    };

    syncCountdown();
    const intervalId = setInterval(syncCountdown, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [cooldownUntil]);

  const startCooldown = React.useCallback((retryAfter?: number) => {
    if (!retryAfter || retryAfter <= 0) {
      return;
    }

    setCooldownUntil(Date.now() + retryAfter * 1000);
  }, []);

  const clearCooldown = React.useCallback(() => {
    setCooldownUntil(null);
    setRemainingSeconds(0);
  }, []);

  return {
    isCooldownActive: remainingSeconds > 0,
    remainingSeconds,
    startCooldown,
    clearCooldown,
  };
}
