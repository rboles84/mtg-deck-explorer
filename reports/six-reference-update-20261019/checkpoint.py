import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path.cwd().resolve()
report = root / 'reports/six-reference-update-20261019'
archive = root / 'backups/before-six-references-20261019.zip'
manifest_path = archive.with_suffix('.manifest.json')
if archive.exists() or manifest_path.exists():
    raise RuntimeError('Checkpoint already exists; refusing overwrite')
digest = lambda b: hashlib.sha256(b).hexdigest()
files = {}
for p in sorted(root.rglob('*')):
    if p.is_file() and not p.is_relative_to(report):
        files[p.relative_to(root).as_posix()] = digest(p.read_bytes())
(report / 'before.json').write_text(json.dumps({'files': files}, indent=2) + '\n', encoding='utf-8')
entries = []
with ZipFile(archive, 'x', compression=ZIP_DEFLATED, compresslevel=6) as z:
    for name, sha in files.items():
        if name.startswith('backups/'):
            continue
        data = (root / name).read_bytes()
        if digest(data) != sha:
            raise RuntimeError('File changed while backing up: ' + name)
        z.writestr('app/' + name, data)
        entries.append({'path': name, 'sha256': sha, 'bytes': len(data)})
    z.writestr('manifest.json', json.dumps({'files': entries}, indent=2) + '\n')
with ZipFile(archive) as z:
    for entry in entries:
        if digest(z.read('app/' + entry['path'])) != entry['sha256']:
            raise RuntimeError('Archive verification failed: ' + entry['path'])
manifest = {'file': archive.relative_to(root).as_posix(), 'sha256': digest(archive.read_bytes()), 'verifiedFiles': len(entries), 'files': entries}
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in manifest.items() if k != 'files'}))
