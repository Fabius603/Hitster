using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Hitster.Recorder;

public static class CardStore
{
    public static string CardFile(string project) => Path.Combine(Path.GetFullPath(project), "variants", "film", "cards.json");
    public static void ValidateProject(string project)
    {
        if (string.IsNullOrWhiteSpace(project) || !File.Exists(CardFile(project)) || !File.Exists(Path.Combine(project, "variants.json")))
            throw new InvalidOperationException("Bitte in den Einstellungen den Hitster-Projektordner mit variants.json und variants/film/cards.json wählen.");
        _ = ReadCards(CardFile(project));
    }
    private static JsonArray ReadCards(string path) => JsonNode.Parse(File.ReadAllText(path)) as JsonArray
        ?? throw new InvalidDataException("cards.json muss eine Kartenliste enthalten.");

    public static string Save(string project, CardDetails details, AudioClip german, AudioClip english,
        Action<AudioClip, string> export)
    {
        details.Validate(); german.Validate(); english.Validate(); ValidateProject(project);
        var cardFile = CardFile(project);
        // Held across ID allocation, both exports and the atomic JSON replacement.
        using var projectLock = new FileStream(cardFile + ".recorder.lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.DeleteOnClose);
        var original = File.ReadAllText(cardFile);
        var cards = ReadCards(cardFile);
        var audio = Path.Combine(Path.GetDirectoryName(cardFile)!, "audio");
        Directory.CreateDirectory(audio);
        var ids = cards.Select(c => c?["id"]?.GetValue<string>()).ToHashSet();
        var number = 1;
        string id;
        do { id = (number++).ToString("D3"); }
        while (ids.Contains(id) || Directory.EnumerateFiles(audio, id + "*").Any());
        var de = Path.Combine(audio, id + "-de.mp3");
        var en = Path.Combine(audio, id + "-en.mp3");
        var token = Guid.NewGuid().ToString("N");
        var stageDe = Path.Combine(audio, $".recording-{token}-de.mp3");
        var stageEn = Path.Combine(audio, $".recording-{token}-en.mp3");
        var stageJson = cardFile + "." + token + ".tmp";
        bool movedDe = false, movedEn = false;
        try
        {
            export(german, stageDe); export(english, stageEn);
            if (new FileInfo(stageDe).Length == 0 || new FileInfo(stageEn).Length == 0)
                throw new InvalidDataException("Der MP3-Export ist leer. Die Karte wurde nicht angelegt.");
            cards.Add(new JsonObject
            {
                ["id"] = id, ["type"] = "audio", ["file"] = $"audio/{id}-de.mp3",
                ["tracks"] = new JsonObject { ["de"] = $"audio/{id}-de.mp3", ["en"] = $"audio/{id}-en.mp3" },
                ["description"] = details.Scene.Trim(),
                ["answer"] = new JsonObject
                {
                    ["title"] = details.Title.Trim(), ["year"] = details.Year,
                    ["scene"] = details.Scene.Trim(), ["timestamp"] = details.Timestamp.Trim()
                }
            });
            File.WriteAllText(stageJson, cards.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) + Environment.NewLine);
            // Detect changes made by an editor which does not use our lock.
            if (File.ReadAllText(cardFile) != original)
                throw new IOException("cards.json wurde zwischenzeitlich geändert. Bitte erneut speichern.");
            File.Move(stageDe, de); movedDe = true;
            File.Move(stageEn, en); movedEn = true;
            File.Replace(stageJson, cardFile, cardFile + ".bak");
            return id;
        }
        catch
        {
            if (movedDe) File.Delete(de);
            if (movedEn) File.Delete(en);
            throw;
        }
        finally
        {
            foreach (var path in new[] { stageDe, stageEn, stageJson }) if (File.Exists(path)) File.Delete(path);
        }
    }
}
