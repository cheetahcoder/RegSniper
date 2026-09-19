const fs = require('fs');
const path = require('path');
const vm = require('vm');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = __dirname;
const srcDir = path.join(rootDir, 'src');
const iconsDir = path.join(rootDir, 'icons');
const distDir = path.join(rootDir, 'dist');
const distIconsDir = path.join(distDir, 'icons');

console.log('>>> [1/5] Preparing output directory...');
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distIconsDir, { recursive: true });

console.log('>>> [2/5] Copying manifest and icons...');
const manifestSource = path.join(srcDir, 'manifest.json');
const manifestDest = path.join(distDir, 'manifest.json');
fs.copyFileSync(manifestSource, manifestDest);

const iconFiles = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];
for (const iconFile of iconFiles) {
    const srcIcon = path.join(iconsDir, iconFile);
    const destIcon = path.join(distIconsDir, iconFile);
    if (fs.existsSync(srcIcon)) {
        fs.copyFileSync(srcIcon, destIcon);
    } else {
        console.warn(`Warning: Icon ${srcIcon} not found!`);
    }
}

console.log('>>> [3/5] Reading source code...');
const contentJsSource = fs.readFileSync(path.join(srcDir, 'content.js'), 'utf8');

console.log('>>> [4/5] Executing high-grade obfuscation pipeline...');
const obfuscationResult = JavaScriptObfuscator.obfuscate(contentJsSource, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    numbersToExpressions: true,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ['base64', 'rc4'],
    stringArrayThreshold: 0.8,
    splitStrings: true,
    splitStringsChunkLength: 6,
    identifierNamesGenerator: 'hexadecimal',
    transformObjectKeys: true,
    selfDefending: true,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.2,
    renameGlobals: false,
    target: 'browser'
});

const obfuscatedCode = obfuscationResult.getObfuscatedCode();
const distContentJs = path.join(distDir, 'content.js');
fs.writeFileSync(distContentJs, obfuscatedCode, 'utf8');

console.log(`>>> Obfuscated bundle written: ${distContentJs} (${(obfuscatedCode.length / 1024).toFixed(1)} KB)`);

console.log('>>> [5/5] Verifying JavaScript syntax of obfuscated output...');
try {
    new vm.Script(obfuscatedCode, { filename: 'dist/content.js' });
    console.log('>>> [SUCCESS] Obfuscated bundle syntax is valid!');
} catch (err) {
    console.error('>>> [ERROR] Syntax validation failed:', err);
    process.exit(1);
}

// Also update Sharif RegSniper directory if user loaded that folder in Chrome
const sharifFolder = path.join(rootDir, 'Sharif RegSniper');
if (fs.existsSync(sharifFolder)) {
    fs.copyFileSync(distContentJs, path.join(sharifFolder, 'content.js'));
    fs.copyFileSync(manifestDest, path.join(sharifFolder, 'manifest.json'));
    console.log('>>> [SYNC] Synchronized updated bundle to Sharif RegSniper/ folder.');
}

console.log('\n======================================================');
console.log(' Extension build completed successfully!');
console.log(' Unpacked extension path: ' + distDir);
console.log('======================================================\n');
