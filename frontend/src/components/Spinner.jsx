/**
 * Spinner — animated loading indicator.
 * Used while fetches are in-flight.
 *
 * @param {Object}  props
 * @param {string}  [props.label] — accessible loading label shown below ring
 */
export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className="spinner-wrap" role="status" aria-label={label}>
      <div className="spinner-ring" />
      <span>{label}</span>
    </div>
  );
}
