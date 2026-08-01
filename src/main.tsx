import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider } from "convex/react";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
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
          style={{ background: "var(--canvas)" }}
        >
          <span className="led on-alert" />
          <p className="silkscreen" style={{ fontSize: "0.7rem", color: "var(--ink-dim)" }}>
            signal lost — re-keying required
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="pill on"
            style={{ fontSize: "1rem", padding: "12px 28px" }}
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
