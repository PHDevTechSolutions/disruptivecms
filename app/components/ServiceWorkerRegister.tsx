"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("✅ SW registered:", registration);

          // Auto update when new version is available
          registration.onupdatefound = () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.onstatechange = () => {
                if (newWorker.state === "installed") {
                  if (navigator.serviceWorker.controller) {
                    console.log("🔄 New version available");
                  } else {
                    console.log("✅ Content cached for offline use");
                  }
                }
              };
            }
          };
        })
        .catch((err) => console.error("❌ SW registration failed:", err));
    }
  }, []);

  return null;
}
