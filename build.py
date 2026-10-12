"""Package the Chrome extension: python build.py."""
import json
import re
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
FILES = [
    'manifest.json', 'adapters.js', 'analytics.js', 'background.js',
    'bridge.js', 'capture.js', 'client.js', 'compact.css', 'dashboard.css',
    'dashboard.html', 'dashboard.js', 'database.js', 'gemini-dom.js',
    'options.html', 'options.js', 'popup.html', 'popup.js', 'pricing.js',
    'schema.js', 'grok-dom.js', 'README.md', 'PRIVACY.md',
    'docs/development.md', 'docs/usage.md',
]


def main():
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    required = {manifest['background']['service_worker'],
                manifest['action']['default_popup'],
                manifest['side_panel']['default_path'], manifest['options_page']}
    for script in manifest['content_scripts']:
        required.update(script['js'])
    for name in FILES:
        path = ROOT / name
        if not path.is_file():
            raise RuntimeError(f'Missing build asset: {name}')
        if path.suffix == '.html':
            required.update(re.findall(r'(?:src|href)="([^"?#]+\.(?:js|css))"',
                                       path.read_text(encoding='utf-8')))
    if required - set(FILES):
        raise RuntimeError(f'Unpackaged dependencies: {sorted(required - set(FILES))}')
    unpacked = ROOT / 'dist' / 'frontier-token-tracker'
    unpacked.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        target = unpacked / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, target)
    output = ROOT / 'frontier-token-tracker.zip'
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for name in FILES:
            archive.write(ROOT / name, name)
    with ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('ZIP integrity check failed')
    print(f'Built {output.name} (v{manifest["version"]}, {len(FILES)} files, {output.stat().st_size:,} bytes)')
    print(f'Load unpacked from: {unpacked}')


if __name__ == '__main__':
    main()
