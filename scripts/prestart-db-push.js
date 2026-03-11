const { spawnSync } = require('child_process');

function normalizeDatabaseUrl(rawValue) {
  if (!rawValue) {
    return rawValue;
  }

  let value = rawValue.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }

  return value.replace(/[\r\n]+/g, '');
}

const normalizedUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

if (!normalizedUrl) {
  console.error('DATABASE_URL is missing or empty. Set DATABASE_URL in Railway service variables.');
  process.exit(1);
}

let hostInfo = 'unknown';
try {
  const parsed = new URL(normalizedUrl);
  hostInfo = `${parsed.hostname}:${parsed.port || '5432'}`;
} catch (error) {
  console.error('DATABASE_URL could not be parsed. Please remove quotes/newlines and verify URL format.');
  process.exit(1);
}

console.log(`Running prisma db push using host ${hostInfo}`);

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['prisma', 'db', 'push'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: normalizedUrl,
  },
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}
