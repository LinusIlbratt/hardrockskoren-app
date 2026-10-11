import axios from "axios";
import { getApiErrorMessage } from "@/utils/apiError";

/** Samma texter som meddelandesidan visade före hook-utbrytningen. */
export function extractMessageError(
  error: unknown,
  fallback = "Kunde inte skicka meddelandet."
): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === "object" && "message" in data) {
      const msg = (data as { message: unknown }).message;
      if (typeof msg === "string" && msg.trim()) {
        return msg.trim();
      }
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return "Du har inte behörighet att skicka meddelanden.";
    }
    if (error.response?.status === 404) {
      return "En eller flera valda körer hittades inte.";
    }
    if (!error.response) {
      return "Kunde inte nå meddelandetjänsten. Kontrollera nätverk och API-URL.";
    }
  }
  return getApiErrorMessage(error, fallback);
}
