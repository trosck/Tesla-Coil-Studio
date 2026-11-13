import { CaptionButtons, WarningIcon } from './icons';

export const SAFETY_TEXT =
  "This application generates audio signals only. It does not control Tesla coil voltage or electrical power. Always follow the manufacturer's operating instructions. Tesla coils generate high voltage, UV radiation, electromagnetic interference, and potentially hazardous discharges. Never touch the coil or discharge area during operation.";

/** Always-visible safety "dialog" window under the main window. */
export function SafetyNotice() {
  return (
    <section className="win safety" aria-labelledby="safety-title">
      <div className="titlebar safety__titlebar">
        <h2 id="safety-title" className="safety__title">
          Safety
        </h2>
        <CaptionButtons closeOnly />
      </div>
      <div className="safety__body">
        <WarningIcon />
        <p>{SAFETY_TEXT}</p>
      </div>
    </section>
  );
}
