const STORAGE_KEY = "prompt-library-prompts";
const PREVIEW_WORD_LIMIT = 18;

const promptForm = document.querySelector("#prompt-form");
const titleInput = document.querySelector("#prompt-title");
const contentInput = document.querySelector("#prompt-content");
const promptList = document.querySelector("#prompt-list");

function loadPrompts() {
  try {
    const savedPrompts = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(savedPrompts) ? savedPrompts : [];
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

function createPromptCard(prompt) {
  const card = document.createElement("article");
  const title = document.createElement("h3");
  const preview = document.createElement("p");
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

  card.append(title, preview, deleteButton);
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
  });

  savePrompts();
  renderPrompts();
  promptForm.reset();
  titleInput.focus();
});

renderPrompts();
