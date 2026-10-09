import axios from "axios";
import { getApiErrorMessage } from "@/utils/apiError";

/** Samma texter som adminsidan visade före hook-utbrytningen. */
export function extractSharedConcertError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === "object" && "message" in data) {
      const msg = (data as { message: unknown }).message;
      if (typeof msg === "string" && msg.trim()) {
        return msg.trim();
      }
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return "Du har inte behörighet.";
    }
    if (!error.response) {
      return "Kunde inte nå konsert-API:t. Kontrollera nätverk och VITE_CONCERT_API_URL.";
    }
  }
  return getApiErrorMessage(error, fallback);
}
