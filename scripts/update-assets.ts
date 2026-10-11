import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function run() {
  const sourceIcon = path.join(process.cwd(), 'src/assets/images/fc_arena_icon_1791738022922.jpg');
  
  const mipmaps = [
    { name: 'mipmap-mdpi', size: 48 },
    { name: 'mipmap-hdpi', size: 72 },
    { name: 'mipmap-xhdpi', size: 96 },
    { name: 'mipmap-xxhdpi', size: 144 },
    { name: 'mipmap-xxxhdpi', size: 192 },
  ];

  for (const m of mipmaps) {
    const dir = path.join(process.cwd(), `android/app/src/main/res/${m.name}`);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Generate square launcher
    await sharp(sourceIcon)
      .resize(m.size, m.size)
      .toFile(path.join(dir, 'ic_launcher.png'));

    // Generate round launcher
    await sharp(sourceIcon)
      .resize(m.size, m.size)
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    // Generate foreground
    await sharp(sourceIcon)
      .resize(m.size, m.size)
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
    
    console.log(`Updated icons for ${m.name} (${m.size}x${m.size})`);
  }

  // Update android/app/build.gradle version code & version name
  const buildGradlePath = path.join(process.cwd(), 'android/app/build.gradle');
  let gradleContent = fs.readFileSync(buildGradlePath, 'utf8');
  
  // Find versionCode
  const versionCodeMatch = gradleContent.match(/versionCode\s+(\d+)/);
  const currentVersionCode = versionCodeMatch ? parseInt(versionCodeMatch[1], 10) : 1;
  const newVersionCode = currentVersionCode + 1;

  // Find versionName
  const versionNameMatch = gradleContent.match(/versionName\s+"([^"]+)"/);
  const currentVersionName = versionNameMatch ? versionNameMatch[1] : '1.0';
  const parts = currentVersionName.split('.');
  let newVersionName = currentVersionName;
  if (parts.length === 2) {
    const minor = parseInt(parts[1], 10) + 1;
    newVersionName = `${parts[0]}.${minor}`;
  } else {
    newVersionName = `${currentVersionName}.1`;
  }

  gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${newVersionCode}`);
  gradleContent = gradleContent.replace(/versionName\s+"[^"]+"/, `versionName "${newVersionName}"`);
  fs.writeFileSync(buildGradlePath, gradleContent, 'utf8');
  console.log(`Updated build.gradle: versionCode ${newVersionCode}, versionName "${newVersionName}"`);

  // Also update package.json version
  const pkgPath = path.join(process.cwd(), 'package.json');
  let pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersionName;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
  console.log(`Updated package.json version to ${newVersionName}`);
}

run().catch(err => {
  console.error('Error updating assets and version:', err);
  process.exit(1);
});
