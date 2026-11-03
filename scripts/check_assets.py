"""Check card IDs and assets; verify MP3 decoding and duration."""
import json, subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[1]
variants = json.loads((root/'variants.json').read_text())
assert len({v['id'] for v in variants}) == len(variants)
items = []
for variant in variants:
    card_file = root/variant['cards']
    cards = json.loads(card_file.read_text())
    assert len({c['id'] for c in cards}) == len(cards)
    for card in cards:
        card['file'] = str(card_file.parent/card['file'])
        card['id'] = variant['id'] + ':' + card['id']
    items.extend(cards)
assert len(items) >= 4
ids = [item['id'] for item in items]
assert len(ids) == len(set(ids)), 'Duplicate card IDs'
for item in items:
    path = root/item['file']
    assert path.is_file(), path
    duration = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)]))
    assert 1 < duration < 60
    subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','null','-'],check=True)
for asset in ['index.html','cards.html','style.css','player.js','cards.js','vendor/html5-qrcode.min.js','vendor/qrcode.js']:
    assert (root/asset).stat().st_size > 0
print(f'OK: {len(items)} unique cards, all assets present, MP3 files decode successfully.')
