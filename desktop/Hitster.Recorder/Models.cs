using System.IO;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Hitster.Recorder;

public sealed record CardDetails(string Title, int Year, string Scene, string Timestamp)
{
    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(Title) || string.IsNullOrWhiteSpace(Scene))
            throw new InvalidOperationException("Bitte Filmtitel und Szene eintragen.");
        if (Year < 1888 || Year > DateTime.Now.Year + 5)
            throw new InvalidOperationException("Bitte ein gültiges Erscheinungsjahr eintragen.");
        if (!Regex.IsMatch(Timestamp, @"^\d{2,3}:[0-5]\d:[0-5]\d$"))
            throw new InvalidOperationException("Zeitpunkt im Film bitte als HH:MM:SS eingeben, z. B. 01:12:34.");
    }
}

public sealed record AudioClip(string SourcePath, double Duration, float[] Peaks)
{
    public double Start { get; set; }
    public double End { get; set; } = Duration;
    public double Length => End - Start;
    public void Validate()
    {
        if (!double.IsFinite(Start) || !double.IsFinite(End) || Start < 0 || End > Duration || Length <= 1 || Length >= 60)
            throw new InvalidOperationException("Bitte beide Ausschnitte auf mehr als 1 und weniger als 60 Sekunden zuschneiden.");
        if (!File.Exists(SourcePath)) throw new FileNotFoundException("Die Aufnahme fehlt.", SourcePath);
    }
}

public sealed class RecorderSettings
{
    public string ProjectPath { get; set; } = FindProject();
    public string DeviceId { get; set; } = "";
    public string HotkeyKey { get; set; } = "F9";
    public bool Control { get; set; } = true;
    public bool Alt { get; set; }
    public bool Shift { get; set; } = true;
    public bool Windows { get; set; }
    public static string DataDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HitsterRecorder");
    public static string SettingsPath => Path.Combine(DataDirectory, "settings.json");
    public string HotkeyLabel => string.Join(" + ", new[] { Control ? "Strg" : null, Alt ? "Alt" : null, Shift ? "Umschalt" : null, Windows ? "Win" : null, HotkeyKey }.Where(x => x != null));
    public static RecorderSettings Load()
    {
        try { return JsonSerializer.Deserialize<RecorderSettings>(File.ReadAllText(SettingsPath)) ?? new(); }
        catch (Exception e) when (e is IOException or JsonException or UnauthorizedAccessException) { return new(); }
    }
    public void Save()
    {
        Directory.CreateDirectory(DataDirectory);
        var temporary = SettingsPath + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temporary, SettingsPath, true);
    }
    private static string FindProject()
    {
        foreach (var start in new[] { Environment.CurrentDirectory, AppContext.BaseDirectory })
            for (var dir = new DirectoryInfo(start); dir != null; dir = dir.Parent)
                if (File.Exists(Path.Combine(dir.FullName, "variants", "film", "cards.json"))) return dir.FullName;
        return "";
    }
}
