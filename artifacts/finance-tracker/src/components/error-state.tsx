interface ErrorStateProps {
  message?: string;
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <div
      style={{
        padding: "32px 24px",
        textAlign: "center",
        border: "1px solid rgba(248,81,73,0.35)",
        borderLeft: "3px solid var(--ft-red)",
        background: "rgba(248,81,73,0.04)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--ft-red)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: message ? 8 : 0,
        }}
      >
        — ERROR —
      </div>
      {message && (
        <div
          style={{
            fontSize: 10,
            color: "var(--ft-red)",
            letterSpacing: "0.03em",
            opacity: 0.8,
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}
