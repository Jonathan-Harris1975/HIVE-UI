import {
  ArrowLeft,
  BrainCircuit,
  ChevronDown,
  CheckSquare,
  ChevronRight,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileArchive,
  FileImage,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  Square,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { useNavigate } from "react-router";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import { useInspector } from "../context/InspectorContext";
import { apiFetch } from "../lib/api";
import { formatBytes, formatDate } from "../lib/format";
import { buildSkillApplyChatUrl, uploadSingleFile, uploadTextFile } from "./files/filesApi";
import {
  canChatWithObject,
  defaultSkillForm,
  extension,
  fileKey,
  fileName,
  isHiveSkillsDescriptorFolder,
  laneLabel,
  laneStatus,
  MAX_SELECTED_OBJECTS,
  responseMessage,
  rootPrefixForLane,
  selectedSourceForFile,
  selectionId,
  skillField,
  skillIdentifier,
  skillItems,
  skillMetadata,
  skillTitle,
  tagsFromInput,
  type PendingDelete,
  type SelectedAction,
  type SkillFromFileResponse,
  type SkillRegistrationForm,
  type UploadMode,
} from "./files/fileHelpers";
import type {
  FileDeleteResponse,
  FileListResponse,
  FileMetadataResponse,
  FileObject,
  FileReadResponse,
  FileSourceSelection,
  R2Lane,
  R2LanesResponse,
  SkillItem,
  SkillListResponse,
} from "../types/api";

function folderNameFromPrefix(folderPrefix: string): string {
  const clean = folderPrefix.replace(/\/$/, "");
  return clean.split("/").pop() || folderPrefix;
}

function deleteErrorMessage(response: FileDeleteResponse): string {
  if (typeof response.error === "string") return response.error;
  if (response.error?.message) return response.error.message;
  return response.message || "R2 delete failed.";
}

function FileIcon({ name }: { name: string }) {
  const suffix = extension(name);
  if (suffix === ".zip") return <FileArchive className="h-5 w-5" />;
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(suffix))
    return <FileImage className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

export function FilesPage() {
  const navigate = useNavigate();
  const { setPayload, setOpen } = useInspector();
  const [files, setFiles] = useState<FileObject[]>([]);
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [lanes, setLanes] = useState<R2Lane[]>([]);
  const [selectedLane, setSelectedLane] = useState("");
  const [prefix, setPrefix] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([]);
  const [lanesOpen, setLanesOpen] = useState(false);
  const [storage, setStorage] = useState("r2");
  const [loadingLanes, setLoadingLanes] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>("file");
  const [textFilename, setTextFilename] = useState("hive-note.txt");
  const [textContent, setTextContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [skillFile, setSkillFile] = useState<FileObject | null>(null);
  const [skillForm, setSkillForm] = useState<SkillRegistrationForm | null>(
    null,
  );
  const [registeringSkill, setRegisteringSkill] = useState(false);
  const [skillPickerFile, setSkillPickerFile] = useState<FileObject | null>(
    null,
  );
  const [skillOptions, setSkillOptions] = useState<SkillItem[]>([]);
  const [skillQuery, setSkillQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [selectedObjects, setSelectedObjects] = useState<
    Record<string, FileSourceSelection>
  >({});
  const [selectedAction, setSelectedAction] = useState<SelectedAction>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [deletingObjects, setDeletingObjects] = useState(false);
  const [selectingPrefix, setSelectingPrefix] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeLane = useMemo(
    () => lanes.find((lane) => lane.lane === selectedLane),
    [lanes, selectedLane],
  );
  const readableLanes = useMemo(
    () => lanes.filter((lane) => lane.readable),
    [lanes],
  );
  const configuredLaneCount = useMemo(
    () => lanes.filter((lane) => lane.configured).length,
    [lanes],
  );
  const canCreateSkillFromCurrentFolder = isHiveSkillsDescriptorFolder(
    selectedLane,
    prefix,
  );
  const selectedSources = useMemo(
    () => Object.values(selectedObjects),
    [selectedObjects],
  );
  const selectedLaneCount = useMemo(
    () => new Set(selectedSources.map((source) => source.lane)).size,
    [selectedSources],
  );
  const selectedWritable = useMemo(() => {
    if (!selectedSources.length) return false;
    return selectedSources.every(
      (source) => lanes.find((lane) => lane.lane === source.lane)?.writable,
    );
  }, [lanes, selectedSources]);
  const selectedCurrentFile = useMemo(() => {
    const first = selectedSources[0];
    if (!first || first.lane !== selectedLane) return null;
    return files.find((file) => fileKey(file) === first.object_key) ?? null;
  }, [files, selectedLane, selectedSources]);
  const selectedChatSupported = Boolean(
    selectedCurrentFile &&
    activeLane?.chat_supported &&
    canChatWithObject(selectedCurrentFile),
  );

  const loadLanes = useCallback(async () => {
    setLoadingLanes(true);
    try {
      const response = await apiFetch<R2LanesResponse>("/v1/files/r2-lanes");
      const nextLanes = response.lanes ?? [];
      setLanes(nextLanes);
      setSelectedLane((current) => {
        if (
          current &&
          nextLanes.some((lane) => lane.lane === current && lane.readable)
        )
          return current;
        return (
          nextLanes.find((lane) => lane.primary_upload_lane && lane.readable)
            ?.lane ||
          nextLanes.find((lane) => lane.readable)?.lane ||
          nextLanes.find((lane) => lane.configured)?.lane ||
          ""
        );
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The R2 lane registry could not be loaded.",
      );
    } finally {
      setLoadingLanes(false);
    }
  }, []);

  const loadObjects = useCallback(async () => {
    if (!selectedLane || !activeLane?.readable) {
      setFiles([]);
      setPrefixes([]);
      setNextCursor(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ prefix, limit: "100" });
      if (currentCursor) params.set("cursor", currentCursor);
      if (activeSearch) params.set("search", activeSearch);
      const response = await apiFetch<FileListResponse>(
        `/v1/files/r2/${encodeURIComponent(selectedLane)}/objects?${params.toString()}`,
      );
      if (!response.ok) throw new Error(responseMessage(response));
      setFiles(response.files ?? []);
      setPrefixes(response.prefixes ?? []);
      setStorage(response.storage ?? "r2");
      setNextCursor(response.next_cursor ?? null);
    } catch (caught) {
      setFiles([]);
      setPrefixes([]);
      setNextCursor(null);
      setError(
        caught instanceof Error ? caught.message : "Files could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeLane?.readable, activeSearch, currentCursor, prefix, selectedLane]);

  useEffect(() => {
    void loadLanes();
  }, [loadLanes]);

  useEffect(() => {
    const lane = lanes.find((item) => item.lane === selectedLane);
    if (!lane) return;
    setPrefix((current) => current || rootPrefixForLane(lane));
  }, [lanes, selectedLane]);

  useEffect(() => {
    void loadObjects();
  }, [loadObjects]);

  const breadcrumbs = useMemo(() => {
    const root = rootPrefixForLane(activeLane);
    const relative = prefix.startsWith(root)
      ? prefix.slice(root.length)
      : prefix;
    const parts = relative.split("/").filter(Boolean);
    return parts.map((part, index) => ({
      label: part,
      prefix: `${root}${parts.slice(0, index + 1).join("/")}/`,
    }));
  }, [activeLane, prefix]);

  function selectLane(lane: R2Lane) {
    setSelectedLane(lane.lane);
    setSelectedAction(null);
    setPrefix(rootPrefixForLane(lane));
    setSearchInput("");
    setActiveSearch("");
    setCurrentCursor(null);
    setCursorHistory([]);
    setNotice(null);
    setError(null);
  }

  function changePrefix(nextPrefix: string) {
    setPrefix(nextPrefix);
    setSelectedAction(null);
    setCurrentCursor(null);
    setCursorHistory([]);
    setActiveSearch("");
    setSearchInput("");
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setActiveSearch(searchInput.trim());
    setCurrentCursor(null);
    setCursorHistory([]);
  }

  function clearSearch() {
    setSearchInput("");
    setActiveSearch("");
    setCurrentCursor(null);
    setCursorHistory([]);
  }

  function nextPage() {
    if (!nextCursor) return;
    setCursorHistory((history) => [...history, currentCursor]);
    setCurrentCursor(nextCursor);
  }

  function previousPage() {
    setCursorHistory((history) => {
      if (!history.length) return history;
      const nextHistory = [...history];
      setCurrentCursor(nextHistory.pop() ?? null);
      return nextHistory;
    });
  }

  async function uploadFiles(selected: File[]) {
    if (!selected.length || !activeLane?.writable) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const uploaded: FileObject[] = [];
      for (const file of selected) {
        const response = await uploadSingleFile(file, selectedLane || "uploads");
        if (response.file) uploaded.push(response.file);
      }
      const readableKeys = uploaded
        .map((item) => fileKey(item))
        .filter(Boolean)
        .slice(0, 2);
      setNotice(
        `${selected.length} file${selected.length === 1 ? "" : "s"} uploaded to ${laneLabel(activeLane)} with human-readable R2 keys${readableKeys.length ? `: ${readableKeys.join(", ")}` : "."}`,
      );
      setPrefix(rootPrefixForLane(activeLane));
      setCurrentCursor(null);
      setCursorHistory([]);
      await loadObjects();
      setSelectedAction(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function uploadText(event: FormEvent) {
    event.preventDefault();
    if (!textFilename.trim() || !textContent.trim() || !activeLane?.writable)
      return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await uploadTextFile(
        textFilename.trim(),
        textContent,
        selectedLane || "uploads",
      );
      const key = response.file ? fileKey(response.file) : "";
      setNotice(
        `${textFilename.trim()} uploaded to ${laneLabel(activeLane)}${key ? ` as ${key}` : ""}.`,
      );
      setTextContent("");
      setPrefix(rootPrefixForLane(activeLane));
      setCurrentCursor(null);
      setCursorHistory([]);
      await loadObjects();
      setSelectedAction(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Text upload failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  async function inspect(file: FileObject) {
    const key = fileKey(file);
    setPayload({
      eyebrow: `${laneLabel(activeLane ?? { lane: selectedLane })} metadata`,
      title: fileName(file),
      description: key,
      rows: [],
      loading: true,
    });
    setOpen(true);
    try {
      const response = await apiFetch<FileMetadataResponse>(
        `/v1/files/r2/${encodeURIComponent(selectedLane)}/metadata?key=${encodeURIComponent(key)}`,
      );
      const metadata = response.metadata ?? file;
      setPayload({
        eyebrow: `${laneLabel(activeLane ?? { lane: selectedLane })} metadata`,
        title: fileName(metadata),
        description: fileKey(metadata),
        rows: [
          { label: "Lane", value: selectedLane },
          {
            label: "Access",
            value: response.access_mode || activeLane?.access_mode || "Unknown",
          },
          {
            label: "Bucket",
            value: String(metadata.bucket || activeLane?.bucket || "Unknown"),
          },
          {
            label: "Size",
            value: formatBytes(
              Number(metadata.size_bytes ?? metadata.size ?? 0),
            ),
          },
          {
            label: "Content type",
            value: String(metadata.content_type || "Unknown"),
          },
          {
            label: "Last modified",
            value: formatDate(String(metadata.last_modified || "")),
          },
          {
            label: "Text preview",
            value: response.preview_supported ? "Supported" : "Download only",
          },
          {
            label: "Chat",
            value: response.chat_supported
              ? "Supported"
              : "Unavailable for this object",
          },
        ],
        json: metadata,
      });
    } catch (caught) {
      setPayload({
        eyebrow: "Metadata error",
        title: fileName(file),
        description:
          caught instanceof Error
            ? caught.message
            : "Metadata could not be loaded.",
        json: file,
      });
    }
  }

  async function preview(file: FileObject) {
    const key = fileKey(file);
    setPayload({
      eyebrow: "Text preview",
      title: fileName(file),
      description: `${selectedLane} · ${key}`,
      rows: [{ label: "Status", value: "Extracting a bounded preview…" }],
    });
    setOpen(true);
    try {
      const response = await apiFetch<FileReadResponse>(
        `/v1/files/r2/${encodeURIComponent(selectedLane)}/read?key=${encodeURIComponent(key)}&max_chars=40000`,
      );
      setPayload({
        eyebrow: "Text preview",
        title: fileName(response.file ?? file),
        description: `${selectedLane} · ${key}`,
        rows: [
          {
            label: "Access",
            value: response.access_mode || activeLane?.access_mode || "Unknown",
          },
          {
            label: "Characters shown",
            value: String(response.content?.length ?? 0),
          },
        ],
        json: {
          preview: response.content ?? "",
          extraction: response.extraction ?? null,
          file: response.file ?? file,
        },
      });
    } catch (caught) {
      setPayload({
        eyebrow: "Preview unavailable",
        title: fileName(file),
        description:
          caught instanceof Error
            ? caught.message
            : "This object could not be previewed.",
      });
    }
  }

  function chatWith(file: FileObject) {
    const source = selectedSourceForFile(selectedLane, file);
    navigateToFileChat(
      [source],
      `Use ${source.name || source.object_key} with this file: `,
    );
  }

  function navigateToFileChat(
    sources: FileSourceSelection[],
    draft = "Use these files: ",
  ) {
    const params = new URLSearchParams({
      sources: JSON.stringify(sources),
      draft,
    });
    if (sources.length === 1) {
      params.set("lane", sources[0].lane);
      params.set("file", sources[0].object_key);
      if (sources[0].name) params.set("name", sources[0].name);
    }
    navigate(`/chat?${params.toString()}`);
  }

  function toggleObjectSelection(file: FileObject) {
    const source = selectedSourceForFile(selectedLane, file);
    const id = selectionId(source.lane, source.object_key);
    const alreadySelected = Boolean(selectedObjects[id]);
    if (!alreadySelected && selectedSources.length >= MAX_SELECTED_OBJECTS) {
      setNotice(`Selection is capped at ${MAX_SELECTED_OBJECTS} files to keep file chat inside the file chat limit.`);
      return;
    }
    setSelectedObjects((current) => {
      const next = { ...current };
      if (next[id]) delete next[id];
      else next[id] = source;
      return next;
    });
    setSelectedAction(null);
  }

  async function selectPrefixObjects(folderPrefix: string) {
    if (!selectedLane || !activeLane?.readable) return;
    const remaining = MAX_SELECTED_OBJECTS - selectedSources.length;
    if (remaining <= 0) {
      setNotice(`Selection is capped at ${MAX_SELECTED_OBJECTS} files. Clear a few before adding a folder.`);
      return;
    }
    setSelectingPrefix(folderPrefix);
    setError(null);
    setNotice(null);
    try {
      const params = new URLSearchParams({
        prefix: folderPrefix,
        limit: String(remaining),
        recursive: "true",
      });
      const response = await apiFetch<FileListResponse>(
        `/v1/files/r2/${encodeURIComponent(selectedLane)}/objects?${params.toString()}`,
      );
      if (!response.ok) throw new Error(responseMessage(response));
      const nextSources = (response.files ?? [])
        .map((file) => selectedSourceForFile(selectedLane, file))
        .filter((source) => source.object_key && !selectedObjects[selectionId(source.lane, source.object_key)])
        .slice(0, remaining);
      if (!nextSources.length) {
        setNotice(`No selectable files were found under ${folderNameFromPrefix(folderPrefix)}.`);
        return;
      }
      setSelectedObjects((current) => {
        const next = { ...current };
        for (const source of nextSources) {
          if (Object.keys(next).length >= MAX_SELECTED_OBJECTS) break;
          next[selectionId(source.lane, source.object_key)] = source;
        }
        return next;
      });
      setSelectedAction(null);
      setNotice(
        `${nextSources.length} file${nextSources.length === 1 ? "" : "s"} selected from ${folderNameFromPrefix(folderPrefix)}${response.truncated ? `; showing the first ${nextSources.length} within the ${MAX_SELECTED_OBJECTS}-file chat limit.` : "."}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Folder selection failed.");
    } finally {
      setSelectingPrefix(null);
    }
  }

  function clearSelectedObjects() {
    setSelectedObjects({});
    setSelectedAction(null);
  }

  function chatWithSelectedObjects() {
    if (!selectedSources.length) return;
    navigateToFileChat(
      selectedSources,
      `Use these ${selectedSources.length} files: `,
    );
  }

  async function deleteObjectsForLane(
    lane: string,
    objectKeys: string[],
  ): Promise<number> {
    const response = await apiFetch<FileDeleteResponse>(
      `/v1/files/r2/${encodeURIComponent(lane)}/objects`,
      {
        method: "DELETE",
        body: JSON.stringify({ object_keys: objectKeys }),
      },
    );
    if (!response.ok) throw new Error(deleteErrorMessage(response));
    return Number(response.deleted_count ?? objectKeys.length);
  }

  function requestDeleteSelectedObjects() {
    if (!selectedSources.length || !selectedWritable) return;
    setPendingDelete({ type: "selected" });
  }

  async function performDeleteSelectedObjects() {
    if (!selectedSources.length || !selectedWritable) return;
    setDeletingObjects(true);
    setError(null);
    setNotice(null);
    try {
      const grouped = selectedSources.reduce<Record<string, string[]>>(
        (accumulator, source) => {
          accumulator[source.lane] = [
            ...(accumulator[source.lane] ?? []),
            source.object_key,
          ];
          return accumulator;
        },
        {},
      );
      let deleted = 0;
      for (const [lane, objectKeys] of Object.entries(grouped)) {
        deleted += await deleteObjectsForLane(lane, objectKeys);
      }
      setNotice(
        `${deleted} selected object${deleted === 1 ? "" : "s"} deleted from R2.`,
      );
      clearSelectedObjects();
      await loadObjects();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Selected R2 objects could not be deleted.",
      );
    } finally {
      setDeletingObjects(false);
      setPendingDelete(null);
    }
  }

  function deleteOneObject(file: FileObject) {
    if (!activeLane?.writable) return;
    setPendingDelete({ type: "single", file });
  }

  async function performDeleteOneObject(file: FileObject) {
    if (!activeLane?.writable) return;
    const key = fileKey(file);
    setDeletingObjects(true);
    setError(null);
    setNotice(null);
    try {
      const deleted = await deleteObjectsForLane(selectedLane, [key]);
      setSelectedObjects((current) => {
        const next = { ...current };
        delete next[selectionId(selectedLane, key)];
        return next;
      });
      setNotice(
        `${deleted || 1} object deleted from ${laneLabel(activeLane)}.`,
      );
      await loadObjects();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "R2 object could not be deleted.",
      );
    } finally {
      setDeletingObjects(false);
      setPendingDelete(null);
    }
  }

  async function confirmDeleteObjects() {
    if (!pendingDelete) return;
    if (pendingDelete.type === "selected") {
      await performDeleteSelectedObjects();
      return;
    }
    await performDeleteOneObject(pendingDelete.file);
  }

  async function loadSkillOptions(query = skillQuery) {
    setLoadingSkills(true);
    setError(null);
    try {
      const trimmed = query.trim();
      const endpoint = trimmed
        ? `/v1/skills/search?q=${encodeURIComponent(trimmed)}&limit=50`
        : "/v1/skills/list?limit=50";
      const response = await apiFetch<SkillListResponse>(endpoint);
      const options = skillItems(response);
      setSkillOptions(options);
      setSelectedSkill((current) => {
        if (
          current &&
          options.some(
            (item, index) =>
              skillIdentifier(item, index) === skillIdentifier(current),
          )
        )
          return current;
        return options[0] ?? null;
      });
    } catch (caught) {
      setSkillOptions([]);
      setSelectedSkill(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Skills could not be loaded.",
      );
    } finally {
      setLoadingSkills(false);
    }
  }

  function openSkillPicker(file: FileObject) {
    setSkillPickerFile(file);
    setSkillQuery("");
    setSelectedSkill(null);
    setNotice(null);
    setError(null);
    void loadSkillOptions("");
  }

  function closeSkillPicker() {
    setSkillPickerFile(null);
    setSkillOptions([]);
    setSkillQuery("");
    setSelectedSkill(null);
  }

  function submitSkillSearch(event: FormEvent) {
    event.preventDefault();
    void loadSkillOptions(skillQuery);
  }

  function useSelectedSkillWithFile() {
    if (!skillPickerFile || !selectedSkill) return;
    const key = fileKey(skillPickerFile);
    const title = skillTitle(selectedSkill);
    const skillId = skillIdentifier(selectedSkill);
    const url = buildSkillApplyChatUrl({
      lane: selectedLane,
      fileKey: key,
      fileDisplayName: fileName(skillPickerFile),
      skillId,
      skillTitle: title,
    });
    navigate(url);
  }

  function openSkillRegistration(file: FileObject) {
    if (!canCreateSkillFromCurrentFolder) {
      setError(
        "Create skill from file is only available when browsing the HIVE skills lane under the skills/ folder.",
      );
      return;
    }
    setSkillFile(file);
    setSkillForm(defaultSkillForm(file, selectedLane || "hive_skills"));
    setError(null);
    setNotice(null);
  }

  function closeSkillRegistration() {
    if (registeringSkill) return;
    setSkillFile(null);
    setSkillForm(null);
  }

  function updateSkillForm<K extends keyof SkillRegistrationForm>(
    field: K,
    value: SkillRegistrationForm[K],
  ) {
    setSkillForm((current) =>
      current ? { ...current, [field]: value } : current,
    );
  }

  async function registerSkillFromSelectedFile() {
    const file = skillFile;
    const form = skillForm;
    const key = file ? fileKey(file) : "";
    const title = form?.title.trim() ?? "";
    if (!file || !key) return;
    if (!form || !title) {
      setError(
        "Give the skill a clear title before adding it to the catalogue.",
      );
      return;
    }
    setRegisteringSkill(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch<SkillFromFileResponse>(
        "/v1/skills/from-file",
        {
          method: "POST",
          body: JSON.stringify({
            title,
            object_key: key,
            source_lane: selectedLane || "uploads",
            description:
              form.description.trim() ||
              `Skill registered from uploaded file ${fileName(file)}.`,
            repo: form.repo.trim() || "HIVE",
            hive_lane: form.hiveLane.trim() || "uploaded-file-skills",
            priority_tier: form.priorityTier.trim() || "P2",
            risk_level: form.riskLevel,
            tags: tagsFromInput(form.tags),
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          response.message ||
            response.error_code ||
            "Skill registration failed.",
        );
      setNotice(
        `${title} has been registered from the HIVE skills folder. Open Skills from the main menu to search or use it.`,
      );
      setSkillFile(null);
      setSkillForm(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Skill registration failed.",
      );
    } finally {
      setRegisteringSkill(false);
    }
  }

  const downloadHref = (file: FileObject) =>
    `/api/v1/files/r2/${encodeURIComponent(selectedLane)}/download?key=${encodeURIComponent(fileKey(file))}`;
  const viewHref = (file: FileObject) =>
    `/api/v1/files/r2/${encodeURIComponent(selectedLane)}/view?key=${encodeURIComponent(fileKey(file))}`;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-3xl border border-white/8 bg-[#0a192d]/75 p-5 shadow-xl shadow-black/10 sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/70">
                Authenticated R2 explorer
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Browse evidence across the HIVE ecosystem
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Every configured R2 lane can be browsed, uploaded to and opened
                inline when the server-side credentials allow it. Upload keys
                now keep readable filenames.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLanesOpen((current) => !current)}
                aria-expanded={lanesOpen}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs text-slate-300 hover:bg-white/[0.06]"
              >
                <Database className="h-4 w-4" /> Storage map
                <ChevronDown
                  className={`h-3.5 w-3.5 transition ${lanesOpen ? "rotate-180" : ""}`}
                />
              </button>
              <button
                type="button"
                onClick={() => {
                  void loadLanes();
                  void loadObjects();
                }}
                className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs text-slate-300 hover:bg-white/[0.06]"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading || loadingLanes ? "animate-spin" : ""}`}
                />{" "}
                Refresh
              </button>
              {activeLane?.writable && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedAction((current) =>
                      current === "upload" ? null : "upload",
                    )
                  }
                  className="flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-3 text-xs font-medium text-cyan-100 hover:bg-cyan-300/12"
                >
                  <UploadCloud className="h-4 w-4" /> Upload
                </button>
              )}
            </div>
          </div>

          {lanesOpen && (
            <section
              className="mt-6 rounded-2xl border border-cyan-300/12 bg-[#071426]/75 p-4"
              aria-label="R2 ecosystem storage map"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Ecosystem storage map
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Select any readable lane to browse it. Writable lanes can
                    receive uploads from this console.
                  </p>
                </div>
                <StatusBadge
                  status="active"
                  label={`${readableLanes.length} readable · ${configuredLaneCount}/${lanes.length} configured`}
                  compact
                />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {lanes.map((lane) => {
                  const status = laneStatus(lane);
                  const selected = lane.lane === selectedLane;
                  return (
                    <article
                      key={lane.lane}
                      className={`rounded-xl border p-3 transition ${selected ? "border-cyan-300/30 bg-cyan-300/[0.055]" : "border-white/8 bg-[#061126]/80"}`}
                    >
                      <button
                        type="button"
                        disabled={!lane.readable}
                        onClick={() => selectLane(lane)}
                        className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-200">
                              {laneLabel(lane)}
                            </p>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">
                              {lane.description ||
                                "Configured ecosystem storage lane"}
                            </p>
                          </div>
                          <StatusBadge
                            status={status.status}
                            label={status.label}
                            compact
                          />
                        </div>
                        <p className="mt-2 truncate text-[11px] text-slate-500">
                          {lane.bucket || "No bucket configured"}
                        </p>
                      </button>
                      {lane.public_base_url && (
                        <a
                          href={lane.public_base_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-cyan-300/70 hover:text-cyan-200"
                        >
                          Public base <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <div className="mt-6 grid gap-4 border-t border-white/8 pt-5 lg:grid-cols-[minmax(220px,300px)_1fr]">
            <label className="text-xs font-medium text-slate-400">
              Storage lane
              <select
                value={selectedLane}
                disabled={loadingLanes}
                onChange={(event) => {
                  const lane = lanes.find(
                    (item) => item.lane === event.target.value,
                  );
                  if (lane) selectLane(lane);
                }}
                className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-200 outline-none focus:border-cyan-300/30"
              >
                {lanes.map((lane) => (
                  <option
                    key={lane.lane}
                    value={lane.lane}
                    disabled={!lane.readable}
                  >
                    {laneLabel(lane)} · {laneStatus(lane).label}
                  </option>
                ))}
              </select>
            </label>

            <form onSubmit={submitSearch} className="self-end">
              <label className="text-xs font-medium text-slate-400">
                Search within{" "}
                {laneLabel(activeLane ?? { lane: selectedLane || "storage" })}
                <div className="mt-2 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Search object names under the current prefix"
                      className="h-11 w-full rounded-xl border border-white/8 bg-[#061126] pl-10 pr-10 text-sm text-slate-200 outline-none placeholder:text-slate-400 focus:border-cyan-300/30"
                    />
                    {(searchInput || activeSearch) && (
                      <button
                        type="button"
                        onClick={clearSearch}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-300"
                        aria-label="Clear file search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="h-11 rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-4 text-xs font-medium text-cyan-100 hover:bg-cyan-300/12"
                  >
                    Search
                  </button>
                </div>
              </label>
            </form>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-[#061126]/70 px-3 py-2.5 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => changePrefix(rootPrefixForLane(activeLane))}
              className="rounded-md px-2 py-1 text-cyan-200/80 hover:bg-white/5 hover:text-cyan-100"
            >
              {laneLabel(activeLane ?? { lane: selectedLane || "root" })}
            </button>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.prefix} className="flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                <button
                  type="button"
                  onClick={() => changePrefix(crumb.prefix)}
                  className="max-w-[220px] truncate rounded-md px-2 py-1 hover:bg-white/5 hover:text-slate-300"
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            {activeSearch && (
              <span className="ml-auto rounded-full border border-cyan-300/15 bg-cyan-300/6 px-2.5 py-1 text-[11px] text-cyan-200">
                Search: {activeSearch}
              </span>
            )}
          </div>

          {(selectedSources.length > 0 || activeLane?.writable) && (
            // Mobile action strip intentionally uses flex-wrap below 480px, so actions wrap into compact rows rather than clipping the viewport.
            <div
              className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-white/8 bg-[#071426]/70 p-2"
              aria-label="Available file actions"
            >
              {selectedSources.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedAction("chat")}
                  className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium transition ${selectedAction === "chat" ? "bg-emerald-300/12 text-emerald-100" : "text-slate-300 hover:bg-white/[0.05]"}`}
                >
                  <MessageSquareText className="h-4 w-4" /> Chat
                </button>
              )}
              {selectedCurrentFile && (
                <button
                  type="button"
                  onClick={() => setSelectedAction("apply_skill")}
                  className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium transition ${selectedAction === "apply_skill" ? "bg-cyan-300/12 text-cyan-100" : "text-slate-300 hover:bg-white/[0.05]"}`}
                >
                  <BrainCircuit className="h-4 w-4" /> Apply skill
                </button>
              )}
              {selectedCurrentFile && canCreateSkillFromCurrentFolder && (
                <button
                  type="button"
                  onClick={() => setSelectedAction("create_skill")}
                  className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium transition ${selectedAction === "create_skill" ? "bg-violet-300/12 text-violet-100" : "text-slate-300 hover:bg-white/[0.05]"}`}
                >
                  <BrainCircuit className="h-4 w-4" /> Create skill
                </button>
              )}
              {activeLane?.writable && (
                <button
                  type="button"
                  onClick={() => setSelectedAction("upload")}
                  className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium transition ${selectedAction === "upload" ? "bg-cyan-300/12 text-cyan-100" : "text-slate-300 hover:bg-white/[0.05]"}`}
                >
                  <UploadCloud className="h-4 w-4" /> Upload
                </button>
              )}
            </div>
          )}

          {selectedAction === "chat" && selectedSources.length > 0 && (
            <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.045] p-4 text-sm text-emerald-50">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  <span className="font-semibold">
                    Chat with {selectedSources.length} selected object
                    {selectedSources.length === 1 ? "" : "s"}.
                  </span>{" "}
                  HIVE will carry the selected R2 references into the chat.
                </p>
                <button
                  type="button"
                  onClick={chatWithSelectedObjects}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 text-xs font-medium text-emerald-100 hover:bg-emerald-300/15"
                >
                  <MessageSquareText className="h-4 w-4" /> Open chat
                </button>
              </div>
              {!selectedChatSupported && selectedCurrentFile && (
                <p className="mt-2 text-[11px] text-emerald-100/65">
                  The first selected file may be download-only; HIVE will still
                  pass the R2 reference.
                </p>
              )}
            </div>
          )}

          {selectedAction === "apply_skill" && selectedCurrentFile && (
            <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] p-4 text-sm text-cyan-50">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  <span className="font-semibold">
                    Apply an existing skill to {fileName(selectedCurrentFile)}.
                  </span>{" "}
                  The file stays in R2; the skill becomes guidance for the
                  chat/workflow.
                </p>
                <button
                  type="button"
                  onClick={() => openSkillPicker(selectedCurrentFile)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-medium text-cyan-100 hover:bg-cyan-300/15"
                >
                  <BrainCircuit className="h-4 w-4" /> Select skill
                </button>
              </div>
            </div>
          )}

          {selectedAction === "create_skill" &&
            selectedCurrentFile &&
            canCreateSkillFromCurrentFolder && (
              <div className="mt-4 rounded-2xl border border-violet-300/15 bg-violet-300/[0.045] p-4 text-sm text-violet-50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    <span className="font-semibold">
                      Create a skill from {fileName(selectedCurrentFile)}.
                    </span>{" "}
                    This is only available in the HIVE skills lane under
                    skills/.
                  </p>
                  <button
                    type="button"
                    onClick={() => openSkillRegistration(selectedCurrentFile)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/10 px-3 text-xs font-medium text-violet-100 hover:bg-violet-300/15"
                  >
                    <BrainCircuit className="h-4 w-4" /> Create skill
                  </button>
                </div>
              </div>
            )}

          {activeLane?.writable && selectedAction === "upload" ? (
            <div className="mt-6 border-t border-white/8 pt-5">
              <div className="flex w-fit gap-1 rounded-xl border border-white/8 bg-[#071426] p-1">
                <button
                  type="button"
                  onClick={() => setUploadMode("file")}
                  className={`rounded-lg px-3 py-1.5 text-xs transition ${uploadMode === "file" ? "bg-cyan-300/10 text-cyan-100" : "text-slate-500 hover:text-slate-300"}`}
                >
                  File upload
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode("text")}
                  className={`rounded-lg px-3 py-1.5 text-xs transition ${uploadMode === "text" ? "bg-cyan-300/10 text-cyan-100" : "text-slate-500 hover:text-slate-300"}`}
                >
                  Paste text
                </button>
              </div>

              {uploadMode === "file" ? (
                <div
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (event.currentTarget === event.target)
                      setDragActive(false);
                  }}
                  onDrop={handleDrop}
                  className={`mt-4 rounded-2xl border border-dashed p-6 text-center transition ${dragActive ? "border-cyan-300/45 bg-cyan-300/[0.06]" : "border-white/10 bg-[#071426]/70"}`}
                >
                  {uploading ? (
                    <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
                  ) : (
                    <UploadCloud className="mx-auto h-8 w-8 text-cyan-300/70" />
                  )}
                  <p className="mt-3 text-sm font-medium text-slate-200">
                    Drop one or more files into {laneLabel(activeLane)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    HIVE will store them under readable date and filename based
                    R2 keys.
                  </p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035] disabled:opacity-50"
                  >
                    <FileUp className="h-4 w-4" /> Choose files
                  </button>
                  <input
                    ref={inputRef}
                    multiple
                    type="file"
                    className="hidden"
                    onChange={(event) =>
                      void uploadFiles(Array.from(event.target.files ?? []))
                    }
                  />
                </div>
              ) : (
                <form
                  onSubmit={uploadText}
                  className="mt-4 grid gap-3 rounded-2xl border border-white/8 bg-[#071426]/70 p-4"
                >
                  <label className="text-xs font-medium text-slate-400">
                    Filename
                    <input
                      value={textFilename}
                      onChange={(event) => setTextFilename(event.target.value)}
                      className="mt-2 h-10 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-200 outline-none focus:border-cyan-300/30"
                    />
                  </label>
                  <label className="text-xs font-medium text-slate-400">
                    Text content
                    <textarea
                      value={textContent}
                      onChange={(event) => setTextContent(event.target.value)}
                      rows={7}
                      placeholder="Paste notes, logs, transcripts or source text…"
                      className="mt-2 w-full resize-y rounded-xl border border-white/8 bg-[#061126] px-3 py-3 text-sm leading-6 text-slate-200 outline-none placeholder:text-slate-400 focus:border-cyan-300/30"
                    />
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={
                        uploading || !textFilename.trim() || !textContent.trim()
                      }
                      className="flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-300 px-4 text-xs font-semibold text-[#052035] disabled:opacity-50"
                    >
                      {uploading ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="h-4 w-4" />
                      )}{" "}
                      Upload text
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            activeLane &&
            !activeLane.writable && (
              <div className="mt-6 rounded-xl border border-cyan-300/12 bg-cyan-300/[0.035] px-4 py-3 text-xs leading-5 text-cyan-100/70">
                This lane is not writable with the current credentials. HIVE can
                still browse, preview, view, download and chat with supported
                objects.
              </div>
            )
          )}
        </section>

        {notice && (
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-200">
            {notice}
          </div>
        )}
        {error && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadObjects()}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 text-xs font-medium text-rose-50 hover:bg-rose-300/15"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />{" "}
              Retry
            </button>
          </div>
        )}

        {selectedSources.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.045] px-4 py-3 text-sm text-cyan-100 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-semibold">
                {selectedSources.length} object
                {selectedSources.length === 1 ? "" : "s"} selected
              </span>
              <span className="ml-2 text-cyan-100/65">
                across {selectedLaneCount} lane
                {selectedLaneCount === 1 ? "" : "s"} · max {MAX_SELECTED_OBJECTS}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={chatWithSelectedObjects}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 text-xs font-medium text-emerald-100 hover:bg-emerald-300/15"
              >
                <MessageSquareText className="h-4 w-4" /> Chat with selected
              </button>
              <button
                type="button"
                onClick={requestDeleteSelectedObjects}
                disabled={!selectedWritable || deletingObjects}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/8 px-3 text-xs font-medium text-rose-100 hover:bg-rose-300/12 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deletingObjects ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}{" "}
                Delete selected
              </button>
              <button
                type="button"
                onClick={clearSelectedObjects}
                className="inline-flex h-9 items-center rounded-xl border border-white/8 bg-white/[0.035] px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.06]"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <section className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <StatusBadge
                status={
                  activeLane?.writable
                    ? "active"
                    : activeLane?.readable
                      ? "readonly"
                      : "warning"
                }
                label={activeLane?.access_mode || storage}
                compact
              />{" "}
              {files.length} objects · {prefixes.length} prefixes
            </div>
            <div className="flex items-center gap-2">
              {cursorHistory.length > 0 && (
                <button
                  type="button"
                  onClick={previousPage}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Previous
                </button>
              )}
              {nextCursor && (
                <button
                  type="button"
                  onClick={nextPage}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 text-slate-400 hover:text-white"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div
                  key={item}
                  className="h-44 animate-pulse rounded-2xl border border-white/5 bg-white/[0.025]"
                />
              ))}
            </div>
          ) : !activeLane?.readable ? (
            <div className="rounded-3xl border border-dashed border-amber-300/15 py-16 text-center text-amber-100/60">
              <EmptyState
                icon={<Database className="h-8 w-8" />}
                title="Lane cannot be browsed"
                body="This lane is registry-only with the current credentials. Select another readable lane from the storage map."
              />
            </div>
          ) : prefixes.length === 0 && files.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 p-4">
              <EmptyState
                icon={<FolderOpen className="h-8 w-8" />}
                title="No matching objects found"
                body="This prefix is empty or the current search has no matches."
                action={
                  activeLane?.writable
                    ? {
                        label: "Upload a file",
                        onClick: () => setSelectedAction("upload"),
                      }
                    : undefined
                }
              />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {prefixes.map((folderPrefix) => {
                const name = folderNameFromPrefix(folderPrefix);
                const selectedInside = selectedSources.some(
                  (source) => source.lane === selectedLane && source.object_key.startsWith(folderPrefix),
                );
                const prefixBusy = selectingPrefix === folderPrefix;
                return (
                  <article
                    key={folderPrefix}
                    className={`group rounded-2xl border p-4 transition hover:border-cyan-300/20 hover:bg-[#0d2038] ${selectedInside ? "border-cyan-300/25 bg-cyan-300/[0.04]" : "border-white/8 bg-[#0a192d]/70"}`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300/15 bg-amber-300/7 text-amber-200">
                      <Folder className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 truncate text-sm font-semibold text-white">
                      {name}
                    </h3>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {folderPrefix}
                    </p>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500">
                      Select files from this folder without drilling into every nested prefix.
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/6 pt-3">
                      <button
                        type="button"
                        onClick={() => changePrefix(folderPrefix)}
                        className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.025] text-[11px] font-medium text-cyan-200/75 transition hover:bg-white/[0.05] hover:text-cyan-100"
                      >
                        Open <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void selectPrefixObjects(folderPrefix)}
                        disabled={prefixBusy || selectedSources.length >= MAX_SELECTED_OBJECTS}
                        className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-cyan-300/15 bg-cyan-300/6 text-[11px] font-medium text-cyan-100 transition hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {prefixBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                        Select files
                      </button>
                    </div>
                  </article>
                );
              })}

              {files.map((file) => {
                const key = fileKey(file);
                const name = fileName(file);
                const chatSupported = Boolean(
                  activeLane?.chat_supported && canChatWithObject(file),
                );
                const selected = Boolean(
                  selectedObjects[selectionId(selectedLane, key)],
                );
                return (
                  <article
                    key={key}
                    className={`group rounded-2xl border p-4 transition hover:border-cyan-300/20 hover:bg-[#0d2038] ${selected ? "border-cyan-300/35 bg-cyan-300/[0.055]" : "border-white/8 bg-[#0a192d]/70"}`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleObjectSelection(file)}
                        aria-pressed={selected}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition ${selected ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/8 bg-white/[0.025] text-slate-400 hover:text-slate-200"}`}
                      >
                        {selected ? (
                          <CheckSquare className="h-3.5 w-3.5" />
                        ) : (
                          <Square className="h-3.5 w-3.5" />
                        )}{" "}
                        Select
                      </button>
                      <StatusBadge
                        status={activeLane?.writable ? "active" : "readonly"}
                        label={
                          activeLane?.writable ? "Read/write" : "Read-only"
                        }
                        compact
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void inspect(file)}
                      className="block w-full text-left"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/7 text-cyan-200">
                        <FileIcon name={name} />
                      </div>
                      <h3 className="mt-4 truncate text-sm font-semibold text-white">
                        {name}
                      </h3>
                      <p className="mt-1 line-clamp-2 min-h-10 break-all text-xs leading-5 text-slate-400">
                        {key}
                      </p>
                      <div className="mt-4 flex items-center justify-between border-t border-white/6 pt-3 text-[11px] text-slate-400">
                        <span>
                          {formatBytes(
                            Number(file.size_bytes ?? file.size ?? 0),
                          )}
                        </span>
                        <span>
                          {formatDate(String(file.last_modified || ""))}
                        </span>
                      </div>
                    </button>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => void preview(file)}
                        disabled={!chatSupported}
                        className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.025] text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <FileText className="h-3.5 w-3.5" /> Preview
                      </button>
                      <a
                        href={viewHref(file)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.025] text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </a>
                      <a
                        href={downloadHref(file)}
                        className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.025] text-xs text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={!chatSupported}
                        onClick={() => chatWith(file)}
                        className="flex h-9 items-center justify-center gap-2 rounded-xl border border-emerald-300/15 bg-emerald-300/6 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/10 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <MessageSquareText className="h-4 w-4" />{" "}
                        {chatSupported ? "Chat" : "No chat"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openSkillPicker(file)}
                        className="flex h-9 items-center justify-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/6 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/10"
                      >
                        <BrainCircuit className="h-4 w-4" /> Use skill
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteOneObject(file)}
                        disabled={!activeLane?.writable || deletingObjects}
                        className="flex h-9 items-center justify-center gap-2 rounded-xl border border-rose-300/15 bg-rose-300/6 text-xs font-medium text-rose-100 transition hover:bg-rose-300/10 disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        {deletingObjects ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}{" "}
                        Delete
                      </button>
                    </div>
                    {canCreateSkillFromCurrentFolder && (
                      <button
                        type="button"
                        onClick={() => openSkillRegistration(file)}
                        className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-violet-300/15 bg-violet-300/6 text-xs font-medium text-violet-100 transition hover:bg-violet-300/10"
                      >
                        <BrainCircuit className="h-4 w-4" /> Create skill from
                        file
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {skillPickerFile && (
        <div className="fixed inset-0 z-50 flex items-end bg-[#020817]/80 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <section className="max-h-[92vh] w-full overflow-y-auto rounded-3xl border border-white/10 bg-[#08172b] p-5 shadow-2xl shadow-black/40 sm:max-w-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/75">
                  Apply existing skill
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Use a skill with this file
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Pick an existing HIVE skill. The file stays a file, and the
                  selected skill becomes guidance for chat/workflow analysis.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSkillPicker}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] text-slate-300 transition hover:text-white"
                aria-label="Close skill picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-cyan-300/12 bg-cyan-300/[0.035] px-4 py-3 text-xs leading-5 text-cyan-100/80">
              <span className="font-semibold text-cyan-100">
                Selected file:
              </span>{" "}
              {fileName(skillPickerFile)}
              <span className="mx-2 text-cyan-100/35">·</span>
              <span className="font-semibold text-cyan-100">Lane:</span>{" "}
              {selectedLane || "uploads"}
            </div>

            <form onSubmit={submitSkillSearch} className="mt-5 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={skillQuery}
                  onChange={(event) => setSkillQuery(event.target.value)}
                  placeholder="Search existing skills"
                  className="h-11 w-full rounded-xl border border-white/8 bg-[#061126] pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-cyan-300/40"
                />
              </div>
              <button
                type="submit"
                disabled={loadingSkills}
                className="flex h-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/12 disabled:opacity-50"
              >
                {loadingSkills ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  "Search"
                )}
              </button>
            </form>

            <div className="mt-4 grid max-h-80 gap-2 overflow-y-auto pr-1">
              {loadingSkills ? (
                <div className="flex items-center justify-center rounded-2xl border border-white/8 bg-white/[0.025] py-8 text-sm text-slate-300">
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading
                  skills
                </div>
              ) : skillOptions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-400">
                  No existing skills found for this search.
                </div>
              ) : (
                skillOptions.map((skill, index) => {
                  const id = skillIdentifier(skill, index);
                  const selected = selectedSkill
                    ? skillIdentifier(selectedSkill) === id
                    : false;
                  return (
                    <button
                      key={`${id}-${index}`}
                      type="button"
                      onClick={() => setSelectedSkill(skill)}
                      className={`rounded-2xl border p-3 text-left transition ${selected ? "border-cyan-300/35 bg-cyan-300/[0.07]" : "border-white/8 bg-[#061126]/75 hover:border-cyan-300/20 hover:bg-[#0d2038]"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-white">
                            {skillTitle(skill, index)}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">
                            {String(
                              skill.description ||
                                skillMetadata(skill).description ||
                                "No description supplied.",
                            )}
                          </p>
                        </div>
                        <StatusBadge
                          status={selected ? "active" : "readonly"}
                          label={
                            selected
                              ? "Selected"
                              : skillField(skill, "risk_level", "Skill")
                          }
                          compact
                        />
                      </div>
                      <p className="mt-2 truncate text-[11px] text-slate-400">
                        {skillField(skill, "repo", "Shared")} ·{" "}
                        {skillField(
                          skill,
                          "hive_lane",
                          skillField(skill, "lane", "General"),
                        )}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeSkillPicker}
                className="flex h-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] px-4 text-sm font-medium text-slate-200 transition hover:bg-white/[0.06]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={useSelectedSkillWithFile}
                disabled={!selectedSkill}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-4 text-sm font-semibold text-[#061126] transition disabled:opacity-50"
              >
                <BrainCircuit className="h-4 w-4" /> Use selected skill
              </button>
            </div>
          </section>
        </div>
      )}

      {skillFile && skillForm && (
        <div className="fixed inset-0 z-50 flex items-end bg-[#020817]/80 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center">
          <section className="max-h-[92vh] w-full overflow-y-auto rounded-3xl border border-white/10 bg-[#08172b] p-5 shadow-2xl shadow-black/40 sm:max-w-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200/70">
                  Hive skills folder only
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Create skill from descriptor file
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  This action is only available from the hive_skills lane under
                  the skills/ folder. Ordinary files should use an existing
                  skill instead.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSkillRegistration}
                disabled={registeringSkill}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] text-slate-300 transition hover:text-white disabled:opacity-40"
                aria-label="Close skill registration"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-cyan-300/12 bg-cyan-300/[0.035] px-4 py-3 text-xs leading-5 text-cyan-100/80">
              <span className="font-semibold text-cyan-100">
                Selected file:
              </span>{" "}
              {fileName(skillFile)}
              <span className="mx-2 text-cyan-100/35">·</span>
              <span className="font-semibold text-cyan-100">Lane:</span>{" "}
              {selectedLane || "uploads"}
            </div>

            <div className="mt-5 grid gap-4">
              <label className="text-xs font-medium text-slate-300">
                Skill title
                <input
                  value={skillForm.title}
                  onChange={(event) =>
                    updateSkillForm("title", event.target.value)
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-100 outline-none focus:border-violet-300/40"
                />
              </label>

              <label className="text-xs font-medium text-slate-300">
                Description
                <textarea
                  value={skillForm.description}
                  onChange={(event) =>
                    updateSkillForm("description", event.target.value)
                  }
                  rows={4}
                  placeholder="Explain what this skill should be used for…"
                  className="mt-2 w-full resize-y rounded-xl border border-white/8 bg-[#061126] px-3 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-400 focus:border-violet-300/40"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-300">
                  Repo
                  <select
                    value={skillForm.repo}
                    onChange={(event) =>
                      updateSkillForm("repo", event.target.value)
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-100 outline-none focus:border-violet-300/40"
                  >
                    <option value="HIVE">HIVE</option>
                    <option value="HIVE-UI">HIVE-UI</option>
                    <option value="AIMS">AIMS</option>
                    <option value="RAMS">RAMS</option>
                    <option value="Website">Website</option>
                    <option value="Shared">Shared</option>
                  </select>
                </label>

                <label className="text-xs font-medium text-slate-300">
                  Skill lane
                  <input
                    value={skillForm.hiveLane}
                    onChange={(event) =>
                      updateSkillForm("hiveLane", event.target.value)
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-100 outline-none focus:border-violet-300/40"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-300">
                  Priority
                  <select
                    value={skillForm.priorityTier}
                    onChange={(event) =>
                      updateSkillForm("priorityTier", event.target.value)
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-100 outline-none focus:border-violet-300/40"
                  >
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                    <option value="P3">P3</option>
                  </select>
                </label>

                <label className="text-xs font-medium text-slate-300">
                  Risk level
                  <select
                    value={skillForm.riskLevel}
                    onChange={(event) =>
                      updateSkillForm("riskLevel", event.target.value)
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-100 outline-none focus:border-violet-300/40"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>

              <label className="text-xs font-medium text-slate-300">
                Tags
                <input
                  value={skillForm.tags}
                  onChange={(event) =>
                    updateSkillForm("tags", event.target.value)
                  }
                  placeholder="uploaded-file, audits, brand-assets"
                  className="mt-2 h-11 w-full rounded-xl border border-white/8 bg-[#061126] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-violet-300/40"
                />
                <span className="mt-2 block text-[11px] leading-5 text-slate-400">
                  Comma-separated. These are used for search and routing, so
                  plain names beat cryptic goblin-code.
                </span>
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeSkillRegistration}
                disabled={registeringSkill}
                className="flex h-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] px-4 text-sm font-medium text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void registerSkillFromSelectedFile()}
                disabled={registeringSkill || !skillForm.title.trim()}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-300 to-cyan-300 px-4 text-sm font-semibold text-[#061126] transition disabled:opacity-50"
              >
                {registeringSkill ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <BrainCircuit className="h-4 w-4" />
                )}{" "}
                Confirm create skill
              </button>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={
          pendingDelete?.type === "single"
            ? "Delete R2 object"
            : "Delete selected R2 objects"
        }
        summary={
          pendingDelete?.type === "single"
            ? "This will remove the selected object from the configured R2 bucket."
            : "This will remove the selected objects from their configured R2 buckets."
        }
        objectName={
          pendingDelete?.type === "single"
            ? fileName(pendingDelete.file)
            : `${selectedSources.length} selected object${selectedSources.length === 1 ? "" : "s"}`
        }
        systems={[
          "Cloudflare R2 objects",
          "PostgreSQL file metadata records where mirrored",
        ]}
        confirmLabel={
          pendingDelete?.type === "single" ? "Delete object" : "Delete selected"
        }
        tone="destructive"
        busy={deletingObjects}
        onConfirm={() => void confirmDeleteObjects()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
