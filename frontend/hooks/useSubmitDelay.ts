/**
 * Submit Delay Hook - 5-second countdown before allowing submission
 *
 * Usage:
 *   const { canSubmit, secondsRemaining } = useSubmitDelay();
 *
 *   <Button
 *     disabled={!canSubmit}
 *     title={canSubmit ? "Submit" : `Wait ${secondsRemaining}s`}
 *   />
 */

import { useState, useEffect } from "react";

interface UseSubmitDelayOptions {
  delaySeconds?: number;
  autoStart?: boolean;
}

export function useSubmitDelay(options: UseSubmitDelayOptions = {}) {
  const { delaySeconds = 5, autoStart = true } = options;

  const [secondsRemaining, setSecondsRemaining] = useState(delaySeconds);
  const [canSubmit, setCanSubmit] = useState(false);
  const [isActive, setIsActive] = useState(autoStart);

  useEffect(() => {
    if (!isActive) return;

    if (secondsRemaining <= 0) {
      setCanSubmit(true);
      return;
    }

    const timer = setTimeout(() => {
      setSecondsRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [secondsRemaining, isActive]);

  const reset = () => {
    setSecondsRemaining(delaySeconds);
    setCanSubmit(false);
    setIsActive(true);
  };

  const start = () => {
    setIsActive(true);
  };

  const cancel = () => {
    setIsActive(false);
    setSecondsRemaining(delaySeconds);
    setCanSubmit(false);
  };

  return {
    canSubmit,
    secondsRemaining,
    isActive,
    reset,
    start,
    cancel,
  };
}
