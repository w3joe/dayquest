"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserId } from "../../lib/browser-id";

export type SpriteVerification = {
  url: string;
  status: "loading" | "ready" | "failed";
};

type Props = {
  url: string;
  onStatusChange: (verification: SpriteVerification) => void;
  onRegenerate?: () => void;
  disabled?: boolean;
  retained?: boolean;
};

// Each URL owns its loading state, including when a saved draft is restored.
export default function SpritePreview(props: Props) {
  return <SpriteImage key={props.url} {...props} />;
}

function SpriteImage({ url, onStatusChange, onRegenerate, disabled, retained }: Props) {
  const [requestUrl, setRequestUrl] = useState(url);
  const [result, setResult] = useState<{ status: SpriteVerification["status"]; error?: string }>({ status: "loading" });
  const image = useRef<HTMLImageElement>(null);
  const active = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useRef(onStatusChange);

  // An inline parent callback must not restart image verification or create an
  // effect loop when the parent stores the reported status.
  useEffect(() => { notify.current = onStatusChange; }, [onStatusChange]);
  useEffect(() => { notify.current({ url, status: result.status }); }, [url, result.status]);

  const verify = useCallback((loaded: HTMLImageElement) => {
    if (!active.current || loaded !== image.current) return;
    clearTimeout(timer.current);
    if (loaded.naturalWidth === 32 && loaded.naturalHeight === 48) {
      setResult({ status: "ready" });
    } else {
      setResult({ status: "failed", error: loaded.naturalWidth
        ? "This character has the wrong size. Retry character generation to create a new one."
        : "Your character image could not load. Reload it to try again." });
    }
  }, []);

  useEffect(() => {
    active.current = true;
    timer.current = setTimeout(() => {
      if (active.current) setResult({ status: "failed", error: "Your character image took too long to load. Check your connection and reload it." });
    }, 20_000);
    // Cached images can complete before React attaches the load listener.
    if (image.current?.complete) verify(image.current);
    return () => {
      active.current = false;
      clearTimeout(timer.current);
    };
  }, [requestUrl, verify]);

  function reload() {
    const next = new URL(url, window.location.href);
    next.searchParams.set("dq-reload", browserId());
    setResult({ status: "loading" });
    setRequestUrl(next.href);
  }

  return <div className="dq-sprite-status" style={{ flexWrap: "wrap" }} aria-live="polite" aria-busy={result.status === "loading"}>
    <img
      key={requestUrl}
      ref={image}
      src={requestUrl}
      width={32}
      height={48}
      alt="Your generated back-facing pixel character"
      hidden={result.status !== "ready"}
      onLoad={event => verify(event.currentTarget)}
      onError={event => {
        if (!active.current || event.currentTarget !== image.current) return;
        clearTimeout(timer.current);
        setResult({ status: "failed", error: "Your character image could not load. Check your connection and reload it." });
      }}
    />
    {result.status !== "ready" && <span className="dq-character-placeholder" aria-hidden="true">♟</span>}
    <div style={{ flex: "1 1 180px" }}>
      <strong>{result.status === "ready" ? retained ? "Your previous adventurer is saved." : "Your little adventurer is ready." : result.status === "loading" ? "Checking your character image…" : "Your character needs another look."}</strong>
      <span className={result.status === "failed" ? "dq-error" : undefined}>{result.error || (result.status === "ready" ? retained ? "Finish saving or discard your photo changes to continue." : "Same outfit. A whole new perspective." : "Making sure your saved character is ready for the adventure.")}</span>
    </div>
    {result.status === "ready" && <span className="dq-sprite-tick" aria-label="Character image verified">✓</span>}
    {result.status === "failed" && <>
      <button type="button" className="dq-small-button" disabled={disabled} onClick={reload}>Reload image</button>
      {onRegenerate && <button type="button" className="dq-small-button" disabled={disabled} onClick={onRegenerate}>Retry character</button>}
    </>}
  </div>;
}
