import { useEffect, useState } from "react";
import { isProtoDesign, type ProtoDesign } from "./proto-design";

// Reads `data-proto` off <html> and re-renders when it changes.
//
// The observer is not optional. The harness stamps the attribute after the
// page has loaded as well as before it (screenshot.ts), and a value read once
// at mount would miss the post-load stamp entirely — the page would
// screenshot as the current dashboard while the filename claimed a
// prototype, which is the worst failure this whole exercise could have.
//
// Returns null in every real session, because nothing in the app writes the
// attribute.
export function useProtoDesign(): ProtoDesign | null {
  const [design, setDesign] = useState<ProtoDesign | null>(() => read());

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDesign(read()));
    observer.observe(root, { attributes: true, attributeFilter: ["data-proto"] });
    // The attribute can be stamped between the initial state and the
    // observer being attached; re-read once so that gap cannot swallow it.
    setDesign(read());
    return () => observer.disconnect();
  }, []);

  return design;
}

function read(): ProtoDesign | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.getAttribute("data-proto");
  return isProtoDesign(value) ? value : null;
}
