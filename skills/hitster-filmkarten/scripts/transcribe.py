"""Check a batch of local excerpts with one model load and reusable transcript caches."""
import argparse
import hashlib
import json
from pathlib import Path
import av
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio
from prepare_batch import select_entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*")
    parser.add_argument("--plan")
    parser.add_argument("--entries", default="all")
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--cache-dir")
    parser.add_argument("--report")
    parser.add_argument("--language", choices=["de", "en"], help="Only for a known language; omit for verification")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--words", action="store_true", help="Slower word alignment, only for uncertain cuts")
    parser.add_argument("--beam", type=int, default=1)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    if not args.files and not args.plan:
        parser.error("Dateien oder --plan erforderlich.")
    if args.plan and args.language:
        parser.error("Bei einer Planprüfung die Sprache automatisch erkennen lassen.")
    if not 1 <= args.beam <= 10:
        parser.error("beam muss zwischen 1 und 10 liegen.")
    jobs = {str(Path(f).resolve()): set() for f in args.files}
    preparation_issues = []
    if args.plan:
        plan_path = Path(args.plan).resolve()
        plan = json.loads(plan_path.read_text(encoding="utf-8-sig"))
        for entry in select_entries(plan["entries"], args.entries):
            if entry.get("blocked"):
                preparation_issues.append({"entry": entry["sourceId"], "issue": "blocked"})
                continue
            for lang in ("de", "en"):
                track = entry[lang]
                if track.get("preparationError") or track["start"] != 0:
                    preparation_issues.append({"entry": entry["sourceId"], "language": lang, "issue": "prepare_first"})
                    continue
                file = str((plan_path.parent / track["file"]).resolve())
                jobs.setdefault(file, set()).add(lang)
    cache_dir = Path(args.cache_dir or Path(args.model_dir).resolve().parent / "checks")
    cache_dir.mkdir(parents=True, exist_ok=True)
    results, issues = [], preparation_issues
    cached, checked = 0, 0
    model = None
    for filename, expected in jobs.items():
        file = Path(filename)
        try:
            stat = file.stat()
            signature = {"version": 3, "file": filename, "size": stat.st_size, "mtime": stat.st_mtime_ns,
                         "model": "base", "beam": args.beam, "words": args.words, "language": args.language}
            key = hashlib.sha256(filename.encode()).hexdigest()[:16]
            cache = cache_dir / (key + ".json")
            result = None
            if not args.force and cache.exists():
                previous = json.loads(cache.read_text(encoding="utf-8"))
                if previous.get("signature") == signature:
                    result = previous
                    cached += 1
            if result is None:
                with av.open(filename) as media:
                    if media.duration is not None and media.duration / av.time_base > 75:
                        raise ValueError("Erst den Ausschnitt mit prepare_batch.py extrahieren.")
                audio = decode_audio(filename)
                if audio.size > 75 * 16000:
                    raise ValueError("Ausschnitt länger als 75 Sekunden; zuerst zuschneiden.")
                peak = float(np.max(np.abs(audio))) if audio.size else 0
                rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2))) if audio.size else 0
                if peak < 0.0001 or rms < 0.000001:
                    raise ValueError("Stumme Aufnahme.")
                audio *= min(0.1 / rms, 0.89125 / peak)
                if model is None:
                    model = WhisperModel("base", device="cpu", compute_type="int8", cpu_threads=4,
                                         download_root=args.model_dir, local_files_only=not args.download)
                segments, info = model.transcribe(audio, language=args.language, word_timestamps=args.words,
                                                  beam_size=args.beam, condition_on_previous_text=False)
                result = {"signature": signature, "file": filename, "language": info.language,
                          "language_probability": info.language_probability, "segments": []}
                for segment in segments:
                    item = {"start": segment.start, "end": segment.end, "text": segment.text}
                    if args.words:
                        item["words"] = [{"start": w.start, "end": w.end, "word": w.word,
                                          "probability": w.probability} for w in (segment.words or [])]
                    result["segments"].append(item)
                temporary = cache.with_suffix(".tmp")
                temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                temporary.replace(cache)
                checked += 1
            if expected and expected != {result["language"]}:
                issues.append({"file": filename, "issue": "language_mismatch", "expected": sorted(expected),
                               "detected": result["language"]})
            if result["language_probability"] < 0.8 or not result["segments"]:
                issues.append({"file": filename, "issue": "review_needed"})
            results.append(result)
        except Exception as error:
            issues.append({"file": filename, "issue": "failed", "error": str(error)})
    report = Path(args.report) if args.report else cache_dir / "report.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"results": results, "issues": issues}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"checked": checked, "cached": cached, "report": str(report.resolve()), "issues": issues}))
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
