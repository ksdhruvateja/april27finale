import { spawnSync } from "node:child_process";

const env = { ...process.env, NODE_ENV: "development" };

const build = spawnSync("pnpm", ["run", "build"], {
  stdio: "inherit",
  shell: true,
  env,
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const start = spawnSync("pnpm", ["run", "start"], {
  stdio: "inherit",
  shell: true,
  env,
});

process.exit(start.status ?? 1);
