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
