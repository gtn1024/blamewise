import pc from "picocolors";
import Table from "cli-table3";
import { formatRelative } from "./format";

export function renderWhoKnows(
  filePath: string,
  totalLines: number,
  stats: { name: string; email: string; lines: number; commits: number; lastActive: number; score: number }[],
): string {
  const out: string[] = [];

  out.push("");
  out.push(
    pc.bold(` Top experts for ${pc.cyan(filePath)}`) +
      pc.dim(` (${totalLines} lines, ${stats.length} author${stats.length !== 1 ? "s" : ""})`),
  );
  out.push("");

  const table = new Table({
    head: ["Rank", "Author", "Lines", "Commits", "Last Active", "Score"].map((h) => pc.dim(h)),
    colAligns: ["right", "left", "right", "right", "left", "right"],
    style: { "padding-left": 1, "padding-right": 1, head: [], border: [] },
    chars: {
      top: "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      bottom: "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      mid: "",
      "left-mid": "",
      "mid-mid": "",
      "right-mid": "",
      left: " ",
      right: " ",
      middle: "  ",
    },
  });

  for (const [i, s] of stats.entries()) {
    const rank = pc.bold(` ${i + 1}.`);
    const author = pc.cyan(s.name);
    const lines = pc.green(String(s.lines));
    const commits = String(s.commits);
    const lastActive = pc.dim(formatRelative(s.lastActive));
    const scoreVal = s.score >= 0.7 ? pc.green(String(s.score)) : s.score >= 0.4 ? pc.yellow(String(s.score)) : pc.dim(String(s.score));

    table.push([rank, author, lines, commits, lastActive, scoreVal]);
  }

  out.push(table.toString());
  out.push("");
  return out.join("\n");
}

export function renderWhy(
  filePath: string,
  entries: { sha: string; author: string; authorMail: string; date: string; subject: string }[],
): string {
  const out: string[] = [];

  out.push("");
  out.push(pc.bold(` Recent changes to ${pc.cyan(filePath)}`));
  out.push("");

  for (const [i, e] of entries.entries()) {
    const short = e.sha.slice(0, 7);
    const dateObj = new Date(e.date);
    const rel = formatRelative(Math.floor(dateObj.getTime() / 1000));

    out.push(` ${pc.dim(`[${i + 1}]`)} ${pc.bold(e.subject)}`);
    out.push(`     ${pc.dim("Author:")} ${pc.cyan(e.author)} ${pc.dim(`<${e.authorMail}>`)}`);
    out.push(`     ${pc.dim("Date:")}   ${e.date.slice(0, 10)} ${pc.dim(`(${rel})`)}`);
    out.push(`     ${pc.dim("SHA:")}    ${pc.dim(short)}`);
    out.push("");
  }

  return out.join("\n");
}
