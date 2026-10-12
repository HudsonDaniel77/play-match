import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import prettier from 'prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkDrift() {
  const specPath = path.resolve(__dirname, '../../../../server/openapi.json');
  const targetPath = path.resolve(__dirname, '../api/generated.ts');

  const committed = await fs.readFile(targetPath, 'utf-8');

  const tempPath = path.resolve(__dirname, '../api/generated.temp.ts');

  // Run the exact same CLI flow as gen:api
  const { execSync } = await import('node:child_process');
  execSync(`npx openapi-typescript "${specPath}" -o "${tempPath}"`, { stdio: 'pipe' });
  execSync(`npx prettier --write "${tempPath}"`, { stdio: 'pipe' });

  const tempContent = await fs.readFile(tempPath, 'utf-8');
  await fs.unlink(tempPath).catch(() => {});

  // Normalize line breaks for Windows/Linux cross-platform guarantee
  const normalize = (s: string) => s.replace(/\r\n/g, '\n').trim();

  if (normalize(committed) !== normalize(tempContent)) {
    console.error('❌ Generated API types drift detected!');
    console.error('Run "npm run gen:api" in packages/shared to update generated.ts.');
    process.exit(1);
  }

  console.log('✅ Generated API types are synchronized with server/openapi.json!');
}

checkDrift().catch((err) => {
  console.error('❌ Error checking API drift:', err);
  process.exit(1);
});
