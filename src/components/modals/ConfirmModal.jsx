import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Spinner } from '../common/States';

export default function ConfirmModal({ show, title = 'Are you sure?', message, confirmLabel = 'Confirm', danger, onConfirm, onClose, children, requireText }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const go = async () => { setBusy(true); try { await onConfirm(text); onClose(); } catch { /* caller shows the toast */ } finally { setBusy(false); setText(''); } };
  return (
    <Modal show={show} onHide={busy ? undefined : onClose} centered>
      <Modal.Header closeButton><Modal.Title>{title}</Modal.Title></Modal.Header>
      <Modal.Body>
        {message && <p className="mb-2">{message}</p>}
        {children}
        {requireText && (<><label className="form-label mt-2">{requireText}</label><input className="form-control" value={text} onChange={(e) => setText(e.target.value)} autoFocus /></>)}
      </Modal.Body>
      <Modal.Footer>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={go} disabled={busy || (requireText && text.trim().length < 5)}>{busy ? <Spinner /> : confirmLabel}</button>
      </Modal.Footer>
    </Modal>
  );
}
