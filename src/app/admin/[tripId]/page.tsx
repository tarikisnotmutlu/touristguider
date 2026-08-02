import AdminDashboard from "@/components/admin/AdminDashboard";

export default async function AdminPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <AdminDashboard tripId={tripId} />;
}
