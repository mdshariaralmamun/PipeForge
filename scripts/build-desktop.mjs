// Desktop build: static export via DESKTOP=1.
// middleware.ts (Supabase session refresh) is not supported by output:"export",
// so it is set aside for the duration of the build and always restored.
import { existsSync, renameSync } from "node:fs";
import { execSync } from "node:child_process";

const MW = "middleware.ts";
const BAK = "middleware.ts.desktop-bak";

if (existsSync(MW)) renameSync(MW, BAK);
try {
  execSync("next build", { stdio: "inherit", env: { ...process.env, DESKTOP: "1" } });
} finally {
  if (existsSync(BAK)) renameSync(BAK, MW);
}
console.log("Desktop static export ready in out/");
