"""Prepare selected local tracks in one process; preserve source plans and approvals."""
import argparse
import hashlib
import json
import wave
from pathlib import Path
from process_audio import prepare_clip


def select_entries(entries, selection):
    if selection == "all":
        return entries
    ids = set()
    for part in selection.split(","):
        bounds = [int(n) for n in part.split("-")]
        if len(bounds) not in (1, 2):
            raise ValueError("Ungültige Auswahl.")
        first, last = bounds[0], bounds[-1]
        if first < 1 or last < first or last - first > 10000:
            raise ValueError("Ungültiger Eintragsbereich.")
        ids.update(range(first, last + 1))
    if ids - {e["sourceId"] for e in entries}:
        raise ValueError("Angeforderte Einträge fehlen im Plan.")
    return [e for e in entries if e["sourceId"] in ids]


def source_signature(track, base):
    file = (base / track["file"]).resolve()
    stat = file.stat() if file.is_file() else None
    return {"file": str(file), "size": stat.st_size if stat else None,
            "mtime": stat.st_mtime_ns if stat else None, "start": track["start"],
            "length": track["length"], "audioStream": track.get("audioStream")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True)
    parser.add_argument("--entries", required=True)
    args = parser.parse_args()
    plan_path = Path(args.plan).resolve()
    content = plan_path.read_bytes()
    plan = json.loads(content)
    entries = select_entries(plan["entries"], args.entries)
    signatures = {(e["sourceId"], lang): source_signature(e[lang], plan_path.parent)
                  for e in entries for lang in ("de", "en")}
    digest = hashlib.sha256(b"prepare-v1" + content + json.dumps(list(signatures.items()), sort_keys=True).encode()).hexdigest()[:16]
    output_plan = plan_path.with_name(f"{plan_path.stem}.prepared-{digest}.json")
    if output_plan.exists():
        cached = json.loads(output_plan.read_text(encoding="utf-8"))
        for entry in select_entries(cached["entries"], args.entries):
            for lang in ("de", "en"):
                track = entry[lang]
                if track.get("preparedFrom") and not Path(track["file"]).is_file():
                    raise ValueError("Vorbereitete Cache-Datei fehlt; Wiederherstellung vor Import erforderlich.")
        print(json.dumps({"status": "cached", "plan": str(output_plan)}))
        return 1 if any(r["status"] == "failed" for r in cached.get("preparation", [])) else 0
    for entry in plan["entries"]:
        for lang in ("de", "en"):
            entry[lang]["file"] = str((plan_path.parent / entry[lang]["file"]).resolve())
    results = []
    for entry in entries:
        if entry.get("blocked"):
            results.append({"entry": entry["sourceId"], "status": "blocked"})
            continue
        for lang in ("de", "en"):
            source = signatures[entry["sourceId"], lang]
            fingerprint = hashlib.sha256(json.dumps({**source, "language": lang, "version": 1}, sort_keys=True).encode()).hexdigest()[:16]
            target = plan_path.parent / "processed" / f'{entry["sourceId"]:03}-{lang}-{fingerprint}.wav'
            try:
                if source["size"] is None:
                    raise ValueError("Quelldatei fehlt.")
                if not target.exists():
                    prepare_clip(source["file"], source["start"], source["length"], target, lang, source["audioStream"])
                with wave.open(str(target)) as cached_audio:
                    if (cached_audio.getnchannels(), cached_audio.getframerate(), cached_audio.getnframes()) != (2, 44100, round(source["length"] * 44100)):
                        raise ValueError("Vorbereitete Cache-Datei ist ungültig.")
                entry[lang] = {"file": str(target), "start": 0, "length": source["length"],
                               "verified": False, "preparedFrom": source}
                results.append({"entry": entry["sourceId"], "language": lang, "status": "prepared"})
            except Exception as error:
                entry[lang]["verified"] = False
                entry[lang]["preparationError"] = str(error)
                results.append({"entry": entry["sourceId"], "language": lang, "status": "failed", "error": str(error)})
    plan["preparation"] = results
    with output_plan.open("x", encoding="utf-8") as file:
        json.dump(plan, file, ensure_ascii=False, indent=2)
        file.write("\n")
    print(json.dumps({"plan": str(output_plan), "results": results}))
    return 1 if any(r["status"] == "failed" for r in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
