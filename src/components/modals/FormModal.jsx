import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Spinner } from '../common/States';
import { errMsg, fieldErrors } from '../../services/api';
import { useToast } from '../../context/ToastContext';

/**
 * Generic form modal. Parent supplies `initial`, `onSubmit(values)` (throws on failure) and render prop `children({values, set, errors})`.
 * Server-side validation errors are mapped back onto fields.
 */
export default function FormModal({ show, title, initial, onSubmit, onClose, children, submitLabel = 'Save', size = 'lg', validate }) {
  const toast = useToast();
  const [values, setValues] = useState(initial || {});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  // Reset the form synchronously when the modal opens (setState-during-render), so the first
  // render of `children` never sees stale values from the previous use (avoids undefined-field crashes).
  const [wasShown, setWasShown] = useState(false);
  if (show !== wasShown) { setWasShown(show); if (show) { setValues(initial || {}); setErrors({}); } }
  const set = (k, v) => { setValues((s) => ({ ...s, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); };
  const setMany = (o) => setValues((s) => ({ ...s, ...o }));

  const submit = async (e) => {
    e.preventDefault();
    const local = validate ? validate(values) : {};
    if (Object.keys(local).length) { setErrors(local); toast.error('Please fix the highlighted fields'); return; }
    setBusy(true);
    try { await onSubmit(values); onClose(true); } catch (err) { setErrors(fieldErrors(err)); toast.error(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <Modal show={show} onHide={busy ? undefined : () => onClose(false)} size={size} centered scrollable backdrop="static">
      <form onSubmit={submit} noValidate>
        <Modal.Header closeButton><Modal.Title>{title}</Modal.Title></Modal.Header>
        <Modal.Body>{show && wasShown && children({ values, set, setMany, errors })}</Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : submitLabel}</button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
