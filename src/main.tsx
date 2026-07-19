import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider } from "convex/react";
import "@fontsource/saira-condensed/600.css";
import "@fontsource/saira-condensed/700.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "./index.css";
import App from "./App";
import { convexClient } from "./lib/convexClient";
import { forceGate } from "./lib/platform/identity";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

/**
 * Last-line error boundary. The important case: a rotated ACCESS_CODE makes
 * every gated query throw "Access denied" — without this, the app would
 * white-screen with no way back. We reset to the identity gate instead.
 */
class AppBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (/access denied/i.test(message)) {
      forceGate(); // stored code is stale — re-prompt on reload
    }
    console.error("[app] crashed", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
          style={{ background: "var(--chassis)" }}
        >
          <span className="led on-alert" />
          <p className="silkscreen" style={{ fontSize: "0.7rem", color: "var(--ink-dim)" }}>
            signal lost — re-keying required
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="display-type rounded-md px-6 py-3 font-bold"
            style={{ background: "var(--tx)", color: "#141414", fontSize: "1.1rem" }}
          >
            RECONNECT
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppBoundary>
      <ConvexProvider client={convexClient}>
        <App />
      </ConvexProvider>
    </AppBoundary>
  </React.StrictMode>,
);
