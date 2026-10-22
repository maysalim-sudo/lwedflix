'use client';

import { useState, useEffect, RefObject } from 'react';

const useInView = (ref: RefObject<HTMLElement | null>, options?: IntersectionObserverInit) => {
  const [isIntersecting, setIntersecting] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [ref, options]);

  return isIntersecting;
};

export default useInView;
