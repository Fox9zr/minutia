import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { СерииDetailContent } from "./series-detail-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("meeting_series")
    .select("name")
    .eq("id", id)
    .single();
  return { title: data?.name ?? "Серии" };
}

export default async function СерииDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <СерииDetailContent seriesId={id} />;
}
