using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Threading;

namespace Hitster.Recorder;

public partial class MainWindow : Window
{
    private RecorderSettings settings = RecorderSettings.Load();
    private readonly AudioService audio = new();
    private GlobalHotkey? hotkey;
    private bool busy, saved;
    private string? recordingLanguage;
    private readonly Stopwatch clock = new();
    private readonly DispatcherTimer timer = new() { Interval = TimeSpan.FromMilliseconds(100) };
    private string? sessionFolder;
    public MainWindow()
    {
        InitializeComponent();
        German.Configure("01 / Deutsch"); English.Configure("02 / Englisch");
        German.RecordRequested += () => BeginRecording("de");
        English.RecordRequested += () => BeginRecording("en");
        German.PreviewRequested += English.StopPreview;
        English.PreviewRequested += German.StopPreview;
        German.Changed += Refresh; English.Changed += Refresh;
        SourceInitialized += (_, _) =>
        {
            hotkey = new GlobalHotkey(new WindowInteropHelper(this).Handle);
            hotkey.Pressed += ToggleRecording;
            try { hotkey.Register(settings); }
            catch (Exception error) { Status.Text = error.Message + " Einstellungen öffnen, um den Hotkey zu ändern."; }
        };
        timer.Tick += (_, _) =>
        {
            RecordingTime.Text = clock.Elapsed.ToString(@"mm\:ss");
            if (clock.Elapsed.TotalMinutes >= 10 && audio.IsRecording && !busy) ToggleRecording();
        };
        Refresh();
    }
    private void Refresh()
    {
        if (!IsInitialized) return;
        HotkeyLabel.Text = "Start / Stopp: " + settings.HotkeyLabel;
        ProjectLabel.Text = string.IsNullOrWhiteSpace(settings.ProjectPath) ? "Projektordner bitte in den Einstellungen auswählen." : settings.ProjectPath;
        bool locked = busy || audio.IsRecording;
        SettingsButton.IsEnabled = !locked;
        German.SetBusy(locked || saved); English.SetBusy(locked || German.Recording == null || saved);
        SaveButton.IsEnabled = !locked && !saved && German.Recording != null && English.Recording != null;
        if (audio.IsRecording)
        {
            StepTitle.Text = recordingLanguage == "de" ? "● Deutsche Aufnahme läuft" : "● Englische Aufnahme läuft";
            StepHint.Text = "Mit demselben Hotkey beenden. Maximal 10 Minuten pro Aufnahme.";
            RecordButton.Content = "■  Aufnahme beenden";
            RecordButton.IsEnabled = !busy;
        }
        else
        {
            bool germanNext = German.Recording == null;
            StepTitle.Text = saved ? "Karte gespeichert" : germanNext ? "01 · Deutsche Tonspur aufnehmen" : English.Recording == null ? "02 · Englische Tonspur aufnehmen" : "03 · Zuschneiden und Karte speichern";
            StepHint.Text = saved ? "Mit „Neue Karte“ die nächste Szene vorbereiten." : germanNext ? "Film auf Deutsch abspielen. Der Hotkey startet und stoppt die Aufnahme." : English.Recording == null ? "Film im Browser auf Englisch umstellen und zur gleichen Szene zurückspulen. Dann erneut aufnehmen." : "Beide Ausschnitte mit Start und Ende wählen, vorhören und die Filmdaten ergänzen.";
            RecordButton.Content = germanNext ? "●  Deutsch aufnehmen" : "●  Englisch aufnehmen";
            RecordButton.IsEnabled = !busy && !saved && (German.Recording == null || English.Recording == null);
        }
    }
    private void Record_Click(object sender, RoutedEventArgs e) => ToggleRecording();
    private void ToggleRecording()
    {
        if (busy || saved || OwnedWindows.Count > 0) return;
        if (audio.IsRecording)
        {
            try { busy = true; audio.Stop(); }
            catch (Exception error) { busy = false; Status.Text = "Aufnahme konnte nicht beendet werden: " + error.Message; }
            Refresh(); return;
        }
        if (German.Recording == null) BeginRecording("de");
        else if (English.Recording == null) BeginRecording("en");
    }
    private async void BeginRecording(string language)
    {
        if (busy || audio.IsRecording || saved || (language == "en" && German.Recording == null)) return;
        German.StopPreview(); English.StopPreview();
        TrackEditor editor = language == "de" ? German : English;
        try
        {
            if (sessionFolder == null)
            {
                sessionFolder = Path.Combine(RecorderSettings.DataDirectory, "recordings", DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N")[..8]);
                Directory.CreateDirectory(sessionFolder);
            }
            var path = Path.Combine(sessionFolder, language + "-" + Guid.NewGuid().ToString("N") + ".wav");
            recordingLanguage = language;
            audio.Start(settings.DeviceId, path);
            clock.Restart(); timer.Start();
            Status.Text = language == "de" ? "Deutsch wird aufgenommen …" : "Englisch wird aufgenommen …";
            Refresh();
            // Also observes unexpected device loss without waiting for another hotkey.
            await audio.RecordingTask!;
            busy = true; timer.Stop(); clock.Stop(); Refresh();
            Status.Text = "Aufnahme wird geprüft und automatisch als MP3 gesichert …";
            var clip = await Task.Run(() =>
            {
                var result = AudioService.Inspect(path);
                AudioService.ExportMp3(result, Path.ChangeExtension(path, ".mp3"));
                return result;
            });
            editor.SetClip(clip);
            Status.Text = language == "de" ? "Deutsch gesichert. Jetzt im Browser Englisch wählen und die gleiche Szene aufnehmen." : "Beide Tonspuren gesichert. Ausschnitte zuschneiden und Filmdaten eintragen.";
            if (language == "en") { if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal; Activate(); }
        }
        catch (Exception error)
        {
            Status.Text = "Aufnahme fehlgeschlagen: " + error.Message;
            MessageBox.Show(this, error.Message + "\nVorherige erfolgreiche Aufnahmen bleiben erhalten.", "Aufnahme nicht möglich", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
        finally { timer.Stop(); clock.Stop(); busy = false; recordingLanguage = null; Refresh(); }
    }
    private async void Save_Click(object sender, RoutedEventArgs e)
    {
        if (busy || audio.IsRecording || saved || German.Recording == null || English.Recording == null) return;
        German.StopPreview(); English.StopPreview();
        try
        {
            if (!int.TryParse(FilmYear.Text, out var year)) throw new InvalidOperationException("Bitte ein Erscheinungsjahr eingeben.");
            var details = new CardDetails(FilmTitle.Text, year, Scene.Text, Timestamp.Text.Trim());
            details.Validate(); German.Recording.Validate(); English.Recording.Validate();
            CardStore.ValidateProject(settings.ProjectPath);
            busy = true; Refresh(); Status.Text = "Beide MP3s werden zugeschnitten und die Karte wird gespeichert …";
            var id = await Task.Run(() => CardStore.Save(settings.ProjectPath, details, German.Recording, English.Recording, AudioService.ExportMp3));
            saved = true;
            Status.Text = $"Karte {id} gespeichert · audio/{id}-de.mp3 und audio/{id}-en.mp3. Bereit für die nächste Karte.";
        }
        catch (Exception error) { Status.Text = "Speichern fehlgeschlagen: " + error.Message; MessageBox.Show(this, error.Message, "Karte nicht gespeichert", MessageBoxButton.OK, MessageBoxImage.Warning); }
        finally { busy = false; Refresh(); }
    }
    private void Settings_Click(object sender, RoutedEventArgs e)
    {
        if (busy || audio.IsRecording) return;
        German.StopPreview(); English.StopPreview();
        var dialog = new SettingsWindow(settings, candidate =>
        {
            try { hotkey!.Register(candidate); candidate.Save(); }
            catch { hotkey!.Register(settings); throw; }
            settings = candidate;
        }) { Owner = this };
        dialog.ShowDialog(); Refresh();
    }
    private void New_Click(object sender, RoutedEventArgs e)
    {
        if (busy || audio.IsRecording) return;
        if (!saved && (German.Recording != null || English.Recording != null || !string.IsNullOrWhiteSpace(FilmTitle.Text)) && MessageBox.Show(this, "Die aktuelle Karte wurde noch nicht im Projekt gespeichert. Neue Karte beginnen? Die Rohaufnahmen bleiben lokal erhalten.", "Neue Karte", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        saved = false; sessionFolder = null;
        German.SetClip(null); English.SetClip(null);
        FilmTitle.Clear(); FilmYear.Clear(); Scene.Clear(); Timestamp.Clear();
        RecordingTime.Text = "00:00"; Status.Text = "Bereit für die deutsche Aufnahme."; Refresh();
    }
    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (busy || audio.IsRecording) { e.Cancel = true; Status.Text = "Bitte zuerst die Aufnahme beenden und die Verarbeitung abwarten."; return; }
        if (!saved && (German.Recording != null || English.Recording != null) && MessageBox.Show(this, "Die Karte ist noch nicht im Projekt gespeichert. Trotzdem schließen? Die Rohaufnahmen bleiben im lokalen Aufnahmeordner erhalten.", "Hitster schließen", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) { e.Cancel = true; return; }
        timer.Stop(); German.Dispose(); English.Dispose(); audio.Dispose(); hotkey?.Dispose();
    }
}
