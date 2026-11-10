using System.IO;
using System.Text.Json.Nodes;
using System.Windows.Interop;
using System.Windows;
using System.Windows.Controls;
using Hitster.Recorder;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

static class Program
{
    static int passed;
    static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
    static void Throws(Action action) { try { action(); } catch { return; } throw new Exception("Expected failure"); }
    static void Test(string name, Action test) { test(); passed++; Console.WriteLine("PASS " + name); }
    static readonly CardDetails Details = new("Zurück in die Zukunft", 1985, "Der DeLorean startet", "01:12:34");
    [STAThread]
    static int Main(string[] args)
    {
        var root = Path.Combine(Environment.CurrentDirectory, ".local", "recorder-tests-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var source = Path.Combine(root, "source.wav"); File.WriteAllBytes(source, [1]);
            var clip = new AudioClip(source, 8, []) { Start = 1, End = 4 };
            string NewProject(string name)
            {
                var project = Path.Combine(root, name);
                Directory.CreateDirectory(Path.Combine(project, "variants", "film", "audio"));
                File.WriteAllText(Path.Combine(project, "variants.json"), "[]");
                File.WriteAllText(CardStore.CardFile(project), "[{\"id\":\"001\",\"custom\":\"keep me\"}]");
                return project;
            }
            void Export(AudioClip _, string path) => File.WriteAllBytes(path, [1, 2, 3]);
            Test("Bilingual save preserves existing cards, metadata, filenames and backup", () =>
            {
                var project = NewProject("save");
                Assert(CardStore.Save(project, Details, clip, clip, Export) == "002", "Wrong ID");
                var cards = JsonNode.Parse(File.ReadAllText(CardStore.CardFile(project)))!.AsArray();
                Assert(cards.Count == 2 && (string?)cards[0]!["custom"] == "keep me", "Existing card changed");
                Assert((string?)cards[1]!["answer"]!["title"] == Details.Title, "Unicode title lost");
                Assert((string?)cards[1]!["tracks"]!["en"] == "audio/002-en.mp3", "English track missing");
                Assert((string?)cards[1]!["file"] == "audio/002-de.mp3", "German default missing");
                Assert(File.Exists(Path.Combine(project, "variants/film/audio/002-de.mp3")), "No German MP3");
                Assert(File.Exists(CardStore.CardFile(project) + ".bak"), "No backup");
                Assert(CardStore.Save(project, Details, clip, clip, Export) == "003", "Repeated save ID collision");
            });
            Test("Failed second export leaves no card, MP3 or temporary files", () =>
            {
                var project = NewProject("rollback"); var before = File.ReadAllText(CardStore.CardFile(project)); int calls = 0;
                Throws(() => CardStore.Save(project, Details, clip, clip, (_, path) => { if (++calls == 2) throw new IOException("Disk full"); Export(clip, path); }));
                Assert(File.ReadAllText(CardStore.CardFile(project)) == before, "JSON changed on failure");
                Assert(!Directory.EnumerateFiles(Path.Combine(project, "variants/film/audio")).Any(), "Orphaned MP3");
            });
            Test("External edits survive and abort the transaction", () =>
            {
                var project = NewProject("conflict");
                Throws(() => CardStore.Save(project, Details, clip, clip, (_, path) => { Export(clip, path); File.WriteAllText(CardStore.CardFile(project), "[]"); }));
                Assert(File.ReadAllText(CardStore.CardFile(project)) == "[]", "External changes overwritten");
                Assert(!Directory.EnumerateFiles(Path.Combine(project, "variants/film/audio")).Any(), "Orphaned files");
            });
            Test("Existing unreferenced audio is never overwritten", () =>
            {
                var project = NewProject("occupied");
                File.WriteAllText(Path.Combine(project, "variants/film/audio/002-en.mp3"), "original");
                Assert(CardStore.Save(project, Details, clip, clip, Export) == "003", "Occupied ID reused");
            });
            Test("Validation rejects missing data, invalid time and out-of-range cuts", () =>
            {
                Throws(() => (Details with { Timestamp = "01:99:00" }).Validate());
                Throws(() => (Details with { Scene = " " }).Validate());
                Throws(() => (Details with { Year = 42 }).Validate());
                Throws(() => new AudioClip(source, 80, []) { Start = 0, End = 60 }.Validate());
                Throws(() => new AudioClip(source, 8, []) { Start = 2, End = 1 }.Validate());
                Throws(() => new AudioClip(source, 8, []) { Start = double.NaN, End = 4 }.Validate());
            });
            Test("A second recorder cannot write while the project is locked", () =>
            {
                var project = NewProject("locked");
                using var held = new FileStream(CardStore.CardFile(project) + ".recorder.lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
                Throws(() => CardStore.Save(project, Details, clip, clip, Export));
            });
            Test("Real Windows MP3 encoding preserves a trimmed stereo clip", () =>
            {
                var wav = Path.Combine(root, "tone.wav");
                WaveFileWriter.CreateWaveFile16(wav, new SignalGenerator(48000, 2) { Frequency = 440, Gain = 0.1 }.Take(TimeSpan.FromSeconds(4)));
                var audio = AudioService.Inspect(wav); audio.Start = 0.75; audio.End = 3.25;
                audio.Validate();
                var mp3 = Path.Combine(root, "tone.mp3"); AudioService.ExportMp3(audio, mp3);
                using var decoded = new AudioFileReader(mp3);
                Assert(Math.Abs(decoded.TotalTime.TotalSeconds - 2.5) < 0.15, "Incorrect MP3 duration: " + decoded.TotalTime);
                Assert(AudioService.Inspect(mp3).Peaks.Max() > 0.01, "MP3 contains silence");
            });
            Test("Surround dialogue in the center channel survives MP3 downmixing", () =>
            {
                var wav = Path.Combine(root, "surround.wav");
                var surround = new MultiplexingSampleProvider(new ISampleProvider[] {
                    new SignalGenerator(48000, 1) { Gain = 0 }.Take(TimeSpan.FromSeconds(3)),
                    new SignalGenerator(48000, 1) { Gain = 0.2, Frequency = 660 }.Take(TimeSpan.FromSeconds(3)) }, 6);
                for (int c = 0; c < 6; c++) surround.ConnectInputToOutput(c == 2 ? 1 : 0, c);
                WaveFileWriter.CreateWaveFile16(wav, surround);
                var audio = AudioService.Inspect(wav);
                var mp3 = Path.Combine(root, "surround.mp3"); AudioService.ExportMp3(audio, mp3);
                Assert(AudioService.Inspect(mp3).Peaks.Max() > 0.01, "Center channel lost");
            });
            if (args.Contains("--windows-smoke"))
            {
                Test("WPF editor trims with both sliders and plays, pauses and resets the selection", () =>
                {
                    var application = new App(); application.InitializeComponent();
                    using var editor = new TrackEditor();
                    editor.SetClip(AudioService.Inspect(Path.Combine(root, "tone.wav")));
                    var start = (Slider)editor.FindName("StartSlider");
                    var end = (Slider)editor.FindName("EndSlider");
                    var play = (Button)editor.FindName("PlayButton");
                    start.Value = 0.5; end.Value = 2.5;
                    Assert(editor.Recording!.Start == 0.5 && editor.Recording.End == 2.5, "Slider cut was not applied");
                    play.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    Assert((string)play.Content == "Ⅱ  Pause", "Playback did not start");
                    play.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                    Assert((string)play.Content == "▶  Fortsetzen", "Playback did not pause");
                    start.Value = 0.6;
                    Assert((string)play.Content == "▶  Abspielen", "Trim did not reset playback");
                    editor.SetBusy(true); Assert(!play.IsEnabled && !start.IsEnabled && !end.IsEnabled, "Busy controls are active");
                    editor.SetClip(null); Assert(!play.IsEnabled && editor.Recording == null, "New card did not clear the track");
                });
                Test("Global Windows hotkey registration and conflict detection", () =>
                {
                    using var first = new HwndSource(new HwndSourceParameters("Hitster hotkey test") { Width = 1, Height = 1 });
                    using var second = new HwndSource(new HwndSourceParameters("Hitster conflict test") { Width = 1, Height = 1 });
                    using var hotkey = new GlobalHotkey(first.Handle);
                    using var conflict = new GlobalHotkey(second.Handle);
                    var settings = new RecorderSettings { HotkeyKey = "F24", Control = true, Alt = true, Shift = true };
                    hotkey.Register(settings);
                    Throws(() => conflict.Register(settings));
                    hotkey.Dispose();
                    conflict.Register(settings);
                });
                Test("Real WASAPI loopback start/stop writes a valid timed WAV", () =>
                {
                    var wav = Path.Combine(root, "loopback.wav");
                    using var capture = new AudioService();
                    Assert(AudioService.Devices().Count > 1, "No active output device");
                    capture.Start("", wav);
                    Thread.Sleep(1200);
                    capture.Stop();
                    var task = capture.RecordingTask!;
                    Assert(task.Wait(TimeSpan.FromSeconds(10)), "Capture did not stop");
                    using var reader = new WaveFileReader(task.Result);
                    Assert(reader.TotalTime.TotalSeconds > 0.7, "No audio clock or WAV data");
                });
            }
            Console.WriteLine($"{passed} tests passed."); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        finally { Directory.Delete(root, true); }
    }
}
