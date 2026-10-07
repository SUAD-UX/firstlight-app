// ============================================================================
// Firstlight — root layout. Imports the global stylesheet (the rev4 board UI),
// sets page metadata + the link-preview (Open Graph / X card) fields, and
// renders <html><body>. Plain JS, no JSX — every file in this app can be
// verified with `node --check`.
//
// Link preview images are the Next.js file conventions:
//   app/opengraph-image.png  (1200x630)  -> og:image        (auto-wired)
//   app/twitter-image.png    (1200x630)  -> twitter:image   (auto-wired)
//   app/icon.png             (512x512)   -> favicon         (auto-wired)
// The images contain NO data (no prices, no verdicts) — only the brand, the
// question and the five names — because they are cached for days.
//
// NEXT_PUBLIC_SITE_URL (optional): set it in Vercel to the final production
// URL (e.g. https://firstlight-app.vercel.app or your custom domain) BEFORE
// the build, so the og:image/twitter:image absolute URLs resolve correctly.
// It is inlined at build time — changing it later needs a redeploy.
import "./globals.css";
import { createElement } from "react";

const TITLE = "Firstlight: is it executable overnight?";
const DESCRIPTION =
  "NVDA, TSLA, AAPL, MSFT, SPY: venue, all-in round-trip cost and tape " +
  "freshness, from recorded Bitget data.";

export const metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://firstlight-app.vercel.app"
  ),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Firstlight",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }) {
  return createElement("html", { lang: "en" },
    createElement("body", null, children));
}
