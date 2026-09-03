const STORAGE_KEY = "prompt-library-prompts";
const PREVIEW_WORD_LIMIT = 18;

const promptForm = document.querySelector("#prompt-form");
const titleInput = document.querySelector("#prompt-title");
const contentInput = document.querySelector("#prompt-content");
const promptList = document.querySelector("#prompt-list");

function loadPrompts() {
  try {
    const savedPrompts = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!Array.isArray(savedPrompts)) {
      return [];
    }

    return savedPrompts.map((prompt) => ({
      ...prompt,
      rating: Number.isInteger(prompt.rating) && prompt.rating >= 1 && prompt.rating <= 5
        ? prompt.rating
        : 0,
      notes: Array.isArray(prompt.notes) ? prompt.notes : [],
    }));
  } catch {
    return [];
  }
}

let prompts = loadPrompts();

function savePrompts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
}

function createPreview(content) {
  const words = content.trim().split(/\s+/);
  const preview = words.slice(0, PREVIEW_WORD_LIMIT).join(" ");

  return words.length > PREVIEW_WORD_LIMIT ? `${preview}…` : preview;
}

function deletePrompt(id) {
  prompts = prompts.filter((prompt) => prompt.id !== id);
  savePrompts();
  renderPrompts();
}

function setRating(id, rating) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return;
  }

  const prompt = prompts.find((savedPrompt) => savedPrompt.id === id);

  if (!prompt) {
    return;
  }

  prompt.rating = rating;
  savePrompts();
  renderPrompts();
}

function addNote(promptId, content) {
  const prompt = prompts.find((savedPrompt) => savedPrompt.id === promptId);
  const noteContent = content.trim();

  if (!prompt || !noteContent) {
    return;
  }

  prompt.notes.push({
    id: crypto.randomUUID(),
    content: noteContent,
  });
  savePrompts();
  renderPrompts();
}

function updateNote(promptId, noteId, content) {
  const prompt = prompts.find((savedPrompt) => savedPrompt.id === promptId);
  const note = prompt?.notes.find((savedNote) => savedNote.id === noteId);
  const noteContent = content.trim();

  if (!note || !noteContent) {
    return;
  }

  note.content = noteContent;
  savePrompts();
  renderPrompts();
}

function deleteNote(promptId, noteId) {
  const prompt = prompts.find((savedPrompt) => savedPrompt.id === promptId);

  if (!prompt) {
    return;
  }

  prompt.notes = prompt.notes.filter((note) => note.id !== noteId);
  savePrompts();
  renderPrompts();
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

  card.append(title, preview, rating, notes, deleteButton);
  return card;
}

function renderPrompts() {
  promptList.replaceChildren(...prompts.map(createPromptCard));
}

promptForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();

  if (!title || !content) {
    return;
  }

  prompts.unshift({
    id: crypto.randomUUID(),
    title,
    content,
    rating: 0,
    notes: [],
  });

  savePrompts();
  renderPrompts();
  promptForm.reset();
  titleInput.focus();
});

renderPrompts();
