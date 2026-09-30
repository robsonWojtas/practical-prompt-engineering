"use strict";

// Metadata helpers

/** @typedef {{min: number, max: number, confidence: 'high'|'medium'|'low'}} TokenEstimate */
/** @typedef {{model: string, createdAt: string, updatedAt: string, tokenEstimate: TokenEstimate}} MetadataObject */

function validateModel(modelName) {
  if (typeof modelName !== "string" || !modelName.trim()) {
    throw new TypeError("Model name must be a non-empty string.");
  }
  if (modelName.length > 100) {
    throw new RangeError("Model name must be at most 100 characters.");
  }
}

function validateTimestamp(value, field) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new TypeError(`${field} must be a valid ISO 8601 date (YYYY-MM-DDTHH:mm:ss.sssZ).`);
  }
}

function tokenConfidence(min, max) {
  const tokens = Math.max(min, max);
  return tokens < 1000 ? "high" : tokens <= 5000 ? "medium" : "low";
}

/** Calculate the specified heuristic exactly, without rounding. */
function estimateTokens(text, isCode = false) {
  if (typeof text !== "string") {
    throw new TypeError("Token estimate text must be a string.");
  }
  if (typeof isCode !== "boolean") {
    throw new TypeError("isCode must be a boolean.");
  }
  const wordCount = text.trim() ? text.trim().split(/\s+/u).length : 0;
  const multiplier = isCode ? 1.3 : 1;
  const min = 0.75 * wordCount * multiplier;
  const max = 0.25 * text.length * multiplier;
  return { min, max, confidence: tokenConfidence(min, max) };
}

/** @returns {MetadataObject} */
function trackModel(modelName, content) {
  validateModel(modelName);
  const tokenEstimate = estimateTokens(content);
  const createdAt = new Date().toISOString();
  return { model: modelName, createdAt, updatedAt: createdAt, tokenEstimate };
}

function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new TypeError("Metadata must be an object.");
  }
  validateModel(metadata.model);
  validateTimestamp(metadata.createdAt, "createdAt");
  validateTimestamp(metadata.updatedAt, "updatedAt");
  if (metadata.updatedAt < metadata.createdAt) {
    throw new RangeError("updatedAt must be greater than or equal to createdAt.");
  }
  const estimate = metadata.tokenEstimate;
  if (!estimate || !Number.isFinite(estimate.min) || !Number.isFinite(estimate.max) ||
      estimate.min < 0 || estimate.max < 0 ||
      estimate.confidence !== tokenConfidence(estimate.min, estimate.max)) {
    throw new TypeError("tokenEstimate must contain finite non-negative min/max values and matching confidence.");
  }
}

/** Return a new metadata object; leave the input unchanged. */
function updateTimestamps(metadata) {
  validateMetadata(metadata);
  const updatedAt = new Date().toISOString();
  if (updatedAt < metadata.createdAt) {
    throw new RangeError("updatedAt must be greater than or equal to createdAt. Check the system clock.");
  }
  return { ...metadata, updatedAt, tokenEstimate: { ...metadata.tokenEstimate } };
}

// Export/import validation and storage

const PromptTransfer = (() => {
  const VERSION = 1;
  const BACKUP_KEY = "prompt-library-import-backup";
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  function nonempty(value, field) {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
  }
  function validatePrompts(prompts) {
    if (!Array.isArray(prompts)) throw new Error("prompts must be an array.");
    const ids = new Set();
    prompts.forEach((prompt, index) => {
      try {
        if (!object(prompt)) throw new Error("Must be an object.");
        for (const field of ["id", "title", "content"]) nonempty(prompt[field], field);
        if (ids.has(prompt.id)) throw new Error(`Duplicate prompt ID: ${prompt.id}.`);
        ids.add(prompt.id);
        validateMetadata(prompt.metadata);
        if (!Number.isInteger(prompt.rating) || prompt.rating < 0 || prompt.rating > 5) {
          throw new Error("rating must be an integer from 0 (unrated) to 5.");
        }
        // Older saved prompts may not have the code flag; preserve that absence.
        if (prompt.isCode !== undefined && typeof prompt.isCode !== "boolean") throw new Error("isCode must be a boolean.");
        if (!Array.isArray(prompt.notes)) throw new Error("notes must be an array.");
        const noteIds = new Set();
        prompt.notes.forEach((note, noteIndex) => {
          if (!object(note)) throw new Error(`notes[${noteIndex}] must be an object.`);
          nonempty(note.id, `notes[${noteIndex}].id`);
          nonempty(note.content, `notes[${noteIndex}].content`);
          if (noteIds.has(note.id)) throw new Error(`Duplicate note ID: ${note.id}.`);
          noteIds.add(note.id);
        });
      } catch (error) {
        throw new Error(`prompts[${index}]: ${error.message}`);
      }
    });
    return prompts;
  }
  function statistics(prompts) {
    const rated = prompts.filter((prompt) => prompt.rating > 0);
    const models = new Map();
    for (const prompt of prompts) models.set(prompt.metadata.model, (models.get(prompt.metadata.model) || 0) + 1);
    const ranked = [...models].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return {
      totalPrompts: prompts.length,
      averageRating: rated.length ? Number((rated.reduce((sum, prompt) => sum + prompt.rating, 0) / rated.length).toFixed(2)) : null,
      mostUsedModel: ranked.length ? ranked[0][0] : null,
    };
  }
  function read(storage, key) {
    const raw = storage.getItem(key);
    return validatePrompts(raw === null ? [] : JSON.parse(raw));
  }
  function createExport(prompts) {
    validatePrompts(prompts);
    return { version: VERSION, exportedAt: new Date().toISOString(), statistics: statistics(prompts), prompts };
  }
  function parse(text) {
    let data;
    try { data = JSON.parse(text); } catch (error) { throw new Error(`Invalid JSON: ${error.message}`); }
    if (!object(data)) throw new Error("Export must be a JSON object.");
    if (data.version !== VERSION) throw new Error(`Unsupported export version ${JSON.stringify(data.version)}. Expected version ${VERSION}.`);
    validateTimestamp(data.exportedAt, "exportedAt");
    validatePrompts(data.prompts);
    const expected = statistics(data.prompts);
    if (!object(data.statistics) || Object.keys(expected).some((key) => data.statistics[key] !== expected[key])) {
      throw new Error("Export statistics do not match the prompts. The file may be incomplete or edited incorrectly.");
    }
    return data;
  }
  function merge(existing, incoming, choices, uuid = () => crypto.randomUUID()) {
    validatePrompts(existing);
    validatePrompts(incoming);
    const result = JSON.parse(JSON.stringify(existing));
    const positions = new Map(result.map((prompt, index) => [prompt.id, index]));
    const usedIds = new Set([...existing, ...incoming].map((prompt) => prompt.id));
    for (const prompt of incoming) {
      const copy = JSON.parse(JSON.stringify(prompt));
      if (!positions.has(prompt.id)) { result.push(copy); continue; }
      const choice = choices.get(prompt.id);
      if (choice === "incoming") result[positions.get(prompt.id)] = copy;
      else if (choice === "both") {
        let id;
        for (let attempt = 0; attempt < 100; attempt++) {
          id = uuid();
          if (!usedIds.has(id)) break;
        }
        if (usedIds.has(id)) throw new Error("Unable to generate a unique ID.");
        copy.id = id;
        usedIds.add(id);
        result.push(copy);
      } else if (choice !== "existing") throw new Error(`Choose a resolution for prompt ID ${prompt.id}.`);
    }
    return validatePrompts(result);
  }
  // expectedRaw guards against edits in another tab while the import dialog is open.
  function commit(storage, key, next, expectedRaw, apply) {
    validatePrompts(next);
    if (storage.getItem(key) !== expectedRaw) throw new Error("Saved prompts changed while import was open. Cancel and select the file again.");
    const backup = JSON.stringify({ backedUpAt: new Date().toISOString(), raw: expectedRaw });
    try {
      storage.setItem(BACKUP_KEY, backup);
      if (storage.getItem(BACKUP_KEY) !== backup) throw new Error("Backup verification failed.");
    } catch (error) { throw new Error(`Could not create a backup; no prompts were changed. ${error.message}`); }
    try {
      const serialized = JSON.stringify(next);
      storage.setItem(key, serialized);
      if (storage.getItem(key) !== serialized) throw new Error("Saved import verification failed.");
      apply(next);
    } catch (error) {
      try {
        if (storage.getItem(key) !== expectedRaw) {
          if (expectedRaw === null) storage.removeItem(key);
          else storage.setItem(key, expectedRaw);
        }
        if (storage.getItem(key) !== expectedRaw) throw new Error("Restored data could not be verified.");
      } catch (rollbackError) {
        throw new Error(`Import failed: ${error.message} Rollback also failed: ${rollbackError.message} Download the backup before reloading.`);
      }
      throw new Error(`Import failed; original stored data restored. ${error.message}`);
    }
  }
  return { VERSION, BACKUP_KEY, validatePrompts, statistics, read, createExport, parse, merge, commit };
})();

// Prompt library and rendering

const STORAGE_KEY = "prompt-library-prompts";
const PREVIEW_WORD_LIMIT = 18;

const promptForm = document.querySelector("#prompt-form");
const titleInput = document.querySelector("#prompt-title");
const contentInput = document.querySelector("#prompt-content");
const modelInput = document.querySelector("#prompt-model");
const codeInput = document.querySelector("#prompt-is-code");
const errorMessage = document.querySelector("#app-error");
let loadFailed = false;

function showError(error) {
  errorMessage.textContent = error.message;
  errorMessage.hidden = false;
}

const promptList = document.querySelector("#prompt-list");

function loadPrompts() {
  try {
    const savedPrompts = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (savedPrompts === null) return [];
    if (!Array.isArray(savedPrompts)) {
      throw new Error("Saved prompts must be an array. Stored data has been preserved.");
    }

    let migrated = false;
    const loaded = savedPrompts.map((prompt) => {
      if (!prompt || typeof prompt.title !== "string" || typeof prompt.content !== "string") {
        throw new Error("A saved prompt is invalid. Stored data has been preserved.");
      }
      let metadata = prompt.metadata;
      if (metadata === undefined) {
        metadata = trackModel("Unknown model", prompt.content);
        migrated = true;
      }
      validateMetadata(metadata);
      return {
        ...prompt,
        metadata,
        rating: Number.isInteger(prompt.rating) && prompt.rating >= 1 && prompt.rating <= 5
          ? prompt.rating : 0,
        notes: Array.isArray(prompt.notes) ? prompt.notes : [],
      };
    });
    if (migrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
    return loaded;
  } catch (error) {
    loadFailed = true;
    showError(new Error(`Unable to load prompts: ${error.message}`));
    return [];
  }
}

let prompts = loadPrompts();

// Save a separate draft first so storage or validation failures never change the UI state.
function commitPrompts(change) {
  try {
    if (loadFailed) throw new Error("Unable to save because stored prompts could not be loaded. Resolve the storage error and reload first.");
    const draft = JSON.parse(JSON.stringify(prompts));
    change(draft);
    draft.forEach((prompt) => validateMetadata(prompt.metadata));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    prompts = draft;
    errorMessage.hidden = true;
    renderPrompts();
    return true;
  } catch (error) {
    showError(new Error(`Unable to save changes: ${error.message}`));
    return false;
  }
}

function createPreview(content) {
  const words = content.trim().split(/\s+/);
  const preview = words.slice(0, PREVIEW_WORD_LIMIT).join(" ");

  return words.length > PREVIEW_WORD_LIMIT ? `${preview}…` : preview;
}

function deletePrompt(id) {
  commitPrompts((draft) => {
    const index = draft.findIndex((prompt) => prompt.id === id);
    if (index !== -1) draft.splice(index, 1);
  });
}

function changePrompt(id, change) {
  return commitPrompts((draft) => {
    const prompt = draft.find((savedPrompt) => savedPrompt.id === id);
    if (!prompt) throw new Error("Prompt could not be found.");
    change(prompt);
    prompt.metadata = updateTimestamps(prompt.metadata);
  });
}

function setRating(id, rating) {
  changePrompt(id, (prompt) => {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error("Rating must be an integer from 1 to 5.");
    }
    prompt.rating = rating;
  });
}

function noteText(content) {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Note content must be a non-empty string.");
  }
  return content.trim();
}

function addNote(promptId, content) {
  changePrompt(promptId, (prompt) => {
    prompt.notes.push({ id: crypto.randomUUID(), content: noteText(content) });
  });
}

function updateNote(promptId, noteId, content) {
  changePrompt(promptId, (prompt) => {
    const note = prompt.notes.find((savedNote) => savedNote.id === noteId);
    if (!note) throw new Error("Note could not be found.");
    note.content = noteText(content);
  });
}

function deleteNote(promptId, noteId) {
  changePrompt(promptId, (prompt) => {
    prompt.notes = prompt.notes.filter((note) => note.id !== noteId);
  });
}

function createMetadataComponent(metadata) {
  const list = document.createElement("dl");
  list.className = "prompt-metadata";
  function row(label, value) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.append(value);
    list.append(term, description);
  }
  row("Model", metadata.model);
  for (const [field, label] of [["createdAt", "Created"], ["updatedAt", "Updated"]]) {
    const time = document.createElement("time");
    time.dateTime = metadata[field];
    time.title = metadata[field];
    time.textContent = new Date(metadata[field]).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    row(label, time);
  }
  const { min, max, confidence } = metadata.tokenEstimate;
  const estimate = document.createElement("span");
  // Short-word prompts can produce min > max under the requested formulas.
  estimate.textContent = `Min: ${min.toLocaleString()} · Max: ${max.toLocaleString()} `;
  const badge = document.createElement("span");
  badge.className = `confidence confidence-${confidence}`;
  badge.textContent = `${confidence} confidence`;
  estimate.append(badge);
  row("Tokens (est.)", estimate);
  return list;
}

function createNoteItem(prompt, note) {
  const item = document.createElement("article");
  const content = document.createElement("p");
  const actions = document.createElement("div");
  const editButton = document.createElement("button");
  const deleteButton = document.createElement("button");
  const editForm = document.createElement("form");
  const editLabel = document.createElement("label");
  const editInput = document.createElement("textarea");
  const saveButton = document.createElement("button");
  const editInputId = `edit-note-${note.id}`;

  item.className = "note-item";
  content.className = "note-content";
  content.textContent = note.content;
  actions.className = "note-actions";

  editButton.className = "note-button";
  editButton.type = "button";
  editButton.textContent = "Edit";

  deleteButton.className = "note-button note-delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.setAttribute("aria-label", `Delete note from ${prompt.title}`);
  deleteButton.addEventListener("click", () => deleteNote(prompt.id, note.id));

  editForm.className = "note-form note-edit-form";
  editForm.hidden = true;
  editLabel.className = "visually-hidden";
  editLabel.htmlFor = editInputId;
  editLabel.textContent = `Edit note for ${prompt.title}`;
  editInput.className = "note-input";
  editInput.id = editInputId;
  editInput.rows = 3;
  editInput.required = true;
  editInput.value = note.content;
  saveButton.className = "note-button note-save-button";
  saveButton.type = "submit";
  saveButton.textContent = "Save";

  editButton.addEventListener("click", () => {
    content.hidden = true;
    actions.hidden = true;
    editForm.hidden = false;
    editInput.focus();
  });

  editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updateNote(prompt.id, note.id, editInput.value);
  });

  actions.append(editButton, deleteButton);
  editForm.append(editLabel, editInput, saveButton);
  item.append(content, actions, editForm);
  return item;
}

function createNotesSection(prompt) {
  const section = document.createElement("section");
  const heading = document.createElement("h4");
  const list = document.createElement("div");
  const addForm = document.createElement("form");
  const addLabel = document.createElement("label");
  const addInput = document.createElement("textarea");
  const addButton = document.createElement("button");
  const headingId = `notes-heading-${prompt.id}`;
  const addInputId = `new-note-${prompt.id}`;

  section.className = "notes-section";
  section.setAttribute("aria-labelledby", headingId);
  heading.className = "notes-heading";
  heading.id = headingId;
  heading.textContent = "Notes";
  list.className = "notes-list";

  prompt.notes.forEach((note) => {
    list.append(createNoteItem(prompt, note));
  });

  addForm.className = "note-form note-add-form";
  addLabel.className = "visually-hidden";
  addLabel.htmlFor = addInputId;
  addLabel.textContent = `Add a note to ${prompt.title}`;
  addInput.className = "note-input";
  addInput.id = addInputId;
  addInput.rows = 3;
  addInput.placeholder = "Add a note...";
  addInput.required = true;
  addButton.className = "note-button note-save-button";
  addButton.type = "submit";
  addButton.textContent = "Add note";

  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addNote(prompt.id, addInput.value);
  });

  addForm.append(addLabel, addInput, addButton);
  section.append(heading, list, addForm);
  return section;
}

function createRatingComponent(prompt) {
  const ratingSection = document.createElement("div");
  const ratingHeader = document.createElement("div");
  const ratingLabel = document.createElement("span");
  const ratingStatus = document.createElement("span");
  const stars = document.createElement("div");
  const starButtons = [];

  ratingSection.className = "rating-section";
  ratingHeader.className = "rating-header";
  ratingLabel.className = "rating-label";
  ratingLabel.textContent = "Effectiveness";
  ratingStatus.className = "rating-status";
  ratingStatus.textContent = prompt.rating ? `${prompt.rating}/5` : "Not rated";
  stars.className = "star-rating";
  stars.setAttribute("role", "group");
  stars.setAttribute("aria-label", `Rate ${prompt.title}`);

  function previewRating(rating) {
    starButtons.forEach((button, index) => {
      button.classList.toggle("is-active", index < rating);
      button.textContent = index < rating ? "★" : "☆";
    });
  }

  for (let rating = 1; rating <= 5; rating += 1) {
    const starButton = document.createElement("button");

    starButton.className = "star-button";
    starButton.type = "button";
    starButton.textContent = "★";
    starButton.setAttribute("aria-label", `${rating} out of 5 stars`);
    starButton.setAttribute("aria-pressed", String(prompt.rating === rating));
    starButton.addEventListener("mouseenter", () => previewRating(rating));
    starButton.addEventListener("focus", () => previewRating(rating));
    starButton.addEventListener("blur", () => previewRating(prompt.rating));
    starButton.addEventListener("click", () => setRating(prompt.id, rating));
    starButtons.push(starButton);
    stars.append(starButton);
  }

  stars.addEventListener("mouseleave", () => previewRating(prompt.rating));
  previewRating(prompt.rating);
  ratingHeader.append(ratingLabel, ratingStatus);
  ratingSection.append(ratingHeader, stars);
  return ratingSection;
}

function createPromptCard(prompt) {
  const card = document.createElement("article");
  const title = document.createElement("h3");
  const preview = document.createElement("p");
  const rating = createRatingComponent(prompt);
  const notes = createNotesSection(prompt);
  const deleteButton = document.createElement("button");

  card.className = "prompt-card";
  title.textContent = prompt.title;
  preview.className = "prompt-preview";
  preview.textContent = createPreview(prompt.content);
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.setAttribute("aria-label", `Delete ${prompt.title}`);
  deleteButton.addEventListener("click", () => deletePrompt(prompt.id));

  card.append(title, preview, createMetadataComponent(prompt.metadata), rating, notes, deleteButton);
  return card;
}

function renderPrompts() {
  const sorted = [...prompts].sort((a, b) => b.metadata.createdAt.localeCompare(a.metadata.createdAt));
  promptList.replaceChildren(...sorted.map(createPromptCard));
}

promptForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const saved = commitPrompts((draft) => {
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title || !content) throw new Error("Title and prompt content are required.");
    const metadata = trackModel(modelInput.value, content);
    metadata.tokenEstimate = estimateTokens(content, codeInput.checked);
    draft.unshift({
      id: crypto.randomUUID(), title, content, metadata,
      isCode: codeInput.checked, rating: 0, notes: [],
    });
  });
  if (saved) {
    promptForm.reset();
    titleInput.focus();
  }
});

renderPrompts();

// Export/import controls

const importFile = document.querySelector("#import-file");
const importDialog = document.querySelector("#import-dialog");
const importMode = document.querySelector("#import-mode");
const conflictList = document.querySelector("#import-conflicts");
const importError = document.querySelector("#import-error");
const transferStatus = document.querySelector("#transfer-status");
let pendingImport = null;

function transferMessage(message) {
  errorMessage.hidden = true;
  transferStatus.textContent = message;
}
function downloadJSON(text, prefix) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.append(link);
  try { link.click(); } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
function exportPrompts() {
  transferStatus.textContent = "";
  try {
    const data = PromptTransfer.createExport(PromptTransfer.read(localStorage, STORAGE_KEY));
    downloadJSON(JSON.stringify(data, null, 2), "prompt-library");
    transferMessage(`Export download started: ${data.statistics.totalPrompts} prompts.`);
  } catch (error) { showError(new Error(`Unable to export: ${error.message}`)); }
}
function renderConflicts() {
  conflictList.replaceChildren();
  if (!pendingImport) return;
  const replacing = importMode.value === "replace";
  document.querySelector("#replace-warning").hidden = !replacing;
  if (replacing) return;
  for (const incoming of pendingImport.data.prompts) {
    const existing = pendingImport.existing.find((prompt) => prompt.id === incoming.id);
    if (!existing) continue;
    const row = document.createElement("fieldset");
    const heading = document.createElement("legend");
    heading.textContent = `Shared ID: ${incoming.id}`;
    row.append(heading);
    for (const [label, prompt] of [["Existing", existing], ["Imported", incoming]]) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = `${label}: ${prompt.title} · Updated ${prompt.metadata.updatedAt}`;
      const content = document.createElement("pre");
      content.textContent = JSON.stringify(prompt, null, 2);
      details.append(summary, content);
      row.append(details);
    }
    const label = document.createElement("label");
    label.textContent = "Which version should be kept?";
    const select = document.createElement("select");
    select.dataset.promptId = incoming.id;
    for (const [value, text] of [["existing", "Keep existing"], ["incoming", "Use imported"], ["both", "Keep both (new ID for imported)"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    label.append(select);
    row.append(label);
    conflictList.append(row);
  }
}
async function importPrompts(file) {
  transferStatus.textContent = "";
  if (!file) return;
  try {
    const data = PromptTransfer.parse(await file.text());
    const raw = localStorage.getItem(STORAGE_KEY);
    let existing = [], existingError = null;
    try { existing = PromptTransfer.validatePrompts(raw === null ? [] : JSON.parse(raw)); }
    catch (error) { existingError = error; }
    pendingImport = { data, raw, existing };
    importMode.querySelector('option[value="merge"]').disabled = Boolean(existingError);
    importMode.value = existingError ? "replace" : "merge";
    document.querySelector("#import-summary").textContent = `${data.prompts.length} prompts from ${data.exportedAt}. ${existingError ? `Existing data cannot be merged: ${existingError.message} Replace will back up the original raw data.` : `${existing.length} prompts currently saved. Shared IDs are listed below; existing versions are kept by default.`}`;
    importError.hidden = true;
    renderConflicts();
    importDialog.showModal();
  } catch (error) { showError(new Error(`Unable to import: ${error.message}`)); }
  finally { importFile.value = ""; }
}

document.querySelector("#export-prompts").addEventListener("click", exportPrompts);
document.querySelector("#import-prompts").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => importPrompts(importFile.files[0]));
importMode.addEventListener("change", renderConflicts);
document.querySelector("#cancel-import").addEventListener("click", () => importDialog.close());
importDialog.addEventListener("close", () => { pendingImport = null; });
document.querySelector("#confirm-import").addEventListener("click", () => {
  if (!pendingImport) return;
  const previous = prompts;
  const previousLoadFailed = loadFailed;
  try {
    const choices = new Map([...conflictList.querySelectorAll("select")].map((select) => [select.dataset.promptId, select.value]));
    const next = importMode.value === "replace" ? pendingImport.data.prompts
      : PromptTransfer.merge(pendingImport.existing, pendingImport.data.prompts, choices);
    PromptTransfer.commit(localStorage, STORAGE_KEY, next, pendingImport.raw, (saved) => {
      prompts = saved;
      renderPrompts();
      loadFailed = false;
    });
    importDialog.close();
    transferMessage(`Import complete. ${next.length} prompts saved. A backup of the previous data is available.`);
  } catch (error) {
    prompts = previous;
    loadFailed = previousLoadFailed;
    // Restore the display as well if rendering the imported data failed.
    try { renderPrompts(); } catch (_) { /* Keep the original failure visible. */ }
    importError.textContent = error.message;
    importError.hidden = false;
  }
});
function downloadBackup() {
  try {
    const saved = localStorage.getItem(PromptTransfer.BACKUP_KEY);
    if (saved === null) throw new Error("No import backup exists yet.");
    const backup = JSON.parse(saved);
    let data;
    try { data = PromptTransfer.createExport(PromptTransfer.validatePrompts(backup.raw === null ? [] : JSON.parse(backup.raw))); }
    catch (_) {
      downloadJSON(saved, "prompt-library-raw-backup");
      transferStatus.textContent = "Raw recovery backup downloaded. It preserves the original damaged data and must be repaired before import.";
      return;
    }
    downloadJSON(JSON.stringify(data, null, 2), "prompt-library-backup");
    transferStatus.textContent = "Backup download started. Import it using Replace to restore the previous library.";
  } catch (error) { showError(new Error(`Unable to download backup: ${error.message}`)); }
}
document.querySelector("#download-backup").addEventListener("click", downloadBackup);
document.querySelector("#dialog-backup").addEventListener("click", downloadBackup);
