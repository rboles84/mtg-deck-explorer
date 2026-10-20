"""Owner-only verification of the Git-ignored archive; no files are extracted."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile


def verify_archive(archive_path):
    root = Path(__file__).resolve().parent.parent
    receipt = json.loads((root / 'evidence/repository-archive.json').read_text(encoding='utf-8'))
    digest = lambda data: hashlib.sha256(data).hexdigest()
    if digest(archive_path.read_bytes()) != receipt['archiveSha256']:
        raise ValueError('Private archive SHA-256 differs from the public receipt.')
    entries = receipt['files']
    paths = [entry['path'] for entry in entries]
    if len(set(paths)) != len(paths):
        raise ValueError('Duplicate path in the archive receipt.')
    for name in paths:
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name:
            raise ValueError('Unsafe path in the archive receipt.')
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        expected = {'manifest.json'} | {'archive/' + name for name in paths}
        if len(names) != len(expected) or set(names) != expected:
            raise ValueError('Archive entries differ from the public receipt.')
        manifest = json.loads(archive.read('manifest.json'))
        for key in ('version', 'date', 'preCleanupCommit', 'files'):
            if manifest[key] != receipt[key]:
                raise ValueError('Archive manifest differs from the public receipt: ' + key)
        for entry in entries:
            data = archive.read('archive/' + entry['path'])
            if len(data) != entry['bytes'] or digest(data) != entry['sha256']:
                raise ValueError('Archived file differs: ' + entry['path'])
    originals = json.loads((root / 'evidence/source-audit.json').read_text(encoding='utf-8'))['originalFiles']
    archived = {entry['path']: entry for entry in entries}
    retired = [entry for entry in originals if entry['path'].startswith('references/') or entry['path'] == 'inputs/PROBABLY_PARADISE_GDD_VISUAL_ATLAS_V3_1.html']
    if len(retired) != 13 or any(archived.get(entry['path']) != entry for entry in retired):
        raise ValueError('Retired original assets differ from the pre-implementation audit.')
    return len(entries), len(retired)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    try:
        count, originals = verify_archive(args.archive)
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as error:
        parser.exit(1, str(error) + '\n')
    print(f'{count} archived files verified; {originals} original design assets match the pre-implementation audit.')
