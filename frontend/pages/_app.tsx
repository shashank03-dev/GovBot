import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageTransition from "@/components/PageTransition";
import Layout from "@/components/Layout";

type LenisInstance = {
  raf: (time: number) => void;
  destroy: () => void;
};

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let lenis: LenisInstance | null = null;

    void import("lenis")
      .then(({ default: Lenis }) => {
        if (cancelled) {
          return;
        }

        lenis = new Lenis({
          duration: 1.2,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        });

        function raf(time: number) {
          lenis?.raf(time);
          frameId = requestAnimationFrame(raf);
        }
        frameId = requestAnimationFrame(raf);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      lenis?.destroy();
    };
  }, []);

  return (
    <ErrorBoundary>
      <Layout>
        <PageTransition>
          <Component {...pageProps} />
        </PageTransition>
      </Layout>
    </ErrorBoundary>
  );
}
