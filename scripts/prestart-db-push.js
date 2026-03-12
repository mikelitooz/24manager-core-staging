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

async function main() {
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

  let attempt = 1;
  const maxAttempts = 3;
  let success = false;
  let lastStatus = 1;

  while (attempt <= maxAttempts && !success) {
    console.log(`Running prisma db push using host ${hostInfo} (Attempt ${attempt}/${maxAttempts})`);
    
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(command, ['prisma', 'db', 'push'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: normalizedUrl,
      },
    });

    if (result.status === 0) {
      success = true;
    } else {
      lastStatus = result.status || 1;
      console.error(`prisma db push failed with status ${lastStatus}.`);
      if (attempt < maxAttempts) {
        console.log('Retrying in 3 seconds to allow DB to wake up...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    attempt++;
  }

  if (!success) {
    console.error('prisma db push failed after all attempts.');
    process.exit(lastStatus);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
