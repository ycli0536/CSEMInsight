import React, { useEffect, useRef, useState } from 'react';

interface SafeResponsiveContainerProps {
  children: React.ReactNode;
  minWidth?: number;
  minHeight?: number;
  debounce?: number;
  fallback?: React.ReactNode;
}

export const SafeResponsiveContainer: React.FC<SafeResponsiveContainerProps> = ({
  children,
  minWidth = 1,
  minHeight = 1,
  debounce = 100,
  fallback = <div>Loading chart...</div>,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const lastDimensionsRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = (width: number, height: number) => {
      const last = lastDimensionsRef.current;
      if (last.width === width && last.height === height) {
        return;
      }
      lastDimensionsRef.current = { width, height };
      setDimensions({ width, height });
    };

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        updateDimensions(width, height);
      }
    });

    observer.observe(containerRef.current);

    const { offsetWidth, offsetHeight } = containerRef.current;
    updateDimensions(offsetWidth, offsetHeight);

    return () => observer.disconnect();
  }, []);

  const isValidSize = dimensions.width >= minWidth && dimensions.height >= minHeight;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {isValidSize ? children : fallback}
    </div>
  );
};
