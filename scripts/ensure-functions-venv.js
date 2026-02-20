/**
 * Functions 배포 전에 Python venv가 있도록 생성합니다.
 * firebase deploy --only functions 시 predeploy에서 호출됩니다.
 */
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const functionsDir = path.join(rootDir, "functions");
const venvDir = path.join(functionsDir, "venv");
const requirementsPath = path.join(functionsDir, "requirements.txt");

if (!fs.existsSync(requirementsPath)) {
  process.exit(0);
}

const isWindows = process.platform === "win32";
const pythonVenv = isWindows ? path.join(venvDir, "Scripts", "python.exe") : path.join(venvDir, "bin", "python");

if (fs.existsSync(pythonVenv)) {
  console.log("functions/venv already exists.");
  process.exit(0);
}

console.log("Creating functions/venv and installing dependencies...");
execSync("python -m venv venv", { cwd: functionsDir, stdio: "inherit" });
const pipCmd = isWindows
  ? `venv\\Scripts\\python.exe -m pip install -r requirements.txt`
  : "venv/bin/python -m pip install -r requirements.txt";
execSync(pipCmd, { cwd: functionsDir, stdio: "inherit" });
console.log("functions/venv ready.");
