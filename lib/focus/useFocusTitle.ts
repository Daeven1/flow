"use client";

import { useEffect } from "react";

/** Keep the clock visible when switching tabs and restore the page title on exit. */
export function useFocusTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      if (document.title === title) document.title = previous;
    };
  }, [title]);
}
