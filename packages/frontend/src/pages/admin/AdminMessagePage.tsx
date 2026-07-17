import { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { Button, ButtonVariant } from "@/components/ui/button/Button";
import { FormGroup } from "@/components/ui/form/FormGroup";
import { Input } from "@/components/ui/input/Input";
import { StyledSelect, type SelectOption } from "@/components/ui/select/StyledSelect";
import {
  createMessage,
  type CreateMessageResponse,
} from "@/services/messageService";
import styles from "./AdminMessagePage.module.scss";

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

type AudienceMode = "all" | "selected";

interface Group {
  name: string;
  slug: string;
}

function formatCreateSuccess(result: CreateMessageResponse): string {
  if (result.scope === "all") {
    return "Meddelandet har skickats till alla körer.";
  }
  const n = result.count;
  if (n === 1) {
    return "Meddelandet har skickats till 1 kör.";
  }
  return `Meddelandet har skickats till ${n} körer.`;
}

function extractApiErrorMessage(error: unknown): string {
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
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Kunde inte skicka meddelandet.";
}

export const AdminMessagePage = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all");
  const [selectedGroups, setSelectedGroups] = useState<SelectOption[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchGroups = useCallback(async () => {
    setIsLoadingGroups(true);
    setGroupsError(null);

    const token = localStorage.getItem("authToken");
    if (!token) {
      setGroupsError("Du är inte inloggad.");
      setGroups([]);
      setIsLoadingGroups(false);
      return;
    }
    if (!ADMIN_API_URL?.trim()) {
      setGroupsError("Admin-API saknas (VITE_ADMIN_API_URL).");
      setGroups([]);
      setIsLoadingGroups(false);
      return;
    }

    try {
      const response = await axios.get<Group[]>(`${ADMIN_API_URL}/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = Array.isArray(response.data) ? response.data : [];
      const valid = list.filter(
        (g) => typeof g?.slug === "string" && g.slug.trim().length > 0
      );
      setGroups(valid);
      if (valid.length === 0) {
        setGroupsError("Inga körer hittades. Skapa en kör innan du skickar till valda.");
      }
    } catch (error) {
      console.error("Failed to fetch groups for message target", error);
      setGroups([]);
      setGroupsError(
        axios.isAxiosError(error) && !error.response
          ? "Kunde inte hämta körlistan (nätverksfel)."
          : "Kunde inte hämta körlistan."
      );
    } finally {
      setIsLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const groupOptions: SelectOption[] = useMemo(
    () =>
      groups.map((g) => ({
        value: g.slug,
        label: g.name?.trim() ? g.name : g.slug,
      })),
    [groups]
  );

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

    // Cost optimization: selecting every choir ≡ ALL (one DynamoDB write).
    if (groups.length > 0 && slugs.length === groups.length) {
      const selectedSet = new Set(slugs);
      const allMatch = groups.every((g) => selectedSet.has(g.slug));
      if (allMatch) {
        return ["ALL"];
      }
    }

    return Array.from(new Set(slugs));
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
    } catch (error) {
      console.error("Failed to create message", error);
      setStatusMessage({
        type: "error",
        message: extractApiErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedModeDisabled =
    isSubmitting ||
    (audienceMode === "selected" &&
      (isLoadingGroups || (groups.length === 0 && Boolean(groupsError))));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Meddelande</h1>
      <p className={styles.subtitle}>
        Skriv ett meddelande till alla körer eller till en eller flera specifika
        körer. Medlemmar ser det under fliken Aktuellt.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <fieldset className={styles.audienceFieldset}>
          <legend className={styles.audienceLegend}>Mottagare</legend>
          <div className={styles.audienceOptions} role="radiogroup" aria-label="Mottagare">
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="audience-mode"
                value="all"
                checked={audienceMode === "all"}
                onChange={() => setAudienceMode("all")}
                disabled={isSubmitting}
              />
              Alla körer
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="audience-mode"
                value="selected"
                checked={audienceMode === "selected"}
                onChange={() => setAudienceMode("selected")}
                disabled={isSubmitting}
              />
              Valda körer
            </label>
          </div>
        </fieldset>

        {audienceMode === "selected" && (
          <FormGroup
            label="Körer"
            htmlFor="message-targets"
            error={groupsError && groups.length === 0 ? groupsError : null}
          >
            <StyledSelect
              inputId="message-targets"
              isMulti
              options={groupOptions}
              value={selectedGroups}
              onChange={(opts) => setSelectedGroups(opts ? [...opts] : [])}
              placeholder={
                isLoadingGroups ? "Laddar körer…" : "Välj en eller flera körer…"
              }
              isDisabled={isSubmitting || isLoadingGroups || groupOptions.length === 0}
              isLoading={isLoadingGroups}
              closeMenuOnSelect={false}
              noOptionsMessage={() => "Inga körer att välja"}
            />
            {groups.length > 0 && selectedGroups.length === groups.length && (
              <p className={styles.hint}>
                Alla körer är valda — meddelandet skickas som ett gemensamt
                meddelande till alla (samma som &quot;Alla körer&quot;).
              </p>
            )}
          </FormGroup>
        )}

        <FormGroup label="Rubrik" htmlFor="message-title">
          <Input
            id="message-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            placeholder="Kort rubrik"
            disabled={isSubmitting}
          />
        </FormGroup>

        <FormGroup label="Meddelande" htmlFor="message-body">
          <textarea
            id="message-body"
            className={styles.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            required
            rows={8}
            placeholder="Skriv ditt meddelande…"
            disabled={isSubmitting}
          />
        </FormGroup>

        <Button
          type="submit"
          variant={ButtonVariant.Primary}
          disabled={selectedModeDisabled}
        >
          {isSubmitting ? "Skickar…" : "Skicka meddelande"}
        </Button>
      </form>

      {statusMessage && (
        <p
          className={
            statusMessage.type === "success" ? styles.success : styles.error
          }
          role="status"
        >
          {statusMessage.message}
        </p>
      )}
    </div>
  );
};
