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

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convexClient}>
      <App />
    </ConvexProvider>
  </React.StrictMode>,
);
