"""Synthetic extraction/stream-selection/cache tests; no system audio capture."""
import json
from fractions import Fraction
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import wave
import av
import numpy as np
from process_audio import prepare_clip


class WorkflowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base = Path.cwd().resolve() / ".local/filmaufnahme/workflow-tests"
        base.mkdir(parents=True, exist_ok=True)
        cls.work = Path(tempfile.mkdtemp(prefix="case-", dir=base))
        cls.media = cls.work / "two-languages.mkv"
        rate, count = 44100, 44100 * 46
        with av.open(str(cls.media), "w", format="matroska") as output:
            streams = [output.add_stream("pcm_s16le", rate=rate) for _ in range(2)]
            for stream, language in zip(streams, ["deu", "eng"]):
                stream.layout = "mono"
                stream.metadata["language"] = language
            for start in range(0, count, 4096):
                times = np.arange(start, min(start + 4096, count)) / rate
                for stream, frequency in zip(streams, [440, 880]):
                    data = np.rint(5000 * np.sin(2 * np.pi * frequency * times)).astype(np.int16)[None, :]
                    frame = av.AudioFrame.from_ndarray(data, format="s16", layout="mono")
                    frame.sample_rate, frame.pts, frame.time_base = rate, start, Fraction(1, rate)
                    for packet in stream.encode(frame):
                        output.mux(packet)
            for stream in streams:
                for packet in stream.encode(None):
                    output.mux(packet)

    def test_seek_and_language_selection(self):
        for language, frequency in [("de", 440), ("en", 880)]:
            output = self.work / (language + ".wav")
            result = prepare_clip(self.media, 42.25, 2, output, language)
            self.assertAlmostEqual(result["duration"], 2)
            with wave.open(str(output)) as wav:
                self.assertEqual(wav.getnframes(), 88200)
                pcm = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").reshape(-1, 2)[:, 0] / 32767
            detected = np.argmax(np.abs(np.fft.rfft(pcm))) * 44100 / len(pcm)
            self.assertAlmostEqual(detected, frequency, delta=1)
            self.assertLessEqual(float(np.max(np.abs(pcm))), 0.892)
        with self.assertRaises(FileExistsError):
            prepare_clip(self.media, 42.25, 2, self.work / "en.wav", "en")

    def test_batch_is_cached_and_does_not_approve(self):
        plan = self.work / "plan.json"
        track = {"file": str(self.media), "start": 40, "length": 2, "verified": True}
        data = {"version": 1, "entries": [{"sourceId": 1, "de": track, "en": track}]}
        original = json.dumps(data)
        plan.write_text(original, encoding="utf-8")
        command = [sys.executable, str(Path(__file__).with_name("prepare_batch.py")), "--plan", str(plan), "--entries", "1"]
        first = subprocess.run(command, check=True, capture_output=True, text=True)
        prepared = Path(json.loads(first.stdout)["plan"])
        result = json.loads(prepared.read_text(encoding="utf-8"))
        for language in ("de", "en"):
            self.assertFalse(result["entries"][0][language]["verified"])
            self.assertTrue(Path(result["entries"][0][language]["file"]).is_file())
        second = subprocess.run(command, check=True, capture_output=True, text=True)
        self.assertEqual(json.loads(second.stdout)["status"], "cached")
        self.assertEqual(plan.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
