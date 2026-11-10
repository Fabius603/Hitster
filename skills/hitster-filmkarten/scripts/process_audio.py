"""Extract a local audio/video excerpt, choose its audio stream and match levels."""
import argparse
import json
import math
import sys
import wave
from pathlib import Path
import av
import numpy as np

LANGUAGES = {"de": {"de", "deu", "ger"}, "en": {"en", "eng"}}


def prepare_clip(file, start, length, out, language=None, audio_stream=None):
    if not math.isfinite(start) or not math.isfinite(length) or start < 0 or not 1 < length < 60:
        raise ValueError("Start >=0 und 1 < Länge <60 erforderlich.")
    rate = 44100
    begin, end = round(start * rate), round((start + length) * rate)
    samples = np.zeros((2, end - begin), dtype=np.float32)
    covered = np.zeros(end - begin, dtype=bool)
    resampler = av.AudioResampler(format="fltp", layout="stereo", rate=rate)
    with av.open(str(file)) as source:
        streams = list(source.streams.audio)
        if not streams:
            raise ValueError("Keine Audiospur vorhanden.")
        if audio_stream is None:
            matches = [i for i, s in enumerate(streams) if s.metadata.get("language", "").lower() in LANGUAGES.get(language, set())]
            if len(matches) == 1:
                audio_stream = matches[0]
            elif len(streams) == 1 and (language is None or streams[0].metadata.get("language", "und").lower() in {"und", "", *LANGUAGES[language]}):
                audio_stream = 0
            else:
                raise ValueError("Tonspur nicht eindeutig; audioStream als nullbasierten Audio-Index angeben.")
        if not 0 <= audio_stream < len(streams):
            raise ValueError("Ungültiger Audio-Index.")
        stream = streams[audio_stream]
        offset = float((stream.start_time or 0) * stream.time_base)
        seeking = start > 30
        if seeking:
            source.seek(round((start + offset - 0.25) * av.time_base), backward=True)
        cursor = None

        def consume(frame):
            nonlocal cursor
            if frame.time is None and seeking:
                raise ValueError("Quelle liefert nach dem Sprung keine verlässlichen Zeitstempel.")
            first = round((frame.time - offset) * rate) if frame.time is not None else (cursor or 0)
            # Containers such as Matroska round packet times to milliseconds.
            if cursor is not None and abs(first - cursor) <= round(0.005 * rate):
                first = cursor
            data = frame.to_ndarray()
            last = first + data.shape[1]
            cursor = last
            left, right = max(first, begin), min(last, end)
            if right > left:
                samples[:, left-begin:right-begin] = data[:, left-first:right-first]
                covered[left-begin:right-begin] = True
            return last >= end

        done = False
        for frame in source.decode(audio=audio_stream):
            for converted in resampler.resample(frame):
                if consume(converted):
                    done = True
                    break
            if done:
                break
        if not done:
            for converted in resampler.resample(None):
                if consume(converted):
                    break
        selected_language = stream.metadata.get("language", "und")
    if not covered.all():
        raise ValueError("Ausschnitt ist nicht vollständig verfügbar (Dauer/Zeitstempel prüfen).")
    if not np.all(np.isfinite(samples)):
        raise ValueError("Ungültige Samples.")
    samples -= samples.mean(axis=1, keepdims=True)
    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(samples.astype(np.float64) ** 2)))
    if peak < 0.0001 or rms < 0.000001:
        raise ValueError("Stummer Ausschnitt.")
    gain = min(0.1 / rms, 10 ** (-1 / 20) / peak)
    samples *= gain
    fade = min(round(rate * 0.005), samples.shape[1] // 2)
    samples[:, :fade] *= np.linspace(0, 1, fade)
    samples[:, -fade:] *= np.linspace(1, 0, fade)
    pcm = np.rint(samples.T.reshape(-1) * 32767).astype("<i2")
    output = Path(out)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("xb") as file_out:
        with wave.open(file_out, "wb") as dest:
            dest.setnchannels(2)
            dest.setsampwidth(2)
            dest.setframerate(rate)
            dest.writeframes(pcm.tobytes())
    return {"file": str(output.resolve()), "duration": samples.shape[1] / rate,
            "gainDb": 20 * math.log10(gain), "peak": float(np.max(np.abs(samples))),
            "audioStream": audio_stream, "taggedLanguage": selected_language}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True)
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--length", type=float, required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--language", choices=["de", "en"])
    parser.add_argument("--audio-stream", type=int)
    args = parser.parse_args()
    try:
        print(json.dumps(prepare_clip(args.file, args.start, args.length, args.out, args.language, args.audio_stream)))
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
