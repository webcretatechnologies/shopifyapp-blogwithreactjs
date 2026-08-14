import { useParams, useNavigate, Navigate } from "react-router-dom";
import AdminPanel, { ADMIN_SECTIONS } from "../../components/admin/AdminPanel";

/**
 * /admin/:tab — one real, bookmarkable/shareable URL per Super Admin module (e.g.
 * /admin/dashboard, /admin/stores, /admin/pricing, /admin/emails, /admin/activities),
 * replacing the old single /admin?tab=... query-param approach.
 */
export default function AdminTabPage() {
  const { tab } = useParams();
  const navigate = useNavigate();

  if (!ADMIN_SECTIONS.includes(tab)) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <AdminPanel
      activeSection={tab}
      onNavigate={(section) => navigate(`/admin/${section}`)}
    />
  );
}
