using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace Hitster.Recorder;

public partial class TrackEditor : UserControl, IDisposable
{
    public AudioClip? Recording { get; private set; }
    public event Action? RecordRequested;
    public event Action? PreviewRequested;
    public event Action? Changed;
    private WaveOutEvent? output;
    private AudioFileReader? reader;
    private bool updating;
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(100) };
    public TrackEditor()
    {
        InitializeComponent();
        timer.Tick += (_, _) =>
        {
            if (output?.PlaybackState == PlaybackState.Stopped) StopPreview();
            else if (reader != null && Recording != null) SelectionInfo.Text = $"{Format(reader.CurrentTime.TotalSeconds - Recording.Start)} / {Format(Recording.Length)}";
        };
    }
    public void Configure(string title) => Heading.Text = title;
    public void SetClip(AudioClip? clip)
    {
        StopPreview(); updating = true; Recording = clip;
        if (clip != null)
        {
            StartSlider.Minimum = 0; StartSlider.Maximum = clip.Duration - 0.05;
            EndSlider.Minimum = 0; EndSlider.Maximum = clip.Duration;
            StartSlider.Value = clip.Start; EndSlider.Value = clip.End;
            StartSlider.Maximum = clip.End - 0.05; EndSlider.Minimum = clip.Start + 0.05;
        }
        State.Text = clip == null ? "Noch keine Aufnahme" : $"{Format(clip.Duration)} aufgenommen · MP3 gesichert";
        RecordButton.Content = clip == null ? "Aufnehmen" : "Neu aufnehmen";
        updating = false;
        SetBusy(false); UpdateLabels(); DrawWaveform(); Changed?.Invoke();
    }
    public void SetBusy(bool busy)
    {
        RecordButton.IsEnabled = !busy;
        PlayButton.IsEnabled = RewindButton.IsEnabled = StartSlider.IsEnabled = EndSlider.IsEnabled = !busy && Recording != null;
    }
    private void Record_Click(object sender, RoutedEventArgs e) => RecordRequested?.Invoke();
    private void Trim_Changed(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (updating || Recording == null) return;
        StopPreview(); updating = true;
        Recording.Start = StartSlider.Value; Recording.End = EndSlider.Value;
        StartSlider.Maximum = Recording.End - 0.05; EndSlider.Minimum = Recording.Start + 0.05;
        updating = false; UpdateLabels(); DrawWaveform(); Changed?.Invoke();
    }
    private void UpdateLabels()
    {
        if (StartTime == null) return;
        StartTime.Text = Format(Recording?.Start ?? 0); EndTime.Text = Format(Recording?.End ?? 0);
        SelectionInfo.Text = Recording == null ? "Ausschnitt: —" : $"Ausschnitt: {Recording.Length:0.00} s";
        SelectionInfo.Foreground = new SolidColorBrush(Recording != null && (Recording.Length <= 1 || Recording.Length >= 60) ? Color.FromRgb(185, 65, 65) : Color.FromRgb(109, 116, 139));
    }
    private void Play_Click(object sender, RoutedEventArgs e)
    {
        if (Recording == null) return;
        try
        {
            if (output?.PlaybackState == PlaybackState.Playing) { output.Pause(); PlayButton.Content = "▶  Fortsetzen"; return; }
            if (output?.PlaybackState == PlaybackState.Paused) { output.Play(); PlayButton.Content = "Ⅱ  Pause"; return; }
            PreviewRequested?.Invoke(); StopPreview();
            reader = new AudioFileReader(Recording.SourcePath) { CurrentTime = TimeSpan.FromSeconds(Recording.Start) };
            var segment = new OffsetSampleProvider(reader) { Take = TimeSpan.FromSeconds(Recording.Length) };
            output = new WaveOutEvent(); output.Init(segment); output.Play();
            PlayButton.Content = "Ⅱ  Pause"; timer.Start();
        }
        catch (Exception error) { StopPreview(); MessageBox.Show(error.Message, "Vorhören nicht möglich"); }
    }
    private void Rewind_Click(object sender, RoutedEventArgs e) => StopPreview();
    public void StopPreview()
    {
        timer.Stop(); output?.Stop(); output?.Dispose(); output = null;
        reader?.Dispose(); reader = null;
        if (PlayButton != null) { PlayButton.Content = "▶  Abspielen"; UpdateLabels(); }
    }
    private void Waveform_SizeChanged(object sender, SizeChangedEventArgs e) => DrawWaveform();
    private void DrawWaveform()
    {
        Waveform.Children.Clear();
        var width = Waveform.ActualWidth;
        if (width <= 0) return;
        var mid = Waveform.Height / 2;
        if (Recording == null)
        {
            Waveform.Children.Add(new Line { X1 = 0, X2 = width, Y1 = mid, Y2 = mid, Stroke = Brushes.LightGray }); return;
        }
        for (int i = 0; i < Recording.Peaks.Length; i++)
        {
            double second = (double)i / Recording.Peaks.Length * Recording.Duration;
            double height = Math.Max(1, Math.Min(1, Recording.Peaks[i]) * (mid - 4));
            Waveform.Children.Add(new Line
            {
                X1 = i * width / Recording.Peaks.Length, X2 = i * width / Recording.Peaks.Length,
                Y1 = mid - height, Y2 = mid + height, StrokeThickness = 1,
                Stroke = new SolidColorBrush(second >= Recording.Start && second <= Recording.End ? Color.FromRgb(99, 81, 206) : Color.FromRgb(199, 200, 214))
            });
        }
    }
    private static string Format(double seconds) => $"{(int)seconds / 60:00}:{seconds % 60:00.00}";
    public void Dispose() => StopPreview();
}
