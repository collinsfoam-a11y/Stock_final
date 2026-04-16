/**
 * usePerformanceMonitor Hook
 * Monitors app performance metrics and provides performance monitoring capabilities
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface PerformanceMetrics {
  fps?: number;
  memoryUsage?: number;
  renderTime?: number;
  jsHeapSize?: number;
}

interface PerformanceMonitorOptions {
  sampleInterval?: number;
  performanceThreshold?: number;
  enableMemoryMonitoring?: boolean;
}

interface PerformanceMonitorReturn {
  metrics: PerformanceMetrics;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  isMonitoring: boolean;
  performanceWarning: boolean;
}

/**
 * Hook for monitoring app performance metrics
 */
export function usePerformanceMonitor(
  options: PerformanceMonitorOptions = {},
): PerformanceMonitorReturn {
  const {
    sampleInterval = 1000,
    performanceThreshold = 30,
    enableMemoryMonitoring = true,
  } = options;

  const [metrics, setMetrics] = useState<PerformanceMetrics>({});
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [performanceWarning, setPerformanceWarning] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);

  const measurePerformance = useCallback(() => {
    const newMetrics: PerformanceMetrics = {};

    // FPS calculation
    const currentTime = performance.now();
    const deltaTime = currentTime - lastFrameTimeRef.current;

    if (deltaTime > 0) {
      const fps = Math.round(1000 / deltaTime);
      newMetrics.fps = fps;

      // Check for performance warning
      if (fps < performanceThreshold) {
        setPerformanceWarning(true);
      } else {
        setPerformanceWarning(false);
      }
    }

    // Memory usage (if available)
    if (enableMemoryMonitoring && (performance as any).memory) {
      const memory = (performance as any).memory;
      newMetrics.memoryUsage = memory.usedJSHeapSize;
      newMetrics.jsHeapSize = memory.totalJSHeapSize;
    }

    // Render time estimation
    newMetrics.renderTime = deltaTime;

    setMetrics(newMetrics);
    lastFrameTimeRef.current = currentTime;
    frameCountRef.current++;
  }, [performanceThreshold, enableMemoryMonitoring]);

  const startMonitoring = useCallback(() => {
    if (intervalRef.current) return;

    setIsMonitoring(true);
    frameCountRef.current = 0;
    lastFrameTimeRef.current = performance.now();

    intervalRef.current = setInterval(measurePerformance, sampleInterval);
  }, [sampleInterval, measurePerformance]);

  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsMonitoring(false);
    setPerformanceWarning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    metrics,
    startMonitoring,
    stopMonitoring,
    isMonitoring,
    performanceWarning,
  };
}
