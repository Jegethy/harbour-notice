"use client";

import { useEffect } from "react";

/**
 * Applies body[data-board] for the duration of the board routes.
 *
 * The hardening rules in globals.css (no selection, no zoom, no overscroll, no
 * caret) have to sit on <body>, which is owned by the root layout. Scoping them
 * with an attribute keeps the admin panel behaving like a normal web page.
 */
export function BoardBodyAttribute() {
  useEffect(() => {
    document.body.dataset.board = "true";
    return () => {
      delete document.body.dataset.board;
    };
  }, []);

  return null;
}
