import { Navigate } from "react-router-dom";

// Bare /admin now redirects to its default module — real per-module URLs live at
// /admin/:tab (see pages/admin/[tab].jsx), e.g. /admin/dashboard, /admin/stores.
export default function Admin() {
  return <Navigate to="/admin/dashboard" replace />;
}
