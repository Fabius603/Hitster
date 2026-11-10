"""Check card IDs and assets; verify MP3 decoding and duration."""
import json, subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[1]
variants = json.loads((root/'variants.json').read_text(encoding='utf-8'))
assert len({v['id'] for v in variants}) == len(variants)
items = []
card_ids = []
for variant in variants:
    card_file = root/variant['cards']
    cards = json.loads(card_file.read_text(encoding='utf-8'))
    assert len({c['id'] for c in cards}) == len(cards)
    for card in cards:
        card_ids.append(variant['id'] + ':' + card['id'])
        paths = {card['file'], *card.get('tracks', {}).values()}
        items.extend(card_file.parent / path for path in paths)
assert len(card_ids) >= 4
assert len(card_ids) == len(set(card_ids)), 'Duplicate card IDs'
for path in items:
    assert path.is_file(), path
    duration = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)]))
    # MP3 frame padding can add a few milliseconds to a cut shorter than 60 s.
    assert 1 < duration < 60.15
    subprocess.run(['ffmpeg','-v','error','-i',str(path),'-f','null','-'],check=True)
for asset in ['index.html','cards.html','style.css','player.js','cards.js','vendor/html5-qrcode.min.js','vendor/qrcode.js']:
    assert (root/asset).stat().st_size > 0
print(f'OK: {len(card_ids)} unique cards, {len(items)} media files including language tracks decode successfully.')
