import { useState, useEffect } from 'react';

const FORCE_DESKTOP_KEY = 'force-desktop-mode';

/**
 * Custom hook to detect if the current viewport is mobile-sized.
 * Uses 768px as the breakpoint to match Tailwind's `md:` responsive prefix.
 * 
 * Users can force desktop mode by:
 * 1. Using browser's "Request Desktop Site" feature
 * 2. Setting localStorage key 'force-desktop-mode' to 'true'
 * 3. Adding ?desktop=1 to the URL
 * 
 * @returns {boolean} isMobile - true if viewport width < 768px AND not forcing desktop
 */
export const useMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(() => {
    // Initial check for SSR safety
    if (typeof window === 'undefined') return false;
    
    // Check if user is forcing desktop mode
    const forceDesktop = localStorage.getItem(FORCE_DESKTOP_KEY) === 'true';
    const urlParams = new URLSearchParams(window.location.search);
    const desktopParam = urlParams.get('desktop') === '1';
    
    if (forceDesktop || desktopParam) {
      // Store preference if set via URL
      if (desktopParam) {
        localStorage.setItem(FORCE_DESKTOP_KEY, 'true');
      }
      return false;
    }
    
    return window.innerWidth < 768;
  });

  useEffect(() => {
    const checkMobile = () => {
      // Check if user is forcing desktop mode
      const forceDesktop = localStorage.getItem(FORCE_DESKTOP_KEY) === 'true';
      const urlParams = new URLSearchParams(window.location.search);
      const desktopParam = urlParams.get('desktop') === '1';
      
      if (forceDesktop || desktopParam) {
        setIsMobile(false);
        return;
      }
      
      setIsMobile(window.innerWidth < 768);
    };

    // Check on mount
    checkMobile();

    // Listen for resize events
    window.addEventListener('resize', checkMobile);

    // Listen for storage changes (in case user toggles in another tab)
    window.addEventListener('storage', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('storage', checkMobile);
    };
  }, []);

  return isMobile;
};

/**
 * Toggle desktop mode on/off
 */
export const toggleDesktopMode = (): void => {
  if (typeof window === 'undefined') return;
  
  const current = localStorage.getItem(FORCE_DESKTOP_KEY) === 'true';
  if (current) {
    localStorage.removeItem(FORCE_DESKTOP_KEY);
  } else {
    localStorage.setItem(FORCE_DESKTOP_KEY, 'true');
  }
  
  // Reload to apply change
  window.location.reload();
};

/**
 * Check if desktop mode is forced
 */
export const isDesktopModeForced = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(FORCE_DESKTOP_KEY) === 'true';
};

export default useMobile;
