import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "../../..");
const excluded = new Set(["node_modules", ".next", "generated", "coverage", "playwright-report", "test-results"]);
const extensions = new Set([".ts", ".tsx", ".mjs", ".js", ".json", ".prisma"]);
const findings = [];
const mainlandMobile = new RegExp(String.raw`(?<!\d)1[3-9]\d{9}(?!\d)`, "g");
const citizenId = new RegExp(String.raw`(?<!\d)\d{17}[0-9Xx](?!\d)`, "g");
const forbiddenSchemaObject = /^\s*model\s+(Patient|Subject|Crf|MedicalRecord|Inpatient)\b/im;
const forbiddenField = /^\s*(patientName|citizenId|inpatientNo|medicalRecord|crfData|subjectDetail)\s+/im;

walk(appRoot);
if (findings.length) {
  console.error("Patient-level data ban validation failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log("Patient-level data ban validation passed.");

function walk(directory) {
  for (const name of readdirSync(directory)) {
    if (excluded.has(name) || name.startsWith(".next-")) continue;
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (extensions.has(extname(path))) inspect(path);
  }
}

function inspect(path) {
  const text = readFileSync(path, "utf8");
  const local = relative(appRoot, path);
  if (mainlandMobile.test(text)) findings.push(`${local}: mainland mobile-like value`);
  mainlandMobile.lastIndex = 0;
  if (citizenId.test(text)) findings.push(`${local}: citizen-id-like value`);
  citizenId.lastIndex = 0;
  if (path.endsWith("schema.prisma") && (forbiddenSchemaObject.test(text) || forbiddenField.test(text))) findings.push(`${local}: prohibited patient-level schema object or field`);
}
