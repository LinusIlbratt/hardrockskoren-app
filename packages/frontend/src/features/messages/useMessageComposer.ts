import { useEffect, useState, type FormEvent } from "react";
import {
  createMessage,
  type CreateMessageResponse,
} from "@/services/messageService";
import type { SelectOption } from "@/components/ui/select/StyledSelect";
import { extractMessageError } from "@/features/messages/messageAdminError";
import { useMessageTargetGroups } from "@/features/messages/useMessageTargetGroups";

export const TITLE_MAX = 120;
export const BODY_MAX = 4000;

type AudienceMode = "all" | "selected";

export function validateDraft(title: string, body: string): string | null {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle || !trimmedBody) {
    return "Fyll i både rubrik och meddelande.";
  }
  if (trimmedTitle.length > TITLE_MAX) {
    return `Rubriken får vara högst ${TITLE_MAX} tecken.`;
  }
  if (trimmedBody.length > BODY_MAX) {
    return `Texten får vara högst ${BODY_MAX} tecken.`;
  }
  return null;
}

function formatCreateSuccess(result: CreateMessageResponse): string {
  if (result.scope === "all") {
    return "Meddelandet har skickats till alla körer.";
  }
  const n = result.targets?.length ?? 0;
  if (n <= 1) {
    return "Meddelandet har skickats till 1 kör.";
  }
  return `Meddelandet har skickats till ${n} körer.`;
}

type UseMessageComposerOptions = {
  fetchSent: () => Promise<void>;
};

export function useMessageComposer({ fetchSent }: UseMessageComposerOptions) {
  const {
    groups,
    groupsError,
    isLoadingGroups,
    groupOptions,
    groupsBySlug,
  } = useMessageTargetGroups();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [selectedGroups, setSelectedGroups] = useState<SelectOption[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const resolveTargets = (): string[] | null => {
    if (audienceMode === "all") {
      return ["ALL"];
    }
    if (selectedGroups.length === 0) {
      return null;
    }

    const slugs = selectedGroups
      .map((o) => String(o.value).trim())
      .filter((s) => s.length > 0 && s.toUpperCase() !== "ALL");

    if (slugs.length === 0) {
      return null;
    }

    if (groups.length > 0 && slugs.length === groups.length) {
      const selectedSet = new Set(slugs);
      const allMatch = groups.every((g) => selectedSet.has(g.slug));
      if (allMatch) {
        return ["ALL"];
      }
    }

    return Array.from(new Set(slugs));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      setStatusMessage({
        type: "error",
        message: "Fyll i både rubrik och meddelande.",
      });
      return;
    }

    if (audienceMode === "selected" && isLoadingGroups) {
      setStatusMessage({
        type: "error",
        message: "Vänta tills körlistan har laddats.",
      });
      return;
    }

    if (audienceMode === "selected" && groupsError && groups.length === 0) {
      setStatusMessage({
        type: "error",
        message: groupsError,
      });
      return;
    }

    const targets = resolveTargets();
    if (!targets) {
      setStatusMessage({
        type: "error",
        message: "Välj minst en kör, eller byt till Alla körer.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createMessage({
        title: trimmedTitle,
        body: trimmedBody,
        targets,
      });
      setTitle("");
      setBody("");
      setSelectedGroups([]);
      setStatusMessage({
        type: "success",
        message: formatCreateSuccess(result),
      });
      await fetchSent();
    } catch (error) {
      console.error("Failed to create message", error);
      setStatusMessage({
        type: "error",
        message: extractMessageError(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedModeDisabled =
    isSubmitting ||
    (audienceMode === "selected" &&
      (isLoadingGroups || (groups.length === 0 && Boolean(groupsError))));

  return {
    groups,
    groupsError,
    isLoadingGroups,
    groupOptions,
    groupsBySlug,
    title,
    setTitle,
    body,
    setBody,
    audienceMode,
    setAudienceMode,
    selectedGroups,
    setSelectedGroups,
    isSubmitting,
    statusMessage,
    handleSubmit,
    selectedModeDisabled,
  };
}
