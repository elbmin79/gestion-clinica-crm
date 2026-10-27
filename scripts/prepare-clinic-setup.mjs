import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatePath = path.join(projectRoot, 'supabase', 'bootstrap', 'clinic-admin.sql');
const defaultOutputPath = path.join('supabase', 'bootstrap', 'clinic-admin.generated.sql');
const usage = `Usage:
  npm run clinic:setup -- --admin-email <confirmed-auth-email> --clinic-name <name> [options]

Options:
  --time-zone <iana-zone>  Clinic timezone (default: America/Tijuana)
  --output <path>          New SQL file inside this project (default: ${defaultOutputPath})
  --help                   Show this help`;

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!['--admin-email', '--clinic-name', '--time-zone', '--output'].includes(key)) {
      throw new Error(`Unknown option: ${key}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    if (values.has(key)) throw new Error(`Option supplied more than once: ${key}`);
    values.set(key, value);
    index += 1;
  }
  return values;
}

function escapeSqlLiteral(value) {
  return value.replaceAll("'", "''");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
    return;
  }
  const values = parseArguments(args);
  const adminEmail = values.get('--admin-email')?.trim().toLowerCase();
  const clinicName = values.get('--clinic-name')?.trim();
  const timeZone = values.get('--time-zone')?.trim() || 'America/Tijuana';
  const outputPath = values.get('--output') || defaultOutputPath;

  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error(`--admin-email must be the valid email of an already confirmed Supabase Auth user.\n\n${usage}`);
  }
  if (!clinicName || clinicName.length > 160) {
    throw new Error(`--clinic-name must contain between 1 and 160 characters.\n\n${usage}`);
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
  } catch {
    throw new Error(`--time-zone must be a valid IANA timezone, such as America/Tijuana (received ${timeZone}).`);
  }

  const outputFullPath = path.resolve(projectRoot, outputPath);
  const relativeOutputPath = path.relative(projectRoot, outputFullPath);
  if (!relativeOutputPath || relativeOutputPath === '..' || relativeOutputPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutputPath)) {
    throw new Error('--output must stay inside the project workspace.');
  }

  let sql = await readFile(templatePath, 'utf8');
  sql = sql
    .replace("'REPLACE-WITH-ADMIN-EMAIL'", `'${escapeSqlLiteral(adminEmail)}'`)
    .replace("'REPLACE-WITH-CLINIC-NAME'", `'${escapeSqlLiteral(clinicName)}'`)
    .replace("'America/Tijuana'", `'${escapeSqlLiteral(timeZone)}'`);
  if (sql.includes("'REPLACE-WITH-ADMIN-EMAIL'") || sql.includes("'REPLACE-WITH-CLINIC-NAME'")) {
    throw new Error('The generated bootstrap still contains an unresolved placeholder.');
  }

  await mkdir(path.dirname(outputFullPath), { recursive: true });
  await writeFile(outputFullPath, sql, { encoding: 'utf8', flag: 'wx' });
  console.log(`Created clinic bootstrap SQL: ${outputFullPath}`);
  console.log('Review it, apply every numbered migration first, then run it once in the new clinic-owned Supabase project as project owner.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
