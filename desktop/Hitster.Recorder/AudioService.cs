using System.IO;
using NAudio.CoreAudioApi;
using NAudio.MediaFoundation;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace Hitster.Recorder;

public sealed record OutputDevice(string Id, string Name);

public sealed class AudioService : IDisposable
{
    private WasapiLoopbackCapture? capture;
    private WaveFileWriter? writer;
    private MMDevice? device;
    private WasapiOut? silence;
    private TaskCompletionSource<string>? completion;
    private string recordingPath = "";
    public bool IsRecording => capture != null;
    public Task<string>? RecordingTask => completion?.Task;
    public static List<OutputDevice> Devices()
    {
        using var enumerator = new MMDeviceEnumerator();
        var result = new List<OutputDevice> { new("", "Windows-Standardausgabe") };
        foreach (var endpoint in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        {
            using (endpoint) result.Add(new(endpoint.ID, endpoint.FriendlyName));
        }
        return result;
    }
    public void Start(string deviceId, string path)
    {
        if (IsRecording) throw new InvalidOperationException("Es läuft bereits eine Aufnahme.");
        using var enumerator = new MMDeviceEnumerator();
        device = string.IsNullOrEmpty(deviceId) ? enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia) : enumerator.GetDevice(deviceId);
        recordingPath = path;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            capture = new WasapiLoopbackCapture(device);
            writer = new WaveFileWriter(path, capture.WaveFormat);
            capture.DataAvailable += (_, args) => writer!.Write(args.Buffer, 0, args.BytesRecorded);
            capture.RecordingStopped += (_, args) =>
            {
                try { ReleaseCapture(); }
                catch (Exception error) { completion.TrySetException(error); return; }
                if (args.Exception != null) completion.TrySetException(args.Exception);
                else completion.TrySetResult(recordingPath);
            };
            // Keep the endpoint clock running during silent scenes so timing remains intact.
            silence = new WasapiOut(device, AudioClientShareMode.Shared, false, 100);
            silence.Init(new SilenceProvider(capture.WaveFormat));
            silence.Play();
            capture.StartRecording();
        }
        catch { ReleaseCapture(); completion = null; throw; }
    }
    public void Stop() => capture?.StopRecording();
    private void ReleaseCapture()
    {
        writer?.Dispose(); writer = null;
        capture?.Dispose(); capture = null;
        silence?.Stop(); silence?.Dispose(); silence = null;
        device?.Dispose(); device = null;
    }
    public static AudioClip Inspect(string path)
    {
        using var reader = new AudioFileReader(path);
        if (reader.TotalTime.TotalSeconds <= 0.05) throw new InvalidDataException("Es wurde kein Ton empfangen. Bitte das Ausgabegerät prüfen.");
        const int bins = 600;
        var peaks = new float[bins];
        long sampleCount = reader.Length / sizeof(float);
        long position = 0;
        var buffer = new float[2048 * reader.WaveFormat.Channels];
        int read;
        while ((read = reader.Read(buffer, 0, buffer.Length)) > 0)
            for (int i = 0; i < read; i++, position++)
            {
                int bin = (int)Math.Min(bins - 1, position * bins / Math.Max(1, sampleCount));
                peaks[bin] = Math.Max(peaks[bin], Math.Abs(buffer[i]));
            }
        if (peaks.Max() < 0.0001f) throw new InvalidDataException("Die Aufnahme ist stumm. Bitte Browser, Ausgabegerät und Wiedergabe prüfen.");
        return new(path, reader.TotalTime.TotalSeconds, peaks);
    }
    public static void ExportMp3(AudioClip clip, string path)
    {
        using var reader = new AudioFileReader(clip.SourcePath);
        ISampleProvider samples = reader;
        samples = new OffsetSampleProvider(samples) { SkipOver = TimeSpan.FromSeconds(clip.Start), Take = TimeSpan.FromSeconds(clip.Length) };
        MediaFoundationApi.Startup();
        // Windows performs channel-aware downmixing (including dialogue in the center channel).
        using var resampler = new MediaFoundationResampler(new SampleToWaveProvider(samples), new WaveFormat(44100, 16, 2));
        MediaFoundationEncoder.EncodeToMp3(resampler, path, 192000);
    }
    public void Dispose() => ReleaseCapture();
}
