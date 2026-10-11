import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { format } from "date-fns";
import {
  createSharedConcert,
  updateSharedConcert,
  type SharedConcert,
} from "@/services/concertService";
import { useMessageTargetGroups } from "@/features/messages/useMessageTargetGroups";
import { extractSharedConcertError } from "@/features/concerts/hooks/sharedConcertError";
import type {
  PatchSharedConcert,
  SharedConcertTab,
} from "@/features/concerts/hooks/useSharedConcertList";

function dateFromConcertDate(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

type AudienceMode = "all" | "selected";

function audienceFromConcert(concert: SharedConcert): {
  mode: AudienceMode;
  slugs: string[];
} {
  const slugs = (concert.targets ?? []).filter(
    (slug) => slug.trim() && slug.toUpperCase() !== "ALL"
  );
  if (concert.scope === "groups" && slugs.length > 0) {
    return { mode: "selected", slugs };
  }
  return { mode: "all", slugs: [] };
}

function sameSlugList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((slug, index) => slug === b[index]);
}

type UseSharedConcertFormOptions = {
  selected: SharedConcert | null;
  setSelected: Dispatch<SetStateAction<SharedConcert | null>>;
  patchConcert: PatchSharedConcert;
  fetchList: () => Promise<void>;
  setActiveTab: (tab: SharedConcertTab) => void;
};

export function useSharedConcertForm({
  selected,
  setSelected,
  patchConcert,
  fetchList,
  setActiveTab,
}: UseSharedConcertFormOptions) {
  const [title, setTitle] = useState("");
  const [concertDate, setConcertDate] = useState<Date | null>(null);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [targetSlugs, setTargetSlugs] = useState<string[]>([]);
  const [editAudienceMode, setEditAudienceMode] = useState<AudienceMode>("all");
  const [editTargetSlugs, setEditTargetSlugs] = useState<string[]>([]);
  const {
    groupsError,
    isLoadingGroups,
    groupOptions,
    groupsBySlug,
  } = useMessageTargetGroups();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [isEditingConcert, setIsEditingConcert] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [editLocation, setEditLocation] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const resetConcertEditor = () => {
    setIsEditingConcert(false);
    setEditError(null);
    setIsSavingEdit(false);
  };

  const startEditing = (concert: SharedConcert) => {
    setEditTitle(concert.title);
    setEditDate(dateFromConcertDate(concert.concertDate));
    setEditLocation(concert.location);
    setEditDescription(concert.description ?? "");
    const audience = audienceFromConcert(concert);
    setEditAudienceMode(audience.mode);
    setEditTargetSlugs(audience.slugs);
    setEditError(null);
    setIsEditingConcert(true);
  };

  const saveConcertEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || isSavingEdit) return;

    const trimmedTitle = editTitle.trim();
    const trimmedLocation = editLocation.trim();
    const trimmedDescription = editDescription.trim();
    if (!trimmedTitle) {
      setEditError("Titel krävs.");
      return;
    }
    if (trimmedTitle.length > 120) {
      setEditError("Titeln får vara högst 120 tecken.");
      return;
    }
    if (!editDate) {
      setEditError("Datum krävs.");
      return;
    }
    if (!trimmedLocation) {
      setEditError("Plats krävs.");
      return;
    }
    if (trimmedLocation.length > 120) {
      setEditError("Platsen får vara högst 120 tecken.");
      return;
    }
    if (trimmedDescription.length > 4000) {
      setEditError("Beskrivningen får vara högst 4000 tecken.");
      return;
    }
    if (editAudienceMode === "selected" && editTargetSlugs.length === 0) {
      setEditError("Välj minst en kör, eller välj alla körer.");
      return;
    }

    const concertDateIso = format(editDate, "yyyy-MM-dd");
    const previousDescription = selected.description?.trim() ?? "";
    const previousAudience = audienceFromConcert(selected);
    const unchanged =
      trimmedTitle === selected.title.trim() &&
      concertDateIso === selected.concertDate &&
      trimmedLocation === selected.location.trim() &&
      trimmedDescription === previousDescription &&
      editAudienceMode === previousAudience.mode &&
      (editAudienceMode === "all" ||
        sameSlugList(editTargetSlugs, previousAudience.slugs));
    if (unchanged) {
      setIsEditingConcert(false);
      setEditError(null);
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    try {
      const updated = await updateSharedConcert(selected.concertId, {
        title: trimmedTitle,
        concertDate: concertDateIso,
        location: trimmedLocation,
        description: trimmedDescription || null,
        version: selected.version ?? 1,
        scope: editAudienceMode === "selected" ? "groups" : "all",
        targets:
          editAudienceMode === "selected" ? editTargetSlugs : ["ALL"],
      });
      const next: SharedConcert = {
        ...selected,
        ...updated,
        description: updated.description,
        signupCount: updated.signupCount ?? selected.signupCount,
      };
      setSelected(next);
      patchConcert(next.concertId, (concert) => ({ ...concert, ...next }));
      setIsEditingConcert(false);
    } catch (error) {
      console.error("Failed to update shared concert", error);
      setEditError(
        extractSharedConcertError(error, "Kunde inte spara ändringarna.")
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedTitle = title.trim();
    const trimmedLocation = location.trim();
    if (!trimmedTitle) {
      setStatusMessage({ type: "error", message: "Titel krävs." });
      return;
    }
    if (!concertDate) {
      setStatusMessage({ type: "error", message: "Datum krävs." });
      return;
    }
    if (!trimmedLocation) {
      setStatusMessage({ type: "error", message: "Stad/plats krävs." });
      return;
    }
    if (audienceMode === "selected" && targetSlugs.length === 0) {
      setStatusMessage({
        type: "error",
        message: "Välj minst en kör, eller välj alla körer.",
      });
      return;
    }

    const concertDateIso = format(concertDate, "yyyy-MM-dd");

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      await createSharedConcert({
        title: trimmedTitle,
        concertDate: concertDateIso,
        location: trimmedLocation,
        description: description.trim() || undefined,
        scope: audienceMode === "selected" ? "groups" : "all",
        targets: audienceMode === "selected" ? targetSlugs : ["ALL"],
      });
      setTitle("");
      setConcertDate(null);
      setLocation("");
      setDescription("");
      setAudienceMode("all");
      setTargetSlugs([]);
      setStatusMessage({
        type: "success",
        message: "Giget har skapats.",
      });
      await fetchList();
      setActiveTab("list");
    } catch (error) {
      console.error("Failed to create shared concert", error);
      setStatusMessage({
        type: "error",
        message: extractSharedConcertError(error, "Kunde inte skapa giget."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    title,
    setTitle,
    concertDate,
    setConcertDate,
    location,
    setLocation,
    description,
    setDescription,
    audienceMode,
    setAudienceMode,
    targetSlugs,
    setTargetSlugs,
    editAudienceMode,
    setEditAudienceMode,
    editTargetSlugs,
    setEditTargetSlugs,
    groupOptions,
    groupsBySlug,
    groupsError,
    isLoadingGroups,
    isSubmitting,
    statusMessage,
    handleSubmit,
    isEditingConcert,
    editTitle,
    setEditTitle,
    editDate,
    setEditDate,
    editLocation,
    setEditLocation,
    editDescription,
    setEditDescription,
    editError,
    isSavingEdit,
    saveConcertEdit,
    resetConcertEditor,
    startEditing,
  };
}
