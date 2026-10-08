const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const editor = path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
const icon = path.join(root, 'build', 'icon.ico');
const executables = [
  path.join(root, 'dist', 'win-unpacked', 'Kontakt Drop.exe')
];

if (!fs.existsSync(editor)) throw new Error(`Windows resource editor was not found: ${editor}`);
if (!fs.existsSync(icon)) throw new Error(`App icon was not found: ${icon}`);

for (const executable of executables) {
  if (!fs.existsSync(executable)) continue;
  execFileSync(editor, [executable, '--set-icon', icon, '--set-version-string', 'ProductName', 'Kontakt Drop'], {
    stdio: 'inherit',
    windowsHide: true
  });
  console.log(`Embedded icon: ${path.relative(root, executable)}`);
}
