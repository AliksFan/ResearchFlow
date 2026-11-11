"use client";

import { useEffect } from "react";

const SERVER_ACTION_REDIRECT_HEADER = "x-action-redirect";
const RSC_CONTENT_TYPE = "text/x-component";

export function ServerActionRedirectNavigation(): null {
  useEffect(() => {
    const nativeFetch = window.fetch;

    window.fetch = async (...arguments_: Parameters<typeof window.fetch>) => {
      const response = await nativeFetch(...arguments_);
      const redirect = response.headers.get(SERVER_ACTION_REDIRECT_HEADER);
      const contentType = response.headers.get("content-type");
      if (!redirect || !contentType?.startsWith(RSC_CONTENT_TYPE)) return response;
      const [location] = redirect.split(";", 1);
      if (!location || new URL(location, window.location.href).origin !== window.location.origin) return response;

      // A same-request Flight render can retain the pre-mutation tree. Removing
      // the RSC content type makes Next use its built-in full-navigation path.
      void response.body?.cancel().catch(() => undefined);
      const headers = new Headers(response.headers);
      headers.set("content-type", "text/plain; charset=utf-8");
      headers.delete("content-encoding");
      headers.delete("content-length");
      headers.delete("transfer-encoding");
      return new Response("", { status: response.status, statusText: response.statusText, headers });
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  return null;
}
