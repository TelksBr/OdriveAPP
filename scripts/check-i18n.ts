import { messages } from '../src/i18n/messages.ts';
import { flatFields } from '../src/features/config/fieldCatalog.ts';

const ptKeys = Object.keys(messages.pt);
const enKeys = Object.keys(messages.en);
const esKeys = Object.keys(messages.es);

const ptSet = new Set(ptKeys);
const enSet = new Set(enKeys);
const esSet = new Set(esKeys);

const missingInEn = ptKeys.filter((key) => !enSet.has(key));
const missingInPt = enKeys.filter((key) => !ptSet.has(key));
const missingInEs = ptKeys.filter((key) => !esSet.has(key));
const missingFieldPt: string[] = [];

for (const field of flatFields) {
  const labelKey = `field.${field.path}.label`;
  if (!messages.pt[labelKey]) {
    missingFieldPt.push(labelKey);
  }
}

let failed = false;
if (missingInEn.length > 0) {
  failed = true;
  console.error(`Missing EN keys (${missingInEn.length}):`);
  for (const key of missingInEn.slice(0, 40)) {
    console.error(`  ${key}`);
  }
}
if (missingInPt.length > 0) {
  failed = true;
  console.error(`Missing PT keys (${missingInPt.length}):`);
  for (const key of missingInPt.slice(0, 40)) {
    console.error(`  ${key}`);
  }
}
if (missingInEs.length > 0) {
  failed = true;
  console.error(`Missing ES keys (${missingInEs.length}):`);
  for (const key of missingInEs.slice(0, 40)) {
    console.error(`  ${key}`);
  }
}
if (missingFieldPt.length > 0) {
  failed = true;
  console.error(`Catalog fields missing PT label (${missingFieldPt.length}):`);
  for (const key of missingFieldPt.slice(0, 40)) {
    console.error(`  ${key}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log(`i18n ok — ${ptKeys.length} PT keys, ${enKeys.length} EN keys, ${esKeys.length} ES keys, ${flatFields.length} catalog fields`);

