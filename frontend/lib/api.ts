const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const locationId = typeof window !== "undefined"
    ? localStorage.getItem("biz44_active_location")
    : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (locationId) headers["x-location-id"] = locationId;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Something went wrong");
  return data;
}