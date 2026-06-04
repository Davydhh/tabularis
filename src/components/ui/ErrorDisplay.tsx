import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { TFunction } from "i18next";

interface ErrorDisplayProps {
  error: string;
  t: TFunction;
}

// Sentinel used by the Rust drivers to attach the actually-executed SQL to an
// error string. Kept in sync with `EXECUTED_QUERY_MARKER` in
// `src-tauri/src/drivers/common/query.rs` (a Unicode private-use code point
// that never appears in real SQL or error text).
const EXECUTED_QUERY_MARKER = "\uE000__TABULARIS_EXECUTED_QUERY__";

export function ErrorDisplay({ error, t }: ErrorDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showQuery, setShowQuery] = useState(false);

  // Peel off the executed-query block (if the driver attached one) before
  // applying the brief/detail split, so the SQL never leaks into the details.
  const markerIndex = error.indexOf(EXECUTED_QUERY_MARKER);
  const message = markerIndex === -1 ? error : error.slice(0, markerIndex);
  const executedQuery =
    markerIndex === -1
      ? ""
      : error.slice(markerIndex + EXECUTED_QUERY_MARKER.length);

  const separatorIndex = message.indexOf("\n\n");
  const hasDetails =
    separatorIndex !== -1 && separatorIndex < message.length - 2;
  const brief = hasDetails ? message.slice(0, separatorIndex) : message;
  const details = hasDetails ? message.slice(separatorIndex + 2) : "";

  return (
    <div className="p-4 text-red-400 font-mono text-sm bg-red-900/10 h-full overflow-auto">
      <div className="whitespace-pre-wrap">Error: {brief}</div>
      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-red-300/70 hover:text-red-300 transition-colors cursor-pointer"
          >
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showDetails
              ? t("editor.hideErrorDetails")
              : t("editor.showErrorDetails")}
          </button>
          {showDetails && (
            <div className="mt-2 whitespace-pre-wrap text-red-400/60 border-t border-red-400/20 pt-2">
              {details}
            </div>
          )}
        </>
      )}
      {executedQuery && (
        <>
          <button
            type="button"
            onClick={() => setShowQuery((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-red-300/70 hover:text-red-300 transition-colors cursor-pointer"
          >
            {showQuery ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showQuery
              ? t("editor.hideExecutedQuery")
              : t("editor.showExecutedQuery")}
          </button>
          {showQuery && (
            <pre className="mt-2 whitespace-pre-wrap text-red-300/80 bg-red-900/20 border border-red-400/20 rounded p-2 overflow-x-auto">
              {executedQuery}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
