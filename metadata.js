"use strict";

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
