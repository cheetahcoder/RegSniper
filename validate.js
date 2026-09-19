const fs = require('fs');
const path = require('path');
const vm = require('vm');

const distDir = path.join(__dirname, 'dist');
console.log('>>> Running Automated Verification Suite on:', distDir);

let errors = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(' [FAIL] ' + message);
        errors++;
    } else {
        console.log(' [PASS] ' + message);
    }
}

// 1. Check dist directory existence
assert(fs.existsSync(distDir), 'Dist directory exists');

// 2. Check manifest.json
const manifestPath = path.join(distDir, 'manifest.json');
assert(fs.existsSync(manifestPath), 'dist/manifest.json exists');

let manifest = null;
try {
    const rawManifest = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(rawManifest);
    assert(true, 'manifest.json is valid JSON');
} catch (e) {
    assert(false, 'manifest.json failed JSON parse: ' + e.message);
}

if (manifest) {
    assert(manifest.manifest_version === 3, 'manifest_version is 3');
    assert(typeof manifest.name === 'string' && manifest.name.length > 0, 'manifest name is set');
    assert(typeof manifest.version === 'string' && manifest.version.length > 0, 'manifest version is set');
    assert(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0, 'content_scripts configured');
    
    if (manifest.icons) {
        for (const [size, relPath] of Object.entries(manifest.icons)) {
            const fullIconPath = path.join(distDir, relPath);
            assert(fs.existsSync(fullIconPath), `Icon ${size} exists at ${relPath}`);
            if (fs.existsSync(fullIconPath)) {
                assert(fs.statSync(fullIconPath).size > 0, `Icon ${size} is not empty`);
            }
        }
    }

    if (manifest.content_scripts) {
        for (const cs of manifest.content_scripts) {
            assert(cs.matches && cs.matches.includes('https://my.edu.sharif.edu/*'), 'Content script matches https://my.edu.sharif.edu/*');
            for (const scriptRelPath of (cs.js || [])) {
                const scriptFullPath = path.join(distDir, scriptRelPath);
                assert(fs.existsSync(scriptFullPath), `Content script file exists: ${scriptRelPath}`);
            }
        }
    }
}

// 3. Verify content.js obfuscation and syntax
const contentJsPath = path.join(distDir, 'content.js');
if (fs.existsSync(contentJsPath)) {
    const code = fs.readFileSync(contentJsPath, 'utf8');
    assert(code.length > 1000, `content.js size check (${code.length} bytes)`);

    // Verify syntax
    try {
        new vm.Script(code, { filename: 'dist/content.js' });
        assert(true, 'content.js passes syntax validation (zero syntax errors)');
    } catch (e) {
        assert(false, 'content.js syntax error: ' + e.message);
    }

    // Verify obfuscation: cleartext original comments/function names should not be present
    const hasOriginalComment = code.includes('--- RegSniper Ultra Console v7.3 ---');
    const hasOriginalVar = code.includes('let sniperState =');
    assert(!hasOriginalComment && !hasOriginalVar, 'Source code is obfuscated (original identifiers and comments removed)');
}

console.log('\n======================================================');
if (errors === 0) {
    console.log(' ALL VERIFICATION CHECKS PASSED (0 errors)');
    console.log('======================================================\n');
    process.exit(0);
} else {
    console.error(` VERIFICATION FAILED with ${errors} error(s)`);
    console.log('======================================================\n');
    process.exit(1);
}
