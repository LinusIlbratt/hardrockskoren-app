import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Button,
  ButtonVariant,
} from "@/components/ui/button/Button";
import { FormGroup } from "@/components/ui/form/FormGroup";
import { Modal } from "@/components/ui/modal/Modal";
import { StyledSelect, type SelectOption } from "@/components/ui/select/StyledSelect";
import styles from "./AddLibraryFolderToChoirsModal.module.scss";

const MATERIAL_API_URL = import.meta.env.VITE_MATERIAL_API_URL;
const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

type AudienceMode = "all_remaining" | "selected";

interface Group {
  name: string;
  slug: string;
}

type ChoirStatusResponse = {
  linked: { groupSlug: string; repertoireId: string }[];
  notLinked: string[];
  linkedCount: number;
  notLinkedCount: number;
};

type AddToChoirsResponse = {
  addedCount: number;
  skippedCount: number;
  failedCount: number;
  results: Array<
    | { groupSlug: string; status: "added"; repertoireId: string; linkedCount: number }
    | { groupSlug: string; status: "skipped"; repertoireId: string; reason: string }
    | { groupSlug: string; status: "failed"; message: string }
  >;
};

export type AddLibraryFolderToChoirsModalProps = {
  folderPath: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === "object" && "message" in data) {
      const msg = (data as { message: unknown }).message;
      if (typeof msg === "string" && msg.trim()) {
        const trimmed = msg.trim();
        if (/^not found$/i.test(trimmed)) {
          return "API-endpointen saknas ännu. Deploya material-api (och admin-authorizer) till samma stage.";
        }
        return trimmed;
      }
    }
    if (error.response?.status === 404) {
      return "API-endpointen saknas ännu. Deploya material-api (och admin-authorizer) till samma stage.";
    }
    if (error.response?.status === 403) {
      return "Du har inte behörighet att göra detta.";
    }
    if (!error.response) {
      return "Kunde inte nå servern. Saknas ny endpoint? Deploya material-api, eller kontrollera nätverk/API-URL.";
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

function authHeaders(): { Authorization: string } | null {
  const token = localStorage.getItem("authToken");
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function AddLibraryFolderToChoirsModal({
  folderPath,
  isOpen,
  onClose,
  onSuccess,
}: AddLibraryFolderToChoirsModalProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [linkedSlugs, setLinkedSlugs] = useState<Set<string>>(new Set());
  const [notLinkedSlugs, setNotLinkedSlugs] = useState<string[]>([]);
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all_remaining");
  const [selectedGroups, setSelectedGroups] = useState<SelectOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupsBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      map.set(g.slug, g.name || g.slug);
    }
    return map;
  }, [groups]);

  const availableOptions = useMemo(
    () =>
      notLinkedSlugs
        .map((slug) => ({
          value: slug,
          label: groupsBySlug.get(slug) ?? slug,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "sv")),
    [notLinkedSlugs, groupsBySlug]
  );

  const linkedNames = useMemo(
    () =>
      Array.from(linkedSlugs)
        .map((slug) => groupsBySlug.get(slug) ?? slug)
        .sort((a, b) => a.localeCompare(b, "sv")),
    [linkedSlugs, groupsBySlug]
  );

  const loadStatus = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) {
      setError("Saknar auth-token. Logga in igen.");
      return;
    }
    if (!MATERIAL_API_URL) {
      setError("Material-API saknas (VITE_MATERIAL_API_URL).");
      return;
    }
    if (!ADMIN_API_URL) {
      setError("Admin-API saknas (VITE_ADMIN_API_URL).");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSelectedGroups([]);
    setAudienceMode("all_remaining");

    try {
      const groupsRes = await axios.get<Group[]>(`${ADMIN_API_URL}/groups`, {
        headers,
      });
      const nextGroups = (groupsRes.data || [])
        .map((g) => ({
          name: (g.name || g.slug || "").trim(),
          slug: (g.slug || "").trim(),
        }))
        .filter((g) => g.slug.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, "sv"));

      setGroups(nextGroups);

      if (nextGroups.length === 0) {
        setLinkedSlugs(new Set());
        setNotLinkedSlugs([]);
        setError("Inga körer hittades. Skapa en kör först.");
        return;
      }

      const statusRes = await axios.post<ChoirStatusResponse>(
        `${MATERIAL_API_URL}/materials/library-folder-choir-status`,
        {
          folderPath,
          groupSlugs: nextGroups.map((g) => g.slug),
        },
        { headers }
      );

      const linked = new Set(
        (statusRes.data.linked || []).map((l) => l.groupSlug)
      );
      setLinkedSlugs(linked);
      setNotLinkedSlugs(statusRes.data.notLinked || []);
    } catch (err) {
      console.error("Failed to load choir folder status:", err);
      setError(
        extractApiErrorMessage(err, "Kunde inte hämta vilka körer som har mappen.")
      );
      setLinkedSlugs(new Set());
      setNotLinkedSlugs([]);
    } finally {
      setIsLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    if (isOpen && folderPath) {
      void loadStatus();
    }
  }, [isOpen, folderPath, loadStatus]);

  const resolveTargets = (): string[] | null => {
    if (audienceMode === "all_remaining") {
      return notLinkedSlugs.length > 0 ? notLinkedSlugs : null;
    }
    const selected = selectedGroups
      .map((o) => String(o.value).trim())
      .filter(Boolean);
    return selected.length > 0 ? selected : null;
  };

  const handleSubmit = async () => {
    const headers = authHeaders();
    if (!headers) {
      setError("Saknar auth-token. Logga in igen.");
      return;
    }

    const targets = resolveTargets();
    if (!targets) {
      setError(
        audienceMode === "all_remaining"
          ? "Alla körer har redan mappen."
          : "Välj minst en kör som saknar mappen."
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await axios.post<AddToChoirsResponse>(
        `${MATERIAL_API_URL}/materials/add-to-choirs`,
        { folderPath, groupSlugs: targets },
        { headers }
      );

      const { addedCount, skippedCount, failedCount, results } = res.data;
      const failedNames = (results || [])
        .filter((r) => r.status === "failed")
        .map((r) => groupsBySlug.get(r.groupSlug) ?? r.groupSlug);

      if (addedCount === 0 && failedCount > 0) {
        setError(
          `Kunde inte lägga till mappen${
            failedNames.length ? `: ${failedNames.join(", ")}` : "."
          }`
        );
        return;
      }

      const parts: string[] = [];
      if (addedCount > 0) {
        parts.push(
          addedCount === 1
            ? "Lade till mappen i 1 kör"
            : `Lade till mappen i ${addedCount} körer`
        );
      }
      if (skippedCount > 0) {
        parts.push(
          skippedCount === 1
            ? "1 kör hade den redan"
            : `${skippedCount} körer hade den redan`
        );
      }
      if (failedCount > 0) {
        parts.push(
          failedCount === 1
            ? `misslyckades för ${failedNames[0] ?? "1 kör"}`
            : `misslyckades för ${failedCount} körer`
        );
      }

      onSuccess(parts.join(". ") + ".");
      onClose();
    } catch (err) {
      console.error("Failed to add folder to choirs:", err);
      setError(
        extractApiErrorMessage(err, "Kunde inte lägga till mappen i körerna.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit =
    !isLoading &&
    !isSubmitting &&
    !error?.includes("Inga körer") &&
    (audienceMode === "all_remaining"
      ? notLinkedSlugs.length > 0
      : selectedGroups.length > 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title="Lägg till i körer"
      formMode
      closeOnEscape={!isSubmitting}
    >
      <div className={styles.body}>
        <p>
          Vill du lägga till mappen <strong>{folderPath}</strong> i körernas
          repertoar?
        </p>
        <p className={styles.hint}>
          Då skapas låten i valda körer från mediabiblioteket. Du behöver inte gå
          in i varje kör. Synka filer i efterhand med &quot;Uppdatera i alla
          körer&quot;.
        </p>

        {isLoading ? (
          <p className={styles.hint}>Hämtar körer…</p>
        ) : (
          <>
            {linkedNames.length > 0 ? (
              <>
                <p className={styles.hint}>
                  Redan i repertoaren ({linkedNames.length}):
                </p>
                <ul className={styles.linkedList}>
                  {linkedNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </>
            ) : !error ? (
              <p className={styles.hint}>Ingen kör har mappen ännu.</p>
            ) : null}

            {error && notLinkedSlugs.length === 0 && linkedNames.length === 0 ? null : notLinkedSlugs.length === 0 && !error ? (
              <p className={styles.hint}>
                Alla körer har redan den här mappen. Använd &quot;Uppdatera i
                alla körer&quot; om du vill synka filerna.
              </p>
            ) : notLinkedSlugs.length > 0 ? (
              <>
                <fieldset className={styles.audienceFieldset}>
                  <legend className={styles.audienceLegend}>Lägg till i</legend>
                  <div
                    className={styles.audienceOptions}
                    role="radiogroup"
                    aria-label="Vilka körer"
                  >
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="add-folder-audience"
                        value="all_remaining"
                        checked={audienceMode === "all_remaining"}
                        onChange={() => setAudienceMode("all_remaining")}
                        disabled={isSubmitting}
                      />
                      Alla som saknar mappen ({notLinkedSlugs.length})
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="add-folder-audience"
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
                  <FormGroup label="Körer" htmlFor="add-folder-targets">
                    <StyledSelect
                      inputId="add-folder-targets"
                      isMulti
                      options={availableOptions}
                      value={selectedGroups}
                      onChange={(opts) =>
                        setSelectedGroups(opts ? [...opts] : [])
                      }
                      placeholder="Välj en eller flera körer…"
                      isDisabled={isSubmitting || availableOptions.length === 0}
                      closeMenuOnSelect={false}
                      noOptionsMessage={() => "Inga körer kvar att välja"}
                    />
                  </FormGroup>
                )}
              </>
            ) : null}
          </>
        )}

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.actions}>
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            disabled={isSubmitting}
            onClick={onClose}
          >
            Avbryt
          </Button>
          <Button
            type="button"
            variant={ButtonVariant.Primary}
            isLoading={isSubmitting}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            Lägg till
          </Button>
        </div>
      </div>
    </Modal>
  );
}
