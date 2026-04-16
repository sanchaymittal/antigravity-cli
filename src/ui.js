#!/usr/bin/env node
"use strict";
const chalk = require("chalk");
const ora = require("ora");

const colors = {
  prompt: chalk.cyan.bold,
  dim: chalk.dim,
  error: chalk.red,
  success: chalk.green,
  warn: chalk.yellow,
  tool: chalk.magenta,
  model: chalk.cyan,
  bold: chalk.bold,
};

function createSpinner(text) {
  return ora({ text, color: "cyan" });
}

function printBanner(model) {
  console.log();
  console.log(colors.bold("  ag") + colors.dim(" — Antigravity CLI"));
  if (model) console.log(colors.dim("  model: ") + colors.model(model));
  console.log();
}

function printToolCall(name, args) {
  const preview = (() => {
    if (!args) return "";
    const first = Object.values(args)[0];
    return first ? colors.dim(" " + String(first).slice(0, 60)) : "";
  })();
  console.log(colors.tool("  ⚙ " + name) + preview);
}

function printResponse(text) {
  if (!text) return;
  console.log();
  process.stdout.write(text);
  if (!text.endsWith("\n")) console.log();
}

function printError(msg) {
  console.error(colors.error("  ✖ " + msg));
}

function printSuccess(msg) {
  console.log(colors.success("  ✔ " + msg));
}

module.exports = { colors, createSpinner, printBanner, printToolCall, printResponse, printError, printSuccess };
