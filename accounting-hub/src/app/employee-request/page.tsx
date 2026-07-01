import { redirect } from 'next/navigation'

// The Employee Request form was renamed to Staff Request (/staff-request).
// Keep this path as a permanent redirect so old QR codes and bookmarks still work.
export default function EmployeeRequestRedirect() {
  redirect('/staff-request')
}
