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

  card.append(title, preview, rating, deleteButton);
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
  });

  savePrompts();
  renderPrompts();
  promptForm.reset();
  titleInput.focus();
});

renderPrompts();
