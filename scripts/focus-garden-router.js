// Client-side navigation for the standalone fictional preview's persistent GroveWorkspace.
import { createElement, lazy, Suspense, useMemo, useSyncExternalStore } from "react";

function subscribe(update) {
  window.addEventListener("popstate", update);
  return () => window.removeEventListener("popstate", update);
}

export function usePathname() {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, () => location.search);
  return useMemo(() => new URLSearchParams(search), [search]);
}

function push(href) {
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) return;
  history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

const router = { push };
export const useRouter = () => router;

export function Link({ href, prefetch, onClick, ...props }) {
  function follow(event) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.altKey ||
        event.metaKey || event.shiftKey || (props.target && props.target !== "_self")) return;
    event.preventDefault();
    push(href);
  }
  return createElement("a", { href, onClick: follow, ...props });
}

export function dynamic(load, { loading }) {
  const View = lazy(load);
  return props => createElement(Suspense, {
    fallback: loading ? createElement(loading) : null
  }, createElement(View, props));
}
