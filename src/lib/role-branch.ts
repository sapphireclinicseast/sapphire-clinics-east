// Role → the single branch that role may see, or null for unrestricted roles.
//
// Branch-scoped accounts (AHEA/AHGH admin and front desk) exist so a branch sees
// its own operation and not the other's. That has to be enforced where the data
// is read, not by hiding a dropdown: a filter the client sends is a request, not
// a permission, and any of these accounts can call the API directly.
//
// Returns the Staff.branch short code ('SBEA' / 'SBGH'), which is what the
// scheduling routes filter on.

export function branchForRole(role: string | null | undefined): 'SBEA' | 'SBGH' | null {
  if (!role) return null
  if (role === 'AHEA_ADMIN' || role === 'AHEA_FRONT_DESK' || role.startsWith('SBEA_')) return 'SBEA'
  if (role === 'AHGH_ADMIN' || role === 'AHGH_FRONT_DESK' || role.startsWith('SBGH_')) return 'SBGH'
  return null
}
