export const SAFETY_TEXT =
  "This application generates audio signals only. It does not control Tesla coil voltage or electrical power. Always follow the manufacturer's operating instructions. Tesla coils generate high voltage, UV radiation, electromagnetic interference, and potentially hazardous discharges. Never touch the coil or discharge area during operation.";

export function SafetyNotice() {
  return (
    <footer className="app-safety" role="note" aria-label="Safety notice">
      <span className="app-safety__badge" aria-hidden="true">
        ⚠ SAFETY
      </span>
      <p>{SAFETY_TEXT}</p>
    </footer>
  );
}
