// Single source of truth for the per-file upload size limit, shared by the
// client UI (pre-check + the visible note) and the server routes.
//
// This MUST stay <= nginx's `client_max_body_size` for staff.sapphireclinicseast.org
// (currently 20M). A larger value here would let the browser send a file that
// nginx then rejects with an opaque 413 ("network error") at ~99%. Keep them in
// sync: if you raise this, raise the nginx directive too.
export const MAX_UPLOAD_MB = 20
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
