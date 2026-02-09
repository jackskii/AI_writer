import { useState, useEffect } from 'react';

/**
 * Hook to detect virtual keyboard height on mobile devices.
 * Uses the visualViewport API to calculate the difference between
 * the initial viewport height and the current viewport height.
 * 
 * @returns {number} The keyboard height in pixels (0 when keyboard is hidden)
 */
export const useKeyboardHeight = (): number => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    // Check if visualViewport is supported
    if (!window.visualViewport) return;

    const viewport = window.visualViewport;
    
    // Store the initial height (when keyboard is closed)
    let initialHeight = viewport.height;

    const handleResize = () => {
      // Calculate keyboard height as the difference between initial and current height
      // Also account for the viewport offset (scroll position when keyboard opens)
      const currentHeight = viewport.height;
      const offsetTop = viewport.offsetTop;
      
      // When keyboard opens, the viewport height decreases
      // The difference is approximately the keyboard height
      const heightDiff = initialHeight - currentHeight - offsetTop;
      
      // Only set if positive (keyboard is open) and reasonable (less than 50% of screen)
      if (heightDiff > 50 && heightDiff < initialHeight * 0.5) {
        setKeyboardHeight(heightDiff);
      } else {
        setKeyboardHeight(0);
      }
    };

    // Also update initial height on orientation change
    const handleOrientationChange = () => {
      // Reset after orientation change settles
      setTimeout(() => {
        initialHeight = viewport.height;
        setKeyboardHeight(0);
      }, 300);
    };

    viewport.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return keyboardHeight;
};

export default useKeyboardHeight;
