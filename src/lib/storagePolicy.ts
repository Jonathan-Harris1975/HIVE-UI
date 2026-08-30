const EXCLUDED_R2_LANES = new Set(["art", "blog_images", "brand_assets"]);
const EXCLUDED_R2_BUCKETS = new Set(["podcastart", "blog-images", "brand-assets"]);

function normalise(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function normaliseBucket(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function isHiveManagedR2Source(
  lane: string | null | undefined,
  bucket?: string | null,
): boolean {
  return (
    !EXCLUDED_R2_LANES.has(normalise(lane)) &&
    !EXCLUDED_R2_BUCKETS.has(normaliseBucket(bucket))
  );
}
