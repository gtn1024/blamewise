import { git } from "../git/run";
import { parseGitLog } from "../git/log";
import { renderWhy } from "../render";

export async function why(filePath: string, options?: { num?: number }) {
  const num = options?.num ?? 5;

  const raw = await git(
    "log",
    `--format=%H|%an|%ae|%aI|%s`,
    "--no-merges",
    `-${num}`,
    "--",
    filePath,
  );

  if (!raw.trim()) {
    console.log(`No commits found for ${filePath}`);
    return;
  }

  const entries = parseGitLog(raw);
  console.log(renderWhy(filePath, entries));
}
