import TripLoader from "@/components/TripLoader";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TripLoader tripId={id} />;
}
